from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ALLOWED_STATUSES = {"PENDING", "IN_PROGRESS", "BLOCKED", "DONE"}
SEVERITY_LEVELS = {"P1", "P2", "P3"}


@dataclass(slots=True)
class BlockerItem:
    text: str
    severity: str | None = None


@dataclass(slots=True)
class AgentSnapshot:
    agent_id: int
    title: str
    status: str
    blockers: list[BlockerItem] = field(default_factory=list)
    completed: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CoordinationSnapshot:
    document_hash: str
    agents: dict[int, AgentSnapshot]
    notes_for_agent: dict[int, list[str]]


@dataclass(slots=True)
class PromptDecision:
    decision_id: str
    target_agent: int
    source_agent: int | None
    reason: str
    prompt: str
    evidence: dict[str, Any]
    severity: str | None = None
    priority: int = 99
    queued: bool = True
    queue_hold_reason: str | None = None

    def to_record(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "target_agent": self.target_agent,
            "source_agent": self.source_agent,
            "reason": self.reason,
            "prompt": self.prompt,
            "evidence": self.evidence,
            "severity": self.severity,
            "priority": self.priority,
            "queued": self.queued,
            "queue_hold_reason": self.queue_hold_reason,
        }


@dataclass(slots=True)
class DeployGate:
    ready: bool
    reasons: list[str]
    qa_agent_id: int
    migration_verifier_agent_id: int


@dataclass(slots=True)
class RouteOutcome:
    decisions: list[PromptDecision]
    deploy_gate: DeployGate


@dataclass(slots=True)
class OutboxItem:
    id: str
    created_at: str
    target_agent: int
    reason: str
    severity: str | None
    prompt_text: str
    source_run_id: str
    status: str
    requires_approval: bool
    approval_token: str | None
    retries: int
    last_error: str | None
    prompt_hash: str
    blocker_signature: str
    dedupe_key: str
    next_attempt_at: str | None = None
    source_agent: int | None = None
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_record(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "created_at": self.created_at,
            "target_agent": self.target_agent,
            "reason": self.reason,
            "severity": self.severity,
            "prompt_text": self.prompt_text,
            "source_run_id": self.source_run_id,
            "status": self.status,
            "requires_approval": self.requires_approval,
            "approval_token": self.approval_token,
            "retries": self.retries,
            "last_error": self.last_error,
            "prompt_hash": self.prompt_hash,
            "blocker_signature": self.blocker_signature,
            "dedupe_key": self.dedupe_key,
            "next_attempt_at": self.next_attempt_at,
            "source_agent": self.source_agent,
            "evidence": self.evidence,
        }
