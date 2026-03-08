from __future__ import annotations

import re
import uuid

from .models import AgentSnapshot, CoordinationSnapshot, DeployGate, PromptDecision, RouteOutcome
from .rules import RulesConfig
from .state import EngineState

AGENT_MENTION_RE = re.compile(r"agent\s+(\d+)", re.IGNORECASE)
SEVERITY_RE = re.compile(r"(?<![A-Z0-9])(P[123])(?![0-9])", re.IGNORECASE)
P1_TEXT_RE = re.compile(r"(?<![A-Z0-9])P1(?![0-9])", re.IGNORECASE)


def _decide_blocker_owner(source_agent: int, blocker: str) -> int:
    mentions = [int(m) for m in AGENT_MENTION_RE.findall(blocker)]
    for agent_id in mentions:
        if agent_id != source_agent:
            return agent_id
    return source_agent


def _dependency_map(rules: RulesConfig) -> dict[int, tuple[int, ...]]:
    return {target: deps for target, deps in rules.dependencies}


def _dependency_satisfied(target_agent: int, snapshot: CoordinationSnapshot, dep_map: dict[int, tuple[int, ...]]) -> bool:
    deps = dep_map.get(target_agent)
    if not deps:
        return False

    for dep in deps:
        dep_status = snapshot.agents.get(dep, AgentSnapshot(dep, f"Agent {dep}", "PENDING", [], [])).status
        if dep_status != "DONE":
            return False
    return True


def _new_decision(
    *,
    target_agent: int,
    source_agent: int | None,
    reason: str,
    prompt: str,
    evidence: dict,
    severity: str | None,
    rules: RulesConfig,
    queued: bool = True,
    queue_hold_reason: str | None = None,
) -> PromptDecision:
    priority = rules.severity_priority.get((severity or "NONE").upper(), rules.severity_priority.get("NONE", 4))
    return PromptDecision(
        decision_id=str(uuid.uuid4()),
        target_agent=target_agent,
        source_agent=source_agent,
        reason=reason,
        prompt=prompt,
        evidence=evidence,
        severity=severity,
        priority=priority,
        queued=queued,
        queue_hold_reason=queue_hold_reason,
    )


def _has_open_severity(agent: AgentSnapshot, severities: set[str]) -> bool:
    for blocker in agent.blockers:
        sev = (blocker.severity or "").upper()
        if sev in severities:
            return True
        found = [m.group(1).upper() for m in SEVERITY_RE.finditer(blocker.text)]
        if any(item in severities for item in found):
            return True
    return False


def _has_migration_clean_signal(agent: AgentSnapshot, keywords: list[str]) -> bool:
    if agent.status != "DONE":
        return False
    haystacks = [line.lower() for line in agent.completed]
    for keyword in keywords:
        if any(keyword in line for line in haystacks):
            return True
    return False


def _build_deploy_gate(snapshot: CoordinationSnapshot, rules: RulesConfig) -> DeployGate:
    qa_agent = snapshot.agents.get(rules.qa_agent_id)
    verifier = snapshot.agents.get(rules.migration_verifier_agent_id)

    reasons: list[str] = []
    if not qa_agent:
        reasons.append(f"QA agent {rules.qa_agent_id} not found in coordination doc.")
    else:
        # Deploy gate is driven by current QA blocker text content, not transition history.
        qa_has_p1_text = any(P1_TEXT_RE.search(blocker.text) for blocker in qa_agent.blockers)
        qa_has_p1_p2 = qa_has_p1_text or _has_open_severity(qa_agent, {"P1", "P2"})
        if qa_has_p1_p2:
            reasons.append(
                f"QA agent {rules.qa_agent_id} has open P1/P2 blockers."
            )
    
    if not verifier:
        reasons.append(
            f"Migration verifier agent {rules.migration_verifier_agent_id} not found in coordination doc."
        )
    else:
        if not _has_migration_clean_signal(verifier, rules.migration_clean_any_keywords):
            reasons.append(
                f"Migration verifier agent {rules.migration_verifier_agent_id} has no clean latest-pass verification signal."
            )

    return DeployGate(
        ready=len(reasons) == 0,
        reasons=reasons,
        qa_agent_id=rules.qa_agent_id,
        migration_verifier_agent_id=rules.migration_verifier_agent_id,
    )


