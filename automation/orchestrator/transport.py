from __future__ import annotations

import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .models import OutboxItem


@dataclass(slots=True)
class TransportResult:
    ok: bool
    error: str | None = None


class ManualTransport:
    def send(self, *, item: OutboxItem, prompt_file: Path, send_cmd_template: str) -> TransportResult:
        return TransportResult(ok=False, error="Manual transport configured; no external send executed")


class CommandTransport:
    def send(self, *, item: OutboxItem, prompt_file: Path, send_cmd_template: str) -> TransportResult:
        if not send_cmd_template.strip():
            return TransportResult(ok=False, error="send_cmd_template is empty for command transport")

        cmd = send_cmd_template.format(
            agent_id=item.target_agent,
            prompt_file=str(prompt_file),
            outbox_id=item.id,
            reason=item.reason,
        )
        try:
            completed = subprocess.run(
                shlex.split(cmd),
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception as exc:
            return TransportResult(ok=False, error=f"Command transport exception: {exc}")

        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            detail = stderr or stdout or f"exit code {completed.returncode}"
            return TransportResult(ok=False, error=f"Command transport failed: {detail}")

        return TransportResult(ok=True, error=None)


def build_transport(name: str):
    normalized = (name or "manual").strip().lower()
    if normalized == "command":
        return CommandTransport()
    return ManualTransport()
