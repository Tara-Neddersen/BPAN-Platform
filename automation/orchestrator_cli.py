#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from orchestrator import OrchestratorEngine

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COORDINATION_FILE = REPO_ROOT / "AGENT_COORDINATION.md"
DEFAULT_STATE_FILE = REPO_ROOT / "automation" / "state" / "orchestrator_state.json"
DEFAULT_QUEUE_DIR = REPO_ROOT / "automation" / "queues"
DEFAULT_AUDIT_LOG = REPO_ROOT / "automation" / "logs" / "audit.jsonl"
DEFAULT_RULES_FILE = REPO_ROOT / "automation" / "rules.yaml"
DEFAULT_PROMPT_PACK_FILE = REPO_ROOT / "automation" / "out" / "next_prompts.md"
DEFAULT_OUTBOX_FILE = REPO_ROOT / "automation" / "state" / "outbox.json"
DEFAULT_OUTBOX_STATUS_FILE = REPO_ROOT / "automation" / "out" / "outbox_status.md"
DEFAULT_ALERTS_FILE = REPO_ROOT / "automation" / "out" / "alerts.md"
DEFAULT_SEND_PROMPT_DIR = REPO_ROOT / "automation" / "out" / "send_payloads"


def build_engine(args: argparse.Namespace) -> OrchestratorEngine:
    return OrchestratorEngine(
        coordination_file=Path(args.coordination_file),
        state_file=Path(args.state_file),
        queue_dir=Path(args.queue_dir),
        audit_log_file=Path(args.audit_log_file),
        rules_file=Path(args.rules_file),
        prompt_pack_file=Path(args.prompt_pack_file),
        outbox_file=Path(args.outbox_file),
        outbox_status_file=Path(args.outbox_status_file),
        alerts_file=Path(args.alerts_file),
        prompt_send_dir=Path(args.send_prompt_dir),
    )


