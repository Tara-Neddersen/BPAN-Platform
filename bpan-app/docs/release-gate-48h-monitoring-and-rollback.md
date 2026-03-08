# 48-Hour Post-Deploy Monitoring Checklist And Rollback Protocol

## Scope
Release surfaces:
- `/experiments`
- `/results`
- `/labs`
- `/labs/chat`
- `/operations`
- `/notifications`
- auth redirects and integration touchpoints

Monitoring window:
- `T+0` to `T+48h`

## 1) Critical User-Flow Checks
Run at `T+0`, `T+2h`, `T+6h`, `T+24h`, `T+48h`.

- [ ] Auth redirect behavior:
  - logged-out hit to protected route redirects to `/auth/login`
  - logged-in hit to `/auth/login` returns to `/dashboard`
- [ ] `/experiments` runs:
  - create run from template with `Saved Schedule = Select schedule` succeeds
  - run appears immediately and still appears after full reload
  - clear success/error feedback shown for create action
- [ ] `/experiments` templates:
  - create/edit template save succeeds and persists after reload
- [ ] `/labs` mode clarity:
  - personal mode shows shared ops inactive state + clear switch CTA
  - active lab mode shows explicit active-lab context + shared ops enabled
  - Daily Operations hub shows one active panel (no all-sections-open regression)
- [ ] `/labs/chat`:
  - create thread succeeds (no RLS failure)
  - send message works, mark read/unread works, message persists after reload
- [ ] `/operations` reagent thread:
  - post note renders immediately, input clears, persists after reload
- [ ] `/operations` booking:
  - create booking works
  - edit booking works
  - delete booking works (with confirm)
  - status changes are reversible (`draft` <-> `confirmed` <-> `in_use`/`completed`/`cancelled`)
- [ ] `/results`:
  - paste/import modal path opens without crash
  - route remains stable after modal close

## 2) Error Monitoring Checks (Vercel + Runtime)
Run every 2-4 hours during first 24h, then once at 48h.

- [ ] Vercel deployment health:
  - production alias healthy: `https://bpan-app.vercel.app`
  - no deployment-level incidents/outages
- [ ] Vercel logs review:
  - check server action/API 5xx spikes
  - check `/experiments` `POST` failures and `/operations` mutation failures
  - command path:
    - `cd /Users/tahouranedaee/Desktop/BPAN-Platform`
    - `npx --yes vercel logs https://bpan-app.vercel.app`
- [ ] Runtime/app signals:
  - no repeated `500` responses on critical mutations
  - no broken-route loops or auth redirect loops
  - no sustained client runtime errors in critical flows

## 3) Quartzy Sync Health Checks
Run at `T+0`, `T+6h`, `T+24h`, `T+48h`.

- [ ] Quartzy credentials/integration config still valid in target env
- [ ] Sync trigger path executes without auth errors
- [ ] Inventory mapping integrity:
  - no sudden spike in unmatched SKU/reagent mappings
  - no duplicate item creation from sync replay
- [ ] Delta sanity:
  - expected number of changes imported for interval
  - no zero-delta anomalies when upstream changed
- [ ] Failure queue:
  - no stuck retry backlog
  - retries converge (failures trend down)

## 4) Severity Thresholds
### P1 Rollback Triggers (Immediate)
Any one of:
- Critical flow broken for all/most users (`/experiments` run create, `/labs/chat` messaging, `/operations` core mutations)
- Reproducible data-loss/persistence failure in critical workflows
- Sustained production 5xx on critical mutation path
- Auth loop/lockout for signed-in users on protected routes

Action:
- initiate rollback immediately
- post incident note in `AGENT_COORDINATION.md`

### P2 Watch/Fix Window
Examples:
- feature degraded but workaround exists
- intermittent non-critical mutation failures
- clarity regressions that do not block completion

Action:
- hotfix within `24h`
- if trend worsens toward critical-flow breakage, escalate to P1

### P3 Watch/Fix Window
Examples:
- minor UX polish regressions
- isolated warning-level runtime noise without user-facing breakage

Action:
- schedule fix within next planned patch cycle (`<=7 days`)

## 5) Exact Rollback Steps
## A) Fast rollback via Vercel deployment rollback
1. Identify last known-good production deployment URL.
2. Run:
   - `cd /Users/tahouranedaee/Desktop/BPAN-Platform`
   - `npx --yes vercel rollback https://bpan-5pgqfp6kb-tara-neddersens-projects.vercel.app -y`
3. Confirm production alias now points to stable build:
   - `curl -sS -o /dev/null -D - https://bpan-app.vercel.app/experiments`
   - `curl -sS -o /dev/null -D - https://bpan-app.vercel.app/labs`
   - `curl -sS -o /dev/null -D - https://bpan-app.vercel.app/operations`
   - `curl -sS -o /dev/null -D - https://bpan-app.vercel.app/results`

## B) Git fallback redeploy (if rollback command unavailable/insufficient)
Known anchors:
- branch: `safe/works-perfect-before-deploy-20260304`
- tag: `safe-rollback-20260304T222250Z`

Steps:
1. Checkout fallback anchor:
   - `cd /Users/tahouranedaee/Desktop/BPAN-Platform`
   - `git checkout safe/works-perfect-before-deploy-20260304`
2. Redeploy production:
   - `npx --yes vercel deploy --prod -y`
3. Optional tag-based fallback:
   - `git checkout tags/safe-rollback-20260304T222250Z`
   - `npx --yes vercel deploy --prod -y`

## 6) Verification After Rollback
Run immediately and again at `T+30m`.

- [ ] Route smoke:
  - `/experiments`, `/labs`, `/labs/chat`, `/operations`, `/results`, `/notifications`
- [ ] Critical mutation checks:
  - run-create no-schedule
  - labs chat thread create/send
  - operations reagent thread post + reload persistence
  - operations booking create/edit/delete/status
- [ ] Logs:
  - verify critical-path 5xx rate drops to baseline
- [ ] Integration:
  - Quartzy sync health checks pass

## 7) Ops Notes Template (During 48h Window)
For each check window, record:
- timestamp
- environment URL
- pass/fail by flow
- request/status evidence for failures
- action taken (watch/hotfix/rollback)
