#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> int:
    parser = argparse.ArgumentParser(description="Command transport sender")
    parser.add_argument("--agent", type=int, required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--outbox-id", default="")
    parser.add_argument("--reason", default="")
    parser.add_argument("--fail", action="store_true", help="Force failure for testing")
    args = parser.parse_args()

    prompt_file = Path(args.file)
    if not prompt_file.exists():
        print(f"missing prompt file: {prompt_file}")
        return 2
    text = prompt_file.read_text(encoding="utf-8").strip()
    if args.fail or "FORCE_SEND_FAIL" in text:
        print("simulated send failure")
        return 3

    # Real transport (recommended): HTTP endpoint that accepts JSON payload.
    # Env:
    #   ORCH_SEND_URL   required for live dispatch
    #   ORCH_SEND_TOKEN optional Bearer token
    send_url = os.environ.get("ORCH_SEND_URL", "").strip()
    send_token = os.environ.get("ORCH_SEND_TOKEN", "").strip()

    if send_url:
        payload = {
            "agent_id": args.agent,
            "prompt": text,
            "outbox_id": args.outbox_id,
            "reason": args.reason,
            "prompt_file": str(prompt_file),
        }
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if send_token:
            headers["Authorization"] = f"Bearer {send_token}"
        req = Request(send_url, data=body, headers=headers, method="POST")
        try:
            with urlopen(req, timeout=30) as resp:
                status = getattr(resp, "status", 200)
                if status >= 400:
                    print(f"send failed with HTTP {status}")
                    return 4
            print(f"sent prompt to agent {args.agent} via ORCH_SEND_URL")
            return 0
        except HTTPError as e:
            print(f"send failed HTTPError: {e.code} {e.reason}")
            return 4
        except URLError as e:
            print(f"send failed URLError: {e.reason}")
            return 4

    print(
        "No ORCH_SEND_URL set. Configure ORCH_SEND_URL (and optional ORCH_SEND_TOKEN) "
        "to enable real auto-dispatch."
    )
    return 5


if __name__ == "__main__":
    raise SystemExit(main())