def add_shared_paths(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--coordination-file", default=str(DEFAULT_COORDINATION_FILE), help="Path to AGENT_COORDINATION.md")
    parser.add_argument("--state-file", default=str(DEFAULT_STATE_FILE), help="Path to orchestrator state JSON")
    parser.add_argument("--queue-dir", default=str(DEFAULT_QUEUE_DIR), help="Directory containing per-agent queue JSONL files")
    parser.add_argument("--audit-log-file", default=str(DEFAULT_AUDIT_LOG), help="Path to audit log JSONL file")
    parser.add_argument("--rules-file", default=str(DEFAULT_RULES_FILE), help="Path to routing rules YAML")
    parser.add_argument("--prompt-pack-file", default=str(DEFAULT_PROMPT_PACK_FILE), help="Path to generated human prompt bundle markdown")
    parser.add_argument("--outbox-file", default=str(DEFAULT_OUTBOX_FILE), help="Path to outbox JSON store")
    parser.add_argument("--outbox-status-file", default=str(DEFAULT_OUTBOX_STATUS_FILE), help="Path to outbox status markdown")
    parser.add_argument("--alerts-file", default=str(DEFAULT_ALERTS_FILE), help="Path to alerts markdown")
    parser.add_argument("--send-prompt-dir", default=str(DEFAULT_SEND_PROMPT_DIR), help="Directory for prompt payload text files")


def cmd_run(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    result = engine.run_once(dry_run=args.dry_run)
    queued_count = len([d for d in result.decisions if d.queued])
    deferred_count = len([d for d in result.decisions if not d.queued])
    if not result.changed:
        print(f"run_id={result.run_id} document_changed=false decisions=0 queued=0 deferred=0")
    else:
        print(
            f"run_id={result.run_id} document_changed=true decisions={len(result.decisions)} "
            f"queued={queued_count} deferred={deferred_count} outbox_events={len(result.outbox_events)}"
        )
        for decision in result.decisions:
            queue_state = "queued" if decision.queued else "deferred"
            print(
                f"target=agent-{decision.target_agent} reason={decision.reason} "
                f"severity={decision.severity or 'NONE'} state={queue_state} id={decision.decision_id}"
            )

    if result.alerts:
        print(f"alerts={len(result.alerts)}")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    print(f"watching {args.coordination_file} every {args.interval}s dry_run={args.dry_run}")
    engine.watch(poll_seconds=args.interval, dry_run=args.dry_run)
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    if args.source == "outbox":
        lines = engine.inspect_outbox(tail=args.tail)
    else:
        lines = engine.inspect_queue(agent=args.agent, tail=args.tail)
    if not lines:
        print("No entries found.")
        return 0

    for line in lines:
        print(line)
    return 0


def cmd_reset(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    engine.reset(
        reset_queues=args.reset_queues,
        reset_audit=args.reset_audit,
        reset_outbox=args.reset_outbox,
    )
    print("State reset complete.")
    return 0


def cmd_summary(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    for line in engine.queue_summary():
        print(line)
    return 0


def cmd_approve(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    ok = engine.approve_outbox_item(args.outbox_id)
    if not ok:
        print("Approval failed: outbox item not found or not pending.")
        return 1
    print(f"Approved outbox item {args.outbox_id}")
    return 0


def cmd_reject(args: argparse.Namespace) -> int:
    engine = build_engine(args)
    ok = engine.reject_outbox_item(args.outbox_id, args.reason)
    if not ok:
        print("Reject failed: outbox item not found or not pending.")
        return 1
    print(f"Rejected outbox item {args.outbox_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="BPAN orchestrator controlled full-auto")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Process AGENT_COORDINATION.md once")
    add_shared_paths(run_parser)
    run_parser.add_argument("--dry-run", action="store_true", help="Never send prompts (no transport execution)")
    run_parser.set_defaults(func=cmd_run)

    watch_parser = subparsers.add_parser("watch", help="Continuously poll for coordination-doc updates")
    add_shared_paths(watch_parser)
    watch_parser.add_argument("--interval", type=int, default=10, help="Polling interval in seconds")
    watch_parser.add_argument("--dry-run", action="store_true", help="Never send prompts (no transport execution)")
    watch_parser.set_defaults(func=cmd_watch)

    inspect_parser = subparsers.add_parser("inspect", help="Inspect queue or outbox entries")
    add_shared_paths(inspect_parser)
    inspect_parser.add_argument("--source", choices=["queue", "outbox"], default="queue")
    inspect_parser.add_argument("--agent", type=int, default=None, help="Inspect queue for one agent id")
    inspect_parser.add_argument("--tail", type=int, default=20, help="Lines/items to print")
    inspect_parser.set_defaults(func=cmd_inspect)

    reset_parser = subparsers.add_parser("reset", help="Reset orchestrator state")
    add_shared_paths(reset_parser)
    reset_parser.add_argument("--reset-queues", action="store_true", help="Delete and recreate queue files")
    reset_parser.add_argument("--reset-audit", action="store_true", help="Delete audit log")
    reset_parser.add_argument("--reset-outbox", action="store_true", help="Delete outbox store")
    reset_parser.set_defaults(func=cmd_reset)

    summary_parser = subparsers.add_parser("summary", help="Print actionable outbox summary")
    add_shared_paths(summary_parser)
    summary_parser.set_defaults(func=cmd_summary)

    approve_parser = subparsers.add_parser("approve", help="Approve an approval-gated outbox item")
    add_shared_paths(approve_parser)
    approve_parser.add_argument("outbox_id")
    approve_parser.set_defaults(func=cmd_approve)

    reject_parser = subparsers.add_parser("reject", help="Reject an approval-gated outbox item")
    add_shared_paths(reject_parser)
    reject_parser.add_argument("outbox_id")
    reject_parser.add_argument("--reason", required=True)
    reject_parser.set_defaults(func=cmd_reject)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
