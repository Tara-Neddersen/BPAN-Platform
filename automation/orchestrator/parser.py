from __future__ import annotations

import hashlib
import re

from .models import ALLOWED_STATUSES, BlockerItem, AgentSnapshot, CoordinationSnapshot, SEVERITY_LEVELS

AGENT_HEADER_RE = re.compile(r"^## Agent (\d+):\s*(.+)$", re.MULTILINE)
INTER_AGENT_RE = re.compile(r"^### Notes For Agent (\d+)\s*$", re.MULTILINE)
STATUS_RE = re.compile(r"- `Status:`\s*`?([A-Z_ ]+)`?", re.IGNORECASE)
BULLET_RE = re.compile(r"^\s*-\s+(.*\S)\s*$")
SEVERITY_RE = re.compile(r"(?<![A-Z0-9])(P[123])(?![0-9])", re.IGNORECASE)


def _normalize_status(raw: str | None) -> str:
    if not raw:
        return "PENDING"
    clean = raw.strip().upper().replace(" ", "_")
    if clean == "NOT_STARTED":
        return "PENDING"
    if clean in ALLOWED_STATUSES:
        return clean
    return "PENDING"


def _extract_blockers(section: str) -> list[BlockerItem]:
    marker = "- `Blockers:`"
    start = section.find(marker)
    if start < 0:
        return []

    lines = section[start + len(marker) :].splitlines()
    blockers: list[BlockerItem] = []
    for line in lines:
        if line.startswith("- `"):
            break
        match = BULLET_RE.match(line)
        if not match:
            if blockers:
                break
            continue
        item = match.group(1).strip()
        if item.lower() == "none":
            return []
        matches = [m.group(1).upper() for m in SEVERITY_RE.finditer(item)]
        severity = None
        if matches:
            if "P1" in matches:
                severity = "P1"
            elif "P2" in matches:
                severity = "P2"
            elif "P3" in matches:
                severity = "P3"
        if severity and severity not in SEVERITY_LEVELS:
            severity = None
        blockers.append(BlockerItem(text=item, severity=severity))
    return blockers


def _extract_completed(section: str) -> list[str]:
    marker = "- `Completed:`"
    start = section.find(marker)
    if start < 0:
        return []

    lines = section[start + len(marker) :].splitlines()
    completed: list[str] = []
    for line in lines:
        if line.startswith("- `"):
            break
        match = BULLET_RE.match(line)
        if not match:
            if completed:
                break
            continue
        item = match.group(1).strip()
        if item.lower() != "none":
            completed.append(item)
    return completed


def _extract_notes_for_agents(doc: str) -> dict[int, list[str]]:
    matches = list(INTER_AGENT_RE.finditer(doc))
    notes: dict[int, list[str]] = {}
    for idx, match in enumerate(matches):
        agent_id = int(match.group(1))
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(doc)
        section = doc[start:end]

        items: list[str] = []
        for line in section.splitlines():
            bullet = BULLET_RE.match(line)
            if bullet:
                text = bullet.group(1).strip()
                if text and text.lower() != "none":
                    items.append(text)
        notes[agent_id] = items
    return notes


def parse_coordination_doc(doc_text: str) -> CoordinationSnapshot:
    doc_hash = hashlib.sha256(doc_text.encode("utf-8")).hexdigest()
    matches = list(AGENT_HEADER_RE.finditer(doc_text))
    agents: dict[int, AgentSnapshot] = {}

    for idx, match in enumerate(matches):
        agent_id = int(match.group(1))
        title = match.group(2).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(doc_text)
        section = doc_text[start:end]

        status_match = STATUS_RE.search(section)
        status = _normalize_status(status_match.group(1) if status_match else None)
        blockers = _extract_blockers(section)
        completed = _extract_completed(section)
        agents[agent_id] = AgentSnapshot(
            agent_id=agent_id,
            title=title,
            status=status,
            blockers=blockers,
            completed=completed,
        )

    notes = _extract_notes_for_agents(doc_text)
    return CoordinationSnapshot(document_hash=doc_hash, agents=agents, notes_for_agent=notes)
