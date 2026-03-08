from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import BlockerItem, AgentSnapshot


@dataclass(slots=True)
class EngineState:
    last_hash: str | None
    agents: dict[int, AgentSnapshot]
    kickoff_sent: set[int]
    sent_history: list[dict[str, str]]


class StateStore:
    def __init__(self, state_file: Path) -> None:
        self.state_file = state_file

    def load(self) -> EngineState:
        if not self.state_file.exists():
            return EngineState(last_hash=None, agents={}, kickoff_sent=set(), sent_history=[])

        raw = json.loads(self.state_file.read_text(encoding="utf-8"))
        agents: dict[int, AgentSnapshot] = {}
        for key, value in raw.get("agents", {}).items():
            agent_id = int(key)
            raw_blockers = value.get("blockers", [])
            blockers: list[BlockerItem] = []
            for blocker in raw_blockers:
                if isinstance(blocker, str):
                    blockers.append(BlockerItem(text=blocker, severity=None))
                elif isinstance(blocker, dict):
                    blockers.append(
                        BlockerItem(
                            text=blocker.get("text", "").strip(),
                            severity=blocker.get("severity"),
                        )
                    )
            agents[agent_id] = AgentSnapshot(
                agent_id=agent_id,
                title=value.get("title", f"Agent {agent_id}"),
                status=value.get("status", "PENDING"),
                blockers=[b for b in blockers if b.text],
                completed=value.get("completed", []),
            )

        kickoff_sent = {int(item) for item in raw.get("kickoff_sent", [])}
        return EngineState(
            last_hash=raw.get("last_hash"),
            agents=agents,
            kickoff_sent=kickoff_sent,
            sent_history=raw.get("sent_history", []),
        )

    def save(self, state: EngineState) -> None:
        payload: dict[str, Any] = {
            "last_hash": state.last_hash,
            "kickoff_sent": sorted(state.kickoff_sent),
            "sent_history": state.sent_history[-1000:],
            "agents": {
                str(agent_id): {
                    "title": snap.title,
                    "status": snap.status,
                    "blockers": [
                        {"text": blocker.text, "severity": blocker.severity}
                        for blocker in snap.blockers
                    ],
                    "completed": snap.completed,
                }
                for agent_id, snap in sorted(state.agents.items())
            },
        }
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    def reset(self) -> None:
        if self.state_file.exists():
            self.state_file.unlink()
