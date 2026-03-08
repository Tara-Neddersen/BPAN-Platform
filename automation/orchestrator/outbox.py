from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import OutboxItem, PromptDecision
from .rules import RulesConfig


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: datetime | None = None) -> str:
    value = dt or utc_now()
    return value.replace(microsecond=0).isoformat()


def parse_utc(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def normalize_prompt(prompt: str) -> str:
    return " ".join(prompt.split()).strip().lower()


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(normalize_prompt(prompt).encode("utf-8")).hexdigest()


def blocker_signature(decision: PromptDecision) -> str:
    block = ""
    if isinstance(decision.evidence, dict):
        block = str(decision.evidence.get("blocker") or "")
        if not block:
            reasons = decision.evidence.get("reasons")
            if isinstance(reasons, list):
                block = "|".join(str(item) for item in reasons)
    return hashlib.sha256(block.lower().encode("utf-8")).hexdigest()


def dedupe_key(decision: PromptDecision) -> str:
    raw = f"{decision.target_agent}|{decision.reason}|{prompt_hash(decision.prompt)}|{blocker_signature(decision)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass(slots=True)
class OutboxSummary:
    total: int
    pending: int
    sent: int
    failed: int
    skipped: int
    approval_required: int


class OutboxStore:
    def __init__(self, outbox_file: Path) -> None:
        self.outbox_file = outbox_file

    def load(self) -> list[OutboxItem]:
        if not self.outbox_file.exists():
            return []
        raw = json.loads(self.outbox_file.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        items: list[OutboxItem] = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            items.append(
                OutboxItem(
                    id=str(row.get("id", "")),
                    created_at=str(row.get("created_at", "")),
                    target_agent=int(row.get("target_agent", 0)),
                    reason=str(row.get("reason", "")),
                    severity=row.get("severity"),
                    prompt_text=str(row.get("prompt_text", "")),
                    source_run_id=str(row.get("source_run_id", "")),
                    status=str(row.get("status", "pending")),
                    requires_approval=bool(row.get("requires_approval", False)),
                    approval_token=row.get("approval_token"),
                    retries=int(row.get("retries", 0)),
                    last_error=row.get("last_error"),
                    prompt_hash=str(row.get("prompt_hash", "")),
                    blocker_signature=str(row.get("blocker_signature", "")),
                    dedupe_key=str(row.get("dedupe_key", "")),
                    next_attempt_at=row.get("next_attempt_at"),
                    source_agent=row.get("source_agent"),
                    evidence=row.get("evidence", {}),
                )
            )
        return items

    def save(self, items: list[OutboxItem]) -> None:
        self.outbox_file.parent.mkdir(parents=True, exist_ok=True)
        self.outbox_file.write_text(
            json.dumps([item.to_record() for item in items], indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def summary(self, items: list[OutboxItem]) -> OutboxSummary:
        return OutboxSummary(
            total=len(items),
            pending=sum(1 for item in items if item.status == "pending"),
            sent=sum(1 for item in items if item.status == "sent"),
            failed=sum(1 for item in items if item.status == "failed"),
            skipped=sum(1 for item in items if item.status == "skipped"),
            approval_required=sum(
                1
                for item in items
                if item.status == "pending" and item.requires_approval and bool(item.approval_token)
            ),
        )

    def is_duplicate(
        self,
        *,
        items: list[OutboxItem],
        sent_history: list[dict[str, str]],
        decision: PromptDecision,
        window_seconds: int,
    ) -> bool:
        key = dedupe_key(decision)
        now = utc_now()
        cutoff = now - timedelta(seconds=window_seconds)

        for item in items:
            if item.dedupe_key != key:
                continue
            created = parse_utc(item.created_at)
            if not created or created < cutoff:
                continue
            if item.status in {"pending", "sent"}:
                return True

        for event in sent_history:
            if event.get("dedupe_key") != key:
                continue
            sent_at = parse_utc(event.get("sent_at"))
            if sent_at and sent_at >= cutoff:
                return True
        return False

    def append_from_decision(
        self,
        *,
        items: list[OutboxItem],
        decision: PromptDecision,
        run_id: str,
        requires_approval: bool,
        skip_reason: str | None,
    ) -> OutboxItem:
        status = "pending"
        last_error = None
        if skip_reason:
            status = "skipped"
            last_error = skip_reason
        approval_token = str(uuid.uuid4()) if requires_approval else None
        item = OutboxItem(
            id=str(uuid.uuid4()),
            created_at=utc_iso(),
            target_agent=decision.target_agent,
            reason=decision.reason,
            severity=decision.severity,
            prompt_text=decision.prompt,
            source_run_id=run_id,
            status=status,
            requires_approval=requires_approval,
            approval_token=approval_token,
            retries=0,
            last_error=last_error,
            prompt_hash=prompt_hash(decision.prompt),
            blocker_signature=blocker_signature(decision),
            dedupe_key=dedupe_key(decision),
            next_attempt_at=None,
            source_agent=decision.source_agent,
            evidence=decision.evidence,
        )
        items.append(item)
        return item

    def approve(self, items: list[OutboxItem], outbox_id: str) -> OutboxItem | None:
        for item in items:
            if item.id != outbox_id:
                continue
            if item.status != "pending":
                return None
            item.requires_approval = False
            item.approval_token = None
            item.last_error = None
            return item
        return None

    def reject(self, items: list[OutboxItem], outbox_id: str, reason: str) -> OutboxItem | None:
        for item in items:
            if item.id != outbox_id:
                continue
            if item.status != "pending":
                return None
            item.status = "skipped"
            item.last_error = reason
            return item
        return None

    def mark_sent(self, item: OutboxItem) -> None:
        item.status = "sent"
        item.last_error = None
        item.next_attempt_at = None

    def mark_failed_retry(self, item: OutboxItem, error: str, rules: RulesConfig) -> None:
        item.retries += 1
        item.last_error = error
        if item.retries >= rules.retry_max_retries:
            item.status = "failed"
            item.next_attempt_at = None
            return
        delay = min(
            rules.retry_max_delay_seconds,
            rules.retry_base_delay_seconds * (2 ** max(item.retries - 1, 0)),
        )
        item.next_attempt_at = utc_iso(utc_now() + timedelta(seconds=delay))
        item.status = "pending"

    def due_for_send(self, item: OutboxItem) -> bool:
        if item.status != "pending":
            return False
        next_at = parse_utc(item.next_attempt_at)
        if not next_at:
            return True
        return next_at <= utc_now()
