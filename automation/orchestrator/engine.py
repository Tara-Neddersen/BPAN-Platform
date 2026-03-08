from __future__ import annotations

import json
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .io import AlertsWriter, AuditLogger, OutboxStatusWriter, PromptPackWriter, QueueWriter
from .models import DeployGate, OutboxItem, PromptDecision
from .outbox import OutboxStore, utc_now, utc_iso
from .parser import parse_coordination_doc
from .router import route
from .rules import RulesConfig, load_rules
from .state import EngineState, StateStore
from .transport import build_transport


@dataclass(slots=True)
class RunResult:
    run_id: str
    changed: bool
    decisions: list[PromptDecision]
    deploy_gate: DeployGate | None = None
    outbox_events: list[dict] = field(default_factory=list)
    alerts: list[str] = field(default_factory=list)


class OrchestratorEngine:
    def __init__(
        self,
        *,
        coordination_file: Path,
        state_file: Path,
        queue_dir: Path,
        audit_log_file: Path,
        rules_file: Path,
        prompt_pack_file: Path,
        outbox_file: Path,
        outbox_status_file: Path,
        alerts_file: Path,
        prompt_send_dir: Path,
    ) -> None:
        self.coordination_file = coordination_file
        self.state_store = StateStore(state_file)
        self.queue_writer = QueueWriter(queue_dir)
        self.audit_logger = AuditLogger(audit_log_file)
        self.prompt_pack_writer = PromptPackWriter(prompt_pack_file)
        self.outbox_store = OutboxStore(outbox_file)
        self.outbox_status_writer = OutboxStatusWriter(outbox_status_file)
        self.alerts_writer = AlertsWriter(alerts_file)

        self.state_file = state_file
        self.queue_dir = queue_dir
        self.audit_log_file = audit_log_file
        self.rules_file = rules_file
        self.prompt_pack_file = prompt_pack_file
        self.outbox_file = outbox_file
        self.outbox_status_file = outbox_status_file
        self.alerts_file = alerts_file
        self.prompt_send_dir = prompt_send_dir

    def _requires_approval(self, decision: PromptDecision, rules: RulesConfig) -> bool:
        reason = decision.reason.lower()
        prompt_lower = decision.prompt.lower()

        if rules.approval_rules.get("deployment_prompts", True) and "deploy" in reason:
            return True
        if rules.approval_rules.get("cross_scope_reassignment", True):
            if decision.source_agent is not None and decision.source_agent != decision.target_agent:
                return True
        if rules.approval_rules.get("destructive_keywords", True):
            for keyword in rules.high_risk_keywords:
                if keyword and keyword in prompt_lower:
                    return True
        return False

    def _write_prompt_file(self, item: OutboxItem) -> Path:
        self.prompt_send_dir.mkdir(parents=True, exist_ok=True)
        path = self.prompt_send_dir / f"{item.id}.txt"
        path.write_text(item.prompt_text + "\n", encoding="utf-8")
        return path

    def _build_alerts(self, *, deploy_gate: DeployGate | None, outbox: list[OutboxItem]) -> list[str]:
        alerts: list[str] = []
        if deploy_gate and not deploy_gate.ready:
            for reason in deploy_gate.reasons:
                if "No document changes detected" in reason:
                    continue
                alerts.append(f"Deploy gate blocked: {reason}")

        for item in outbox:
            if item.status == "failed":
                alerts.append(f"Outbox failed ({item.id}) agent={item.target_agent} reason={item.reason}: {item.last_error}")
            if item.status == "pending" and item.requires_approval and item.approval_token:
                alerts.append(f"Approval required ({item.id}) agent={item.target_agent} reason={item.reason}")
        return alerts

    def _enqueue_decisions(
        self,
        *,
        decisions: list[PromptDecision],
        run_id: str,
        outbox: list[OutboxItem],
        state: EngineState,
        rules: RulesConfig,
    ) -> list[dict]:
        events: list[dict] = []
        for decision in decisions:
            # compatibility queue output stays available
            if decision.queued:
                self.queue_writer.enqueue(decision)

            if self.outbox_store.is_duplicate(
                items=outbox,
                sent_history=state.sent_history,
                decision=decision,
                window_seconds=rules.dedupe_window_seconds,
            ):
                skipped = self.outbox_store.append_from_decision(
                    items=outbox,
                    decision=decision,
                    run_id=run_id,
                    requires_approval=False,
                    skip_reason=f"dedupe_window_active={rules.dedupe_window_seconds}s",
                )
                events.append({"event": "outbox_deduped", "outbox_id": skipped.id, "reason": decision.reason})
                continue

            requires_approval = self._requires_approval(decision, rules)
            skip_reason = decision.queue_hold_reason if not decision.queued else None
            item = self.outbox_store.append_from_decision(
                items=outbox,
                decision=decision,
                run_id=run_id,
                requires_approval=requires_approval,
                skip_reason=skip_reason,
            )
            events.append(
                {
                    "event": "outbox_enqueued",
                    "outbox_id": item.id,
                    "reason": item.reason,
                    "requires_approval": item.requires_approval,
                    "status": item.status,
                }
            )
        return events

    def _auto_send(
        self,
        *,
        outbox: list[OutboxItem],
        rules: RulesConfig,
        dry_run: bool,
        state: EngineState,
    ) -> list[dict]:
        events: list[dict] = []
        if rules.mode != "auto":
            return events
        if dry_run:
            return events

        transport = build_transport(rules.transport)
        for item in outbox:
            if not self.outbox_store.due_for_send(item):
                continue
            if item.requires_approval and item.approval_token:
                events.append({"event": "send_skipped_approval", "outbox_id": item.id})
                continue
            if item.status != "pending":
                continue

            prompt_file = self._write_prompt_file(item)
            result = transport.send(item=item, prompt_file=prompt_file, send_cmd_template=rules.send_cmd_template)
            if result.ok:
                self.outbox_store.mark_sent(item)
                state.sent_history.append(
                    {
                        "outbox_id": item.id,
                        "dedupe_key": item.dedupe_key,
                        "sent_at": utc_iso(),
                    }
                )
                events.append({"event": "send_success", "outbox_id": item.id})
                continue

            self.outbox_store.mark_failed_retry(item, result.error or "unknown send error", rules)
            if item.status == "failed":
                events.append({"event": "send_failed_terminal", "outbox_id": item.id, "error": item.last_error})
            else:
                events.append(
                    {
                        "event": "send_failed_retry_scheduled",
                        "outbox_id": item.id,
                        "error": item.last_error,
                        "next_attempt_at": item.next_attempt_at,
                    }
                )
        state.sent_history = state.sent_history[-2000:]
        return events

    def run_once(self, *, dry_run: bool = False) -> RunResult:
        run_id = str(uuid.uuid4())
        doc_text = self.coordination_file.read_text(encoding="utf-8")
        snapshot = parse_coordination_doc(doc_text)
        rules = load_rules(self.rules_file)
        state = self.state_store.load()
        outbox = self.outbox_store.load()

        decisions: list[PromptDecision] = []
        deploy_gate: DeployGate | None = None
        outbox_events: list[dict] = []

        if state.last_hash is None:
            state = EngineState(
                last_hash=snapshot.document_hash,
                agents=snapshot.agents,
                kickoff_sent=set(),
                sent_history=state.sent_history,
            )
            self.state_store.save(state)
            deploy_gate = DeployGate(
                ready=False,
                reasons=["Baseline snapshot initialized; no actions generated."],
                qa_agent_id=rules.qa_agent_id,
                migration_verifier_agent_id=rules.migration_verifier_agent_id,
            )
            alerts = self._build_alerts(deploy_gate=deploy_gate, outbox=outbox)
            self.prompt_pack_writer.write(decisions=[], deploy_gate=deploy_gate, alerts=alerts)
            self.outbox_status_writer.write(summary=self.outbox_store.summary(outbox), items=outbox)
            self.alerts_writer.write(alerts=alerts)
            self.audit_logger.log_run(
                run_id=run_id,
                doc_hash=snapshot.document_hash,
                changed=True,
                decisions=[],
                outbox_events=[],
                alerts=alerts,
            )
            return RunResult(run_id=run_id, changed=True, decisions=[], deploy_gate=deploy_gate, alerts=alerts)

        changed = snapshot.document_hash != state.last_hash
        if changed:
            outcome = route(snapshot, state, rules)
            decisions = outcome.decisions
            deploy_gate = outcome.deploy_gate

            outbox_events.extend(
                self._enqueue_decisions(
                    decisions=decisions,
                    run_id=run_id,
                    outbox=outbox,
                    state=state,
                    rules=rules,
                )
            )

            state.last_hash = snapshot.document_hash
            state.agents = snapshot.agents
            kickoff_sent = set(state.kickoff_sent)
            kickoff_sent.update(
                decision.target_agent
                for decision in decisions
                if decision.reason == "dependency_gate_opened"
            )
            state.kickoff_sent = kickoff_sent

        outbox_events.extend(self._auto_send(outbox=outbox, rules=rules, dry_run=dry_run, state=state))

        if deploy_gate is None:
            deploy_gate = DeployGate(
                ready=False,
                reasons=["No document changes detected; no new actions generated."],
                qa_agent_id=rules.qa_agent_id,
                migration_verifier_agent_id=rules.migration_verifier_agent_id,
            )

        alerts = self._build_alerts(deploy_gate=deploy_gate, outbox=outbox)
        self.prompt_pack_writer.write(decisions=decisions, deploy_gate=deploy_gate, alerts=alerts)
        self.outbox_status_writer.write(summary=self.outbox_store.summary(outbox), items=outbox)
        self.alerts_writer.write(alerts=alerts)
        self.outbox_store.save(outbox)
        self.state_store.save(state)

        self.audit_logger.log_run(
            run_id=run_id,
            doc_hash=snapshot.document_hash,
            changed=changed,
            decisions=decisions,
            outbox_events=outbox_events,
            alerts=alerts,
        )
        return RunResult(
            run_id=run_id,
            changed=changed,
            decisions=decisions,
            deploy_gate=deploy_gate,
            outbox_events=outbox_events,
            alerts=alerts,
        )

    def watch(self, *, poll_seconds: int = 10, dry_run: bool = False) -> None:
        while True:
            self.run_once(dry_run=dry_run)
            time.sleep(poll_seconds)

    def inspect_queue(self, agent: int | None = None, tail: int = 20) -> list[str]:
        if not self.queue_dir.exists():
            return []

        paths = sorted(self.queue_dir.glob("agent-*.jsonl"))
        if agent is not None:
            paths = [self.queue_dir / f"agent-{agent}.jsonl"]

        lines: list[str] = []
        for path in paths:
            if not path.exists():
                continue
            file_lines = path.read_text(encoding="utf-8").splitlines()
            lines.extend(file_lines[-tail:])
        return lines

    def queue_summary(self) -> list[str]:
        outbox = self.outbox_store.load()
        summary = self.outbox_store.summary(outbox)
        lines = [
            f"outbox_total={summary.total}",
            f"pending={summary.pending}",
            f"sent={summary.sent}",
            f"failed={summary.failed}",
            f"skipped={summary.skipped}",
            f"approval_required={summary.approval_required}",
        ]
        pending = [item for item in outbox if item.status == "pending"]
        for item in pending[:20]:
            lines.append(
                f"pending_id={item.id} agent={item.target_agent} reason={item.reason} retries={item.retries}"
            )
        return lines

    def approve_outbox_item(self, outbox_id: str) -> bool:
        outbox = self.outbox_store.load()
        item = self.outbox_store.approve(outbox, outbox_id)
        if not item:
            return False
        self.outbox_store.save(outbox)
        self.outbox_status_writer.write(summary=self.outbox_store.summary(outbox), items=outbox)
        return True

    def reject_outbox_item(self, outbox_id: str, reason: str) -> bool:
        outbox = self.outbox_store.load()
        item = self.outbox_store.reject(outbox, outbox_id, reason)
        if not item:
            return False
        self.outbox_store.save(outbox)
        self.outbox_status_writer.write(summary=self.outbox_store.summary(outbox), items=outbox)
        return True

    def inspect_outbox(self, *, tail: int = 50) -> list[str]:
        outbox = self.outbox_store.load()
        recent = outbox[-tail:]
        return [json.dumps(item.to_record(), sort_keys=True) for item in recent]

    def reset(self, *, reset_queues: bool, reset_audit: bool, reset_outbox: bool) -> None:
        self.state_store.reset()
        if reset_queues and self.queue_dir.exists():
            shutil.rmtree(self.queue_dir)
            self.queue_dir.mkdir(parents=True, exist_ok=True)
        if reset_audit and self.audit_log_file.exists():
            self.audit_log_file.unlink()
        if reset_outbox and self.outbox_file.exists():
            self.outbox_file.unlink()
