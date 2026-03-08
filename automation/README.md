# BPAN Orchestrator (Controlled Full-Auto)

The orchestrator reads `AGENT_COORDINATION.md`, generates routing decisions, stores prompts in an outbox, and can optionally auto-send through a configurable command transport.

Default behavior is safe:

- `mode: manual`
- `transport: manual`
- no automatic external posting

## Setup

1. Review and edit `automation/rules.yaml`.
2. Keep defaults for safe/manual operation.
3. Run once:

```bash
python3 automation/orchestrator_cli.py run
```

## Modes

- `mode: manual`
  - Generates decisions/outbox/queues/prompt packs.
  - Never auto-sends.
- `mode: auto`
  - Generates decisions and attempts to send eligible outbox items.
  - Approval-gated items remain pending until approved.

Transport options:

- `transport: manual`: never executes external send commands.
- `transport: command`: executes `send_cmd_template` per item.

Example command transport template:

```yaml
send_cmd_template: "python3 automation/tools/send_prompt.py --agent {agent_id} --file {prompt_file} --outbox-id {outbox_id} --reason {reason}"
```

Template variables:

- `{agent_id}`
- `{prompt_file}`
- `{outbox_id}`
- `{reason}`

`automation/tools/send_prompt.py` supports two modes:

- Real dispatch: set `ORCH_SEND_URL` (and optional `ORCH_SEND_TOKEN`) to POST JSON payloads to your agent gateway.
- Safe fallback: if `ORCH_SEND_URL` is not set, the command fails with a clear message and no external send occurs.

### Local Agent Gateway (Optional)

You can run a local gateway to receive/send prompts.

Start gateway in file mode (writes prompts to `automation/gateway_inbox`):

```bash
python3 automation/tools/agent_gateway.py
```

With auth token:

```bash
export AGENT_GATEWAY_TOKEN="replace-me"
python3 automation/tools/agent_gateway.py
```

Then configure sender env:

```bash
export ORCH_SEND_URL="http://127.0.0.1:8787/send"
export ORCH_SEND_TOKEN="replace-me"
```

Gateway command mode (advanced): execute a command per incoming prompt.

```bash
export AGENT_GATEWAY_MODE="command"
export AGENT_GATEWAY_CMD_TEMPLATE="python3 /path/to/your_real_sender.py --agent {agent_id} --file {prompt_file}"
python3 automation/tools/agent_gateway.py
```

Health check:

```bash
curl -s http://127.0.0.1:8787/healthz
```

## Commands

Run once:

```bash
python3 automation/orchestrator_cli.py run
python3 automation/orchestrator_cli.py run --dry-run
```

Watch loop:

```bash
python3 automation/orchestrator_cli.py watch --interval 10
python3 automation/orchestrator_cli.py watch --interval 10 --dry-run
```

Inspect queue/outbox:

```bash
python3 automation/orchestrator_cli.py inspect --source queue
python3 automation/orchestrator_cli.py inspect --source outbox --tail 50
```

Outbox summary:

```bash
python3 automation/orchestrator_cli.py summary
```

Approval flow:

```bash
python3 automation/orchestrator_cli.py approve <outbox_id>
python3 automation/orchestrator_cli.py reject <outbox_id> --reason "not safe to send"
```

Reset state:

```bash
python3 automation/orchestrator_cli.py reset
python3 automation/orchestrator_cli.py reset --reset-queues --reset-audit --reset-outbox
```

## Approval Rules (Mandatory Safety)

`requires_approval=true` is set for:

- deployment-related prompts (`reason` contains `deploy`)
- prompts containing high-risk keywords (default: `delete`, `drop`, `reset`, `truncate`)
- cross-scope reassignments (source agent differs from target agent)

Auto-send skips pending approval items.

## QA Persistent P1 Follow-Up Rule

If QA (configured `deploy_gate.qa_agent_id`) keeps the same `P1` blocker open after logging a new retest/fix-attempt note in `Completed`, the orchestrator generates a follow-up prompt to the owning agent.

- Ownership is inferred from `Agent X` mention in the blocker line when present.
- If no owner is detected, follow-up routes to QA with a prompt to add explicit owner tagging.
- Keyword matching is configurable via `qa_retest_followup_keywords` in `automation/rules.yaml`.

## Deploy Gate QA Rule

Deploy gate is blocked whenever the QA agent's `Blockers` section contains any `P1` text marker in blocker lines, including free-form phrasing (for example, `... remains an open P1 blocker despite retest`).
This gate check is based on current QA blocker text and does not depend on new-blocker transitions.

## Dedupe + Idempotency

Outbox dedupe key uses:

- `target_agent`
- `reason`
- normalized prompt hash
- active blocker signature

Duplicates are skipped inside `dedupe_window_seconds`.
Sent history is persisted in orchestrator state for dedupe checks.

## Retry Behavior

Failed sends use exponential backoff:

- retry delay = `base_delay_seconds * 2^(retries-1)`
- capped by `max_delay_seconds`
- stop at `max_retries` and mark `failed`

Terminal failures emit alerts in:

- `automation/out/alerts.md`
- `automation/out/next_prompts.md` (Alerts section)

## Outputs

- `automation/out/next_prompts.md`
- `automation/out/outbox_status.md`
- `automation/out/alerts.md`
- `automation/logs/audit.jsonl`
- `automation/state/outbox.json`
- `automation/queues/agent-<n>.jsonl` (compatibility)

## Config (`automation/rules.yaml`)

Supported keys:

- `mode: manual|auto`
- `transport: manual|command`
- `send_cmd_template`
- `dependencies`
- `severity.priority`
- `severity.defer_p2_when_p1_open`
- `deploy_gate`
- `approval_rules`
- `retry_policy`
- `dedupe_window_seconds`
- `high_risk_keywords`
- `qa_retest_followup_keywords`

## Rollback To Manual Safety

Set:

```yaml
mode: manual
transport: manual
send_cmd_template: ""
```

Then run:

```bash
python3 automation/orchestrator_cli.py run
```

## Example Workflow

1. Update `AGENT_COORDINATION.md`.
2. Run orchestrator.
3. Check `automation/out/next_prompts.md` and `automation/out/outbox_status.md`.
4. Approve required outbox items if needed.
5. If in auto mode with command transport, rerun/watch to send eligible items.
