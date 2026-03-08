# BPAN Deploy Environment Checklist

Last updated: 2026-03-07

## Scope

This checklist is for non-destructive deployment readiness verification across:

- local development (`bpan-app/.env.local`)
- Vercel Preview environment
- Vercel Production environment

Do not store secret values in this file.

## Required Variables

### Supabase Access (Required)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Where set:

- Local: `bpan-app/.env.local`
- Preview: Vercel Project -> Settings -> Environment Variables (Preview)
- Prod: Vercel Project -> Settings -> Environment Variables (Production)

### Quartzy Sync (Required for Quartzy order sync jobs)

- `QUARTZY_ACCESS_TOKEN`

Where set:

- Local: `bpan-app/.env.local` (only if running sync scripts locally)
- Preview: Vercel env vars if preview jobs/routes use Quartzy sync
- Prod: Vercel env vars for scheduled/operational sync

Optional companion variable:

- `QUARTZY_API_BASE_URL` (defaults to `https://api.quartzy.com` if omitted)

### Optional Notification Channels

Email channel:

- `RESEND_API_KEY`
- `NEXT_PUBLIC_SITE_URL` (for chat/open links in notification content)

SMS channel:

- `FEATURE_SMS_NOTIFICATIONS` (`true` to enable SMS path)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE`
- `SMS_NOTIFICATIONS_PER_HOUR` (optional rate limit tuning)

Where set:

- Local: `bpan-app/.env.local` for local testing
- Preview: Vercel env vars for preview validation
- Prod: Vercel env vars for live notifications

## Rotate Policy Notes

- Rotate `SUPABASE_SERVICE_ROLE_KEY`, `QUARTZY_ACCESS_TOKEN`, `RESEND_API_KEY`, and Twilio credentials on:
  - suspected exposure
  - role/personnel change
  - periodic security window (recommended every 60-90 days)
- Keep old/new credential overlap only as long as needed for cutover validation.
- After rotation, revoke the old credential immediately after successful checks.
- Never commit secret values or paste them into coordination docs.

## Post-Change Verification Steps

1. Confirm env keys exist in target environment (local/preview/prod) with non-empty values.
2. Validate Supabase connectivity path:
   - authenticated page load works
   - a server action requiring service role succeeds
3. Validate Quartzy sync path (if enabled in target env):
   - run `node scripts/quartzy_sync_orders.mjs --help` (or scheduled dry run path)
   - confirm no missing-env startup error
4. Validate notification channels (if enabled):
   - email: trigger chat notification path and confirm Resend send path does not error
   - SMS: ensure feature flag and Twilio creds are present, then confirm send path is reachable without missing-env errors
5. Run deploy readiness check:
   - `npx supabase db push --dry-run` from `bpan-app` reports remote up to date
6. Record verification evidence in `AGENT_COORDINATION.md` (no secrets, IDs/URLs only).

## Current Readiness Checklist Location

Deployment readiness runbook/checklist currently exists in:

- `/Users/tahouranedaee/Desktop/BPAN-Platform/AGENT_COORDINATION.md` (Agent 11 deploy section)

This `docs/DEPLOY_ENV_CHECKLIST.md` is the environment-variable-focused companion checklist.
