# Platform Backfill Sync

## Purpose

Backfill existing data into the new run/template/lab-aware model without destructive edits.

This flow links:

- `experiments -> experiment_runs` via `legacy_experiment_id`
- `datasets -> experiment_run_id` when a unique run match is inferable
- missing `experiment_runs.schema_snapshot` from enabled result schema columns

All operations are idempotent and safe to re-run.

## Migration Contract

Migration: `/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/supabase/migrations/047_backfill_run_template_lab_links.sql`

Adds:

- `datasets.experiment_run_id` (if missing)
- index on `datasets.experiment_run_id`
- `public.backfill_platform_sync(dry_run boolean, sample_limit integer) -> jsonb`

The function is `security definer` and executable by `service_role` only.

## Runner Script

Script: `/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/scripts/backfill_platform_sync.mjs`

Commands:

```bash
# dry-run (default)
npm run backfill:platform-sync

# execute writes
npm run backfill:platform-sync -- --apply

# larger report sample
npm run backfill:platform-sync -- --sample-limit 50
```

Required env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Report Shape

The function returns JSON with:

- `experiments_to_runs`
  - `missing_legacy_runs`
  - `linked_or_would_link`
  - `skipped`
  - `samples`
- `datasets_to_runs`
  - `candidates`
  - `linked_or_would_link`
  - `skipped_ambiguous`
  - `skipped_unmatched`
  - sample arrays for each case
- `schema_snapshots`
  - `candidates`
  - `linked_or_would_link`
  - `skipped`
  - sample arrays for linked/skipped

## Rollback Notes

Schema changes are additive (no dropped data/tables).

If a backfill execution must be rolled back:

1. Use the dry-run report and prior apply report to identify touched IDs.
2. Revert only targeted links/snapshots with explicit SQL in a transaction.
3. Keep the additive schema in place; do not drop columns/tables in production rollback.
