#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shlex
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = os.environ.get("AGENT_GATEWAY_HOST", "127.0.0.1")
PORT = int(os.environ.get("AGENT_GATEWAY_PORT", "8787"))
TOKEN = os.environ.get("AGENT_GATEWAY_TOKEN", "")
MODE = os.environ.get("AGENT_GATEWAY_MODE", "file").strip().lower()  # file|command
INBOX_DIR = Path(os.environ.get("AGENT_GATEWAY_INBOX_DIR", "automation/gateway_inbox"))
CMD_TEMPLATE = os.environ.get("AGENT_GATEWAY_CMD_TEMPLATE", "").strip()


def json_response(handler: BaseHTTPRequestHandler, code: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def write_prompt_file(agent_id: int, outbox_id: str, reason: str, prompt: str) -> Path:
    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    safe_reason = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in reason)[:80]
    safe_outbox = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in outbox_id)[:80]
    filename = f"agent-{agent_id}_{stamp}_{safe_reason}_{safe_outbox}.md"
    path = INBOX_DIR / filename
    path.write_text(prompt, encoding="utf-8")
    return path


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path != "/send":
            json_response(self, 404, {"ok": False, "error": "not_found"})
            return

        if TOKEN:
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {TOKEN}":
                json_response(self, 401, {"ok": False, "error": "unauthorized"})
                return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            json_response(self, 400, {"ok": False, "error": "empty_body"})
            return

        raw = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            json_response(self, 400, {"ok": False, "error": "invalid_json"})
            return

        try:
            agent_id = int(data.get("agent_id"))
            prompt = str(data.get("prompt", "")).strip()
            outbox_id = str(data.get("outbox_id", "")).strip() or "none"
            reason = str(data.get("reason", "")).strip() or "unspecified"
        except Exception:
            json_response(self, 400, {"ok": False, "error": "invalid_payload"})
            return

        if not prompt:
            json_response(self, 400, {"ok": False, "error": "missing_prompt"})
            return

        prompt_file = write_prompt_file(agent_id, outbox_id, reason, prompt)

        if MODE == "command":
            if not CMD_TEMPLATE:
                json_response(
                    self,
                    500,
                    {"ok": False, "error": "missing_cmd_template", "prompt_file": str(prompt_file)},
                )
                return
            cmd = CMD_TEMPLATE.format(
                agent_id=agent_id,
                prompt_file=str(prompt_file),
                outbox_id=outbox_id,
                reason=reason,
            )
            try:
                proc = subprocess.run(
                    shlex.split(cmd),
                    capture_output=True,
                    text=True,
                    check=False,
                )
            except Exception as e:
                json_response(
                    self,
                    500,
                    {
                        "ok": False,
                        "error": "command_exception",
                        "detail": str(e),
                        "prompt_file": str(prompt_file),
                    },
                )
                return
            if proc.returncode != 0:
                json_response(
                    self,
                    500,
                    {
                        "ok": False,
                        "error": "command_failed",
                        "returncode": proc.returncode,
                        "stdout": proc.stdout[-5000:],
                        "stderr": proc.stderr[-5000:],
                        "prompt_file": str(prompt_file),
                    },
                )
                return
            json_response(
                self,
                200,
                {"ok": True, "mode": MODE, "agent_id": agent_id, "prompt_file": str(prompt_file)},
            )
            return

        # default file mode: just write and acknowledge
        json_response(
            self,
            200,
            {"ok": True, "mode": MODE, "agent_id": agent_id, "prompt_file": str(prompt_file)},
        )

    def do_GET(self) -> None:
        if self.path == "/healthz":
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "mode": MODE,
                    "host": HOST,
                    "port": PORT,
                    "inbox_dir": str(INBOX_DIR),
                },
            )
            return
        json_response(self, 404, {"ok": False, "error": "not_found"})

    def log_message(self, format: str, *args) -> None:
        # quiet default request logging
        return


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Agent gateway listening on http://{HOST}:{PORT} mode={MODE}")
    print(f"Inbox dir: {INBOX_DIR}")
    if TOKEN:
        print("Auth: bearer token required")
    else:
        print("Auth: disabled (set AGENT_GATEWAY_TOKEN to enable)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