def _has_any_open_p1_agents(agents: dict[int, AgentSnapshot]) -> bool:
    for agent in agents.values():
        if agent.status == "DONE":
            continue
        if _has_open_severity(agent, {"P1"}):
            return True
    return False


def _contains_any_keyword(text: str, keywords: list[str]) -> bool:
    normalized = text.lower()
    return any(keyword in normalized for keyword in keywords)


def route(snapshot: CoordinationSnapshot, previous: EngineState, rules: RulesConfig) -> RouteOutcome:
    decisions: list[PromptDecision] = []
    dep_map = _dependency_map(rules)
    current_open_p1_exists = _has_any_open_p1_agents(snapshot.agents)
    previous_open_p1_exists = _has_any_open_p1_agents(previous.agents)

    for agent_id, agent in sorted(snapshot.agents.items()):
        if agent.status == "DONE":
            continue
        prev = previous.agents.get(agent_id)
        prev_blockers = {b.text for b in prev.blockers} if prev else set()
        current_blockers = {b.text for b in agent.blockers}
        new_blockers = sorted(current_blockers - prev_blockers)

        blocker_by_text = {b.text: b for b in agent.blockers}
        for blocker_text in new_blockers:
            blocker = blocker_by_text[blocker_text]
            target = _decide_blocker_owner(agent_id, blocker_text)
            prompt = (
                f"New blocker was recorded in AGENT_COORDINATION.md by Agent {agent_id}: {blocker_text}\n"
                f"Please triage this blocker within your scope, propose an unblock step, and update your section "
                "(Status, Blockers, Notes For Other Agents) with concrete next actions."
            )
            if target != agent_id:
                prompt += (
                    f"\nCoordinate directly with Agent {agent_id} in the coordination doc after you decide the fix path."
                )

            reason = "new_blocker_detected"
            if blocker.severity == "P1":
                reason = "p1_blocker_immediate"
            elif blocker.severity == "P2":
                reason = "p2_blocker_detected"

            decisions.append(
                _new_decision(
                    target_agent=target,
                    source_agent=agent_id,
                    reason=reason,
                    prompt=prompt,
                    evidence={
                        "blocker": blocker_text,
                        "reported_by": agent_id,
                        "severity": blocker.severity,
                    },
                    severity=blocker.severity,
                    rules=rules,
                )
            )

        if previous_open_p1_exists and not current_open_p1_exists:
            for blocker in agent.blockers:
                if blocker.severity != "P2":
                    continue
                if blocker.text in prev_blockers:
                    decisions.append(
                        _new_decision(
                            target_agent=agent_id,
                            source_agent=agent_id,
                            reason="p2_released_after_p1_clear",
                            prompt=(
                                f"Previously deferred P2 blocker is now actionable: {blocker.text}\n"
                                "P1 blockers are currently clear. Triage this P2 item now and update your section with progress."
                            ),
                            evidence={"blocker": blocker.text, "reported_by": agent_id, "severity": "P2"},
                            severity="P2",
                            rules=rules,
                        )
                    )

        if agent_id == rules.qa_agent_id and prev:
            prev_completed = set(prev.completed)
            new_completed = [item for item in agent.completed if item not in prev_completed]
            retest_recorded = any(
                _contains_any_keyword(item, rules.qa_retest_followup_keywords)
                for item in new_completed
            )
            if retest_recorded:
                for blocker in agent.blockers:
                    if blocker.severity != "P1":
                        continue
                    if blocker.text not in prev_blockers:
                        continue
                    owner = _decide_blocker_owner(agent_id, blocker.text)
                    prompt = (
                        f"QA re-test indicates this P1 blocker is still open after a fix attempt: {blocker.text}\n"
                        "Prioritize a follow-up fix, update your section with root cause and next corrective action, "
                        "and notify QA when ready for another re-test."
                    )
                    if owner == agent_id:
                        prompt += (
                            "\nNo explicit owner agent was detected in the blocker text; "
                            "add `Agent X` to the blocker line so future follow-ups route directly."
                        )
                    decisions.append(
                        _new_decision(
                            target_agent=owner,
                            source_agent=agent_id,
                            reason="qa_p1_still_open_after_retest",
                            prompt=prompt,
                            evidence={
                                "blocker": blocker.text,
                                "reported_by": agent_id,
                                "severity": "P1",
                                "retest_evidence": new_completed,
                            },
                            severity="P1",
                            rules=rules,
                        )
                    )

        if prev and prev.status != "BLOCKED" and agent.status == "BLOCKED" and not new_blockers:
            decisions.append(
                _new_decision(
                    target_agent=agent_id,
                    source_agent=agent_id,
                    reason="blocked_without_new_detail",
                    prompt=(
                        "Your status changed to BLOCKED without a newly listed blocker item. "
                        "Add a concrete blocker line in AGENT_COORDINATION.md so routing can assign owners."
                    ),
                    evidence={"previous_status": prev.status, "current_status": agent.status},
                    severity=None,
                    rules=rules,
                )
            )

        if (
            prev
            and prev.status == "BLOCKED"
            and agent.status in {"PENDING", "IN_PROGRESS"}
            and agent.status != "DONE"
            and _dependency_satisfied(agent_id, snapshot, dep_map)
            and not _dependency_satisfied(agent_id, CoordinationSnapshot(previous.last_hash or "", previous.agents, {}), dep_map)
        ):
            decisions.append(
                _new_decision(
                    target_agent=agent_id,
                    source_agent=None,
                    reason="dependency_unblocked_continuation",
                    prompt=(
                        "Your dependency blockers appear resolved (dependency agents now DONE). "
                        "Resume your assigned scope and update AGENT_COORDINATION.md with current progress and remaining blockers."
                    ),
                    evidence={"agent_id": agent_id, "dependencies": list(dep_map.get(agent_id, ()))},
                    severity=None,
                    rules=rules,
                )
            )

    for target_agent, deps in rules.dependencies:
        target = snapshot.agents.get(target_agent)
        if not target:
            continue
        if target.status != "PENDING":
            continue
        if target_agent in previous.kickoff_sent:
            continue
        if not _dependency_satisfied(target_agent, snapshot, dep_map):
            continue

        notes = snapshot.notes_for_agent.get(target_agent, [])
        note_text = "\n".join(f"- {note}" for note in notes[:3])
        prompt = (
            "Dependency gates are now satisfied per AGENT_COORDINATION.md launch order. "
            "Start your assigned scope and update your section status to IN_PROGRESS."
        )
        if note_text:
            prompt += f"\nRelevant inter-agent notes:\n{note_text}"
        decisions.append(
            _new_decision(
                target_agent=target_agent,
                source_agent=None,
                reason="dependency_gate_opened",
                prompt=prompt,
                evidence={"dependencies": list(deps)},
                severity=None,
                rules=rules,
            )
        )

    if rules.defer_p2_when_p1_open and current_open_p1_exists:
        for decision in decisions:
            if decision.severity == "P2" and decision.queued:
                decision.queued = False
                decision.queue_hold_reason = "Deferred until open P1 blockers are resolved"

    deploy_gate = _build_deploy_gate(snapshot, rules)
    if deploy_gate.ready:
        decisions.append(
            _new_decision(
                target_agent=rules.deploy_target_agent_id,
                source_agent=None,
                reason="deploy_gate_opened",
                prompt=(
                    "Deployment gate is clear: QA has no open P1/P2 blockers and migration verification is clean for the latest pass. "
                    "Proceed with the deployment checklist and record deployment outcome in AGENT_COORDINATION.md."
                ),
                evidence={
                    "qa_agent_id": rules.qa_agent_id,
                    "migration_verifier_agent_id": rules.migration_verifier_agent_id,
                },
                severity=None,
                rules=rules,
            )
        )
    else:
        decisions.append(
            _new_decision(
                target_agent=rules.deploy_target_agent_id,
                source_agent=None,
                reason="deploy_gate_blocked",
                prompt=(
                    "Deployment remains blocked. Resolve the listed gate blockers before attempting deploy prompt generation."
                ),
                evidence={"reasons": deploy_gate.reasons},
                severity="P1" if any("P1/P2" in r for r in deploy_gate.reasons) else None,
                rules=rules,
                queued=False,
                queue_hold_reason="Deploy gate blocked",
            )
        )

    decisions.sort(key=lambda d: (d.priority, d.target_agent, d.reason, d.decision_id))
    return RouteOutcome(decisions=decisions, deploy_gate=deploy_gate)
