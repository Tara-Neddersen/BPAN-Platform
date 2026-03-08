# BPAN 48h Post-Deploy Runbook

## Objective
Validate release stability for the first 48 hours after production deploy and define clear escalation/rollback triggers.

## Cadence
- `T+0h` (immediately after deploy)
- `T+2h`
- `T+6h`
- `T+12h`
- `T+24h`
- `T+36h`
- `T+48h` (closeout)

## Critical Flow Checks
Run these checks at each cadence point.

1. `/experiments` runs
- Route loads for authenticated user.
- Create/edit run flow succeeds.
- Save/refresh persists expected state.

2. `/labs` operations CRUD
- Route loads for authenticated user.
- Reagent create/update/delete succeeds.
- Equipment booking create/update/status change succeeds.

3. `/labs/chat`
- Route loads for authenticated user.
- New thread/message post succeeds.
- Message remains visible after refresh.

4. `/results` import
- Route loads for authenticated user.
- Import path accepts expected format.
- Imported dataset can be opened and analyzed.

## Quartzy Sync Health Checks
1. Workflow status
- Verify latest run of `.github/workflows/quartzy-sync-orders.yml` is `success`.
- Confirm schedule gate reason is expected (run vs skip by interval).

2. Job output
- Check job summary for JSON sync summary.
- Download artifact `quartzy-sync-orders-log-*` and verify:
  - `quartzyOrdersFetched > 0` (unless known quiet period)
  - `skippedUnsupportedStatus` within expected range
  - no fatal errors

3. Data integrity
- Confirm new `lab_reagent_stock_events` entries map to expected reorder events.
- Spot-check that affected reagents reflect expected reorder state.

## Error Log Checks
1. Application/runtime
- Vercel deployment/runtime logs show no sustained 5xx spikes.
- No repeated crash loop in critical server actions.

2. Quartzy sync
- No repeated auth or API errors (`QUARTZY_ACCESS_TOKEN`, 401/403/429).
- No repeated Supabase auth/policy failures from sync workflow.

## Escalation Criteria
Escalate immediately to release owner + ops channel if any occur:
- Critical flow failure in `/experiments`, `/labs`, `/labs/chat`, or `/results` persists after one retry.
- Quartzy sync fails in 2 consecutive scheduled runs.
- Sustained 5xx or auth failures impacting user workflows.
- Data integrity mismatch between Quartzy status and BPAN stock events.

## Rollback Criteria
Trigger rollback discussion immediately when any criterion is met:
- P1 regression blocks core experiment/lab/results workflow.
- Data corruption risk or confirmed incorrect writes in production.
- High error rate continues >30 minutes without mitigation.

## Rollback Path
1. Roll back Vercel deployment alias to prior known-good deployment.
2. If needed, redeploy from stable anchor:
- branch: `safe/release-stable-2026-03-08`
- tag: `release-stable-2026-03-08`
3. Re-run critical flow checks and Quartzy health checks after rollback.

## Ownership
- Primary owner: Deployment/Ops agent
- Secondary owner: Platform lead
- DB/data validation: Supabase owner
