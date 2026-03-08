from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .models import DeployGate, OutboxItem, PromptDecision
from .outbox import OutboxSummary


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class QueueWriter:
    def __init__(self, queue_dir: Path) -> None:
        self.queue_dir = queue_dir

    def enqueue(self, decision: PromptDecision) -> Path:
        self.queue_dir.mkdir(parents=True, exist_ok=True)
        queue_path = self.queue_dir / f"agent-{decision.target_agent}.jsonl"
        record = {
            "created_at": utc_now_iso(),
            **decision.to_record(),
        }
        with queue_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, sort_keys=True) + "\n")
        return queue_path


class AuditLogger:
    def __init__(self, log_file: Path) -> None:
        self.log_file = log_file

    def log_run(
        self,
        *,
        run_id: str,
        doc_hash: str,
        changed: bool,
        decisions: list[PromptDecision],
        outbox_events: list[dict] | None = None,
        alerts: list[str] | None = None,
    ) -> None:
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": utc_now_iso(),
            "run_id": run_id,
            "document_hash": doc_hash,
            "document_changed": changed,
            "decisions": [item.to_record() for item in decisions],
            "outbox_events": outbox_events or [],
            "alerts": alerts or [],
        }
        with self.log_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, sort_keys=True) + "\n")


class PromptPackWriter:
    def __init__(self, output_file: Path) -> None:
        self.output_file = output_file

    def write(self, *, decisions: list[PromptDecision], deploy_gate: DeployGate, alerts: list[str] | None = None) -> None:
        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        timestamp = utc_now_iso()
        actionable = [d for d in decisions if d.queued]
        active_alerts = alerts or []

        if not actionable:
            lines = [f"# Next Prompts", "", f"Generated at: {timestamp}", "", "No action needed."]
            failure_alerts = [a for a in active_alerts if "Outbox failed" in a]
            if failure_alerts:
                lines.extend(["", "## Alerts", ""])
                for alert in failure_alerts:
                    lines.append(f"- {alert}")
            self.output_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            return

        lines: list[str] = [
            "# Next Prompts",
            "",
            f"Generated at: {timestamp}",
            "",
            "## Recommended Send Order",
            "",
        ]
        for idx, decision in enumerate(actionable, start=1):
            sev = f" ({decision.severity})" if decision.severity else ""
            lines.append(
                f"{idx}. Agent {decision.target_agent} - `{decision.reason}`{sev}"
            )

        blocked_deploy = [d for d in decisions if d.reason == "deploy_gate_blocked"]
        if blocked_deploy:
            lines.extend(
                [
                    "",
                    "## Deploy Blocked",
                    "",
                    "Deployment prompt generation is blocked for these reasons:",
                ]
            )
            for reason in deploy_gate.reasons:
                lines.append(f"- {reason}")

        failure_alerts = [a for a in active_alerts if "Outbox failed" in a]
        if failure_alerts:
            lines.extend(["", "## Alerts", ""])
            for alert in failure_alerts:
                lines.append(f"- {alert}")

        lines.extend(["", "## Send to Agents", ""])
        for decision in actionable:
            lines.append(f"### Send to Agent {decision.target_agent}")
            lines.append("")
            lines.append(f"Reason: `{decision.reason}`")
            if decision.severity:
                lines.append(f"Severity: `{decision.severity}`")
            lines.append("")
            lines.append("```text")
            lines.append(decision.prompt)
            lines.append("```")
            lines.append("")

        self.output_file.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


class OutboxStatusWriter:
    def __init__(self, output_file: Path) -> None:
        self.output_file = output_file

    def write(self, *, summary: OutboxSummary, items: list[OutboxItem]) -> None:
        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Outbox Status",
            "",
            f"Generated at: {utc_now_iso()}",
            "",
            f"- Total: {summary.total}",
            f"- Pending: {summary.pending}",
            f"- Sent: {summary.sent}",
            f"- Failed: {summary.failed}",
            f"- Skipped: {summary.skipped}",
            f"- Requires Approval: {summary.approval_required}",
            "",
            "## Pending Items",
            "",
        ]
        pending = [item for item in items if item.status == "pending"]
        if not pending:
            lines.append("- None")
        else:
            for item in pending[:100]:
                approval = "yes" if item.requires_approval and item.approval_token else "no"
                lines.append(
                    f"- {item.id} | agent={item.target_agent} | reason={item.reason} | approval={approval} | retries={item.retries}"
                )
        self.output_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


class AlertsWriter:
    def __init__(self, output_file: Path) -> None:
        self.output_file = output_file

    def write(self, *, alerts: list[str]) -> None:
        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Alerts",
            "",
            f"Generated at: {utc_now_iso()}",
            "",
        ]
        if not alerts:
            lines.append("No active alerts.")
        else:
            for alert in alerts:
                lines.append(f"- {alert}")
        self.output_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
