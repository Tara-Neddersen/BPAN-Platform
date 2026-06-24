# LabLynx Deep-Audit Backlog

_113 raw findings → 46 prioritized items. By area: colony=1, battery=14, runs=9, tracker=9, results=8, analysis=9, integrations=12, ia-nav=10, data-model=9, ui-system=11, security=14, reliability=7_

## Executive summary

LabLynx is a feature-rich lab platform (colony management, batteries, run execution, results, analysis, plus Google/Outlook/Quartzy integrations) but it is not yet sellable: the audit surfaces real shipping blockers in security and data integrity that sit underneath an unfinished information architecture. The most urgent themes are (1) authorization/secrets — wildcard CORS on authenticated endpoints, token-only public endpoints with no rate limiting, plaintext OAuth tokens at rest, and query layers that lean entirely on RLS with no defensive filtering; and (2) a half-migrated data model — legacy vs run-based results coexist without constraints, dataset→run links are nullable backfills, a referenced 'studies' table doesn't exist, and cascade deletes run in loops with no error handling, so silent corruption is plausible. The second tier is a fractured UX: two competing results surfaces, duplicated/divergent derived-measure logic, a read-only unscalable tracker matrix, destructive actions with no confirmation, and a monolithic Colony page whose tabs are simultaneously dead and duplicated in the navbar. Note one meta-risk: the audit's file paths point at a Desktop bpan-app tree while the working directory is a Google-Drive-synced folder, so confirm the canonical git repo before editing anything. Recommended sequencing: lock down auth/secrets and add query-layer ownership filters first, then converge the data model (constraints + one results path + backfill tools), then consolidate results/tracker/navigation, with the long tail of styling and accessibility polish handled opportunistically. Be ruthless: the integration token-refresh reliability bugs and the dual-data-model ambiguity will generate support load and data-trust failures faster than any cosmetic issue, so they outrank the large UI-system refactors despite the latter being more visible.

## Prioritized backlog

| # | sev | eff | area | title | files |
|---|-----|-----|------|-------|-------|
| 1 | critical | S | infra/meta | Audit could not locate the actual source tree — confirm canonical repo path before acting on file-line findings | working dir vs /Users/tahouranedaee/Desktop/📁 Code & Apps/BPAN-Platform/bpan-app |
| 2 | critical | S | security | CORS allows any origin ('*') on authenticated API incl. extension login | src/lib/cors.ts:6-12; src/app/api/extension/login/route.ts |
| 3 | critical | M | runs/security | Run/experiment data fetched with select('*') and no owner/lab filter — relies solely on RLS | src/app/(protected)/experiments/page.tsx (~fetchRunExecutionData, ~220-230) |
| 4 | critical | S | integrations | Google Sheets OAuth refresh_token can be silently absent → all future syncs fail | src/app/api/sheets/google/callback/route.ts:79-85 |
| 5 | critical | M | data-model | study-scoped run assignments reference a non-existent studies table | supabase/migrations/040_platform_phase2_scheduling.sql:110 |
| 6 | high | L | security | Token-only public endpoints (PI portal, calendar feed, share, extension login) have no rate limiting / brute-force protection | src/app/api/pi/[token]/*; src/app/api/calendar/feed/[token].ics/route.ts; src/ap |
| 7 | high | L | security | Google Drive/Sheets/Outlook OAuth tokens stored in plaintext at rest | supabase/migrations/053_google_sheets_live_sync.sql:1-8; google_drive_tokens; ou |
| 8 | high | M | integrations | Token refresh failure modes are silent — DB-update errors swallowed, scope validation skipped on network failure, refresh race conditions | src/lib/outlook-equipment-calendar.ts:93-104; src/lib/google-sheets.ts:108-129,1 |
| 9 | high | S | integrations | Cron-triggered sync endpoints accept generic/fallback secrets and lack strict auth | src/app/api/sheets/google/auto-sync/route.ts:1-10,302-309 |
| 10 | high | M | runs | run_assignments has no unique constraint per run; save deletes-then-reinserts and silently drops extras | src/app/(protected)/experiments/run-actions.ts:1191-1213; run_assignments schema |
| 11 | high | L | runs | Run→Battery→Cohort schedule generation is fragile and silently no-ops when the battery is missing | src/app/(protected)/experiments/run-actions.ts:260-528 (esp. 310-311,347-367,414 |
| 12 | high | M | reliability | Cascade deletes/updates in colony actions run in loops with no per-batch error handling or rollback | src/app/(protected)/colony/actions.ts:795-810,841-842,1315-1350,1565-1619 |
| 13 | high | M | reliability | Form fields parsed/cast without validation (unsafe parseInt + 'as string' on possibly-null required fields) | src/app/(protected)/colony/actions.ts:72-100,101,712-723,752-763,713,1295,1523 |
| 14 | high | L | results | Two competing results surfaces (ColonyResultsTab vs ResultsClient) with divergent behavior | src/components/colony-results-tab.tsx; src/components/results-client.tsx |
| 15 | high | M | results | Derived-measure logic duplicated across two files; rotarod/stamina averages never computed in primary surface, and derived columns editable in ResultsClient | src/lib/derived-measures.ts:75,95,106; src/components/colony-results-tab.tsx:213 |
| 16 | high | L | data-model | Dual colony_results data model (legacy timepoint/experiment_type vs run-based FKs) with no constraint or migration path | src/types/index.ts:568-582; src/app/(protected)/colony/result-actions.ts:162-189 |
| 17 | high | M | data-model | dataset→experiment_run link is nullable/backfilled, breaking battery→run→results→analysis traceability | supabase/migrations/047_backfill_run_template_lab_links.sql:6-10; supabase/migra |
| 18 | high | L | ia-nav | Colony tabs are unreachable / duplicated across navbar and page; monolithic 9-tab Colony page | src/components/colony-client.tsx:1246-1254,1979; src/components/nav.tsx:42-83 |
| 19 | high | M | ui-system | No confirmation for destructive/bulk actions; deletes fire immediately and batch ops give no preview | src/components/colony-client.tsx:1525,358-362; src/components/experiment-tracker |
| 20 | high | L | tracker | Tracker matrix is read-only with no sort/reorder — unusable at scale | src/components/experiment-tracker-matrix.tsx:320-349 |
| 21 | high | M | tracker | Run-selected matrix silently drops AnimalExperiment (legacy) status; users see false 'complete' picture | src/components/experiment-tracker-matrix.tsx:254-273,322-349 |
| 22 | high | M | battery | Battery timepoint windows accept invalid age ranges (non-numeric, min>max, no range) and orphaned layout items | src/components/battery-creation-wizard.tsx:286,808-816,1319-1331,1935-1939,2054- |
| 23 | high | L | ui-system | No unified form/modal pattern; errors shown only via transient toasts with no field-level validation | src/components/colony-client.tsx:786-803,1050-1086,2204 |
| 24 | medium | M | security | Service-role client used where authenticated client + RLS would suffice, bypassing defense-in-depth | src/app/api/gdrive/photo/route.ts:22; src/app/api/pi/[token]/photo/[photoId]/rou |
| 25 | medium | M | security | PI portal: unvalidated can_see permissions, no operator-message length limit (ReDoS risk), DB-side photo proxy exposes lab Drive | src/app/api/pi/[token]/route.ts:55,67-73; src/app/api/pi/[token]/operator/route. |
| 26 | medium | S | battery/runs | exact_time slots accept any string — no HH:MM validation before persisting to start_time | src/components/battery-creation-wizard.tsx:2094-2098,1247; src/components/schedu |
| 27 | medium | M | battery | ScheduledBlock.metadata is untyped/inconsistent; reducing dayCount orphans blocks; window settings only in local state | src/components/schedule-builder.tsx:315-318,471,559-576,823-872,841-845; battery |
| 28 | medium | M | runs | Run block instantiation: silent dedup drops intentional duplicates; multi-window expansion loses traceability | src/app/(protected)/experiments/run-actions.ts:187-222,662-717 |
| 29 | medium | S | data-model | message_threads can link to 'protocol' but access function returns false → messages become inaccessible | supabase/migrations/046_add_lab_root_chat_and_message_reads.sql:50-80 |
| 30 | medium | S | data-model | Missing/weak constraints and indexes on run results (no schema↔template check; index omits animal_id) | supabase/migrations/068_run_results_layout.sql:35,219-220 |
| 31 | medium | M | integrations | Sheets/Quartzy/Outlook sync swallow partial failures (pagination stops, sanitizeImportConfig fallback, orphaned Outlook maps, token errors not surfaced) | scripts/quartzy_sync_orders.mjs:176-210; src/app/api/sheets/google/sync/route.ts |
| 32 | medium | M | reliability | Fire-and-forget promises lose data/audit silently (meeting save clears draft on failure; auto-title; assistant action logs) | src/components/meetings-client.tsx:477; src/app/api/advisor/chat/route.ts:145-15 |
| 33 | medium | L | analysis | Analysis panel: overloaded single 12-col control grid and buried save/load + figure studio workflows | src/components/colony-analysis-panel.tsx:2124,3706,5215,7807 |
| 34 | medium | S | analysis | Timepoint/line-chart constraints not communicated until after failure | src/components/colony-analysis-panel.tsx:3406,7766-7772,8575-8581; src/app/(prot |
| 35 | medium | M | tracker | Matrix cell ambiguity and truncated headers reduce trust in the data shown | src/components/experiment-tracker-matrix.tsx:624,627-632,661-663,694,743-755 |
| 36 | medium | M | runs | Run status transitions and cross-run block integrity are unconstrained | src/components/run-execution-builder.tsx:425-437,943-974 |
| 37 | medium | L | ui-system | Inconsistent loading/empty/error states and ad-hoc styling (inline gradients, varied spacing, mobile breakpoints) | src/components/colony-client.tsx:983-1000,1022-1024,1545,1630; src/components/re |
| 38 | medium | M | ui-system | Icon-only buttons and color-only status badges lack accessibility affordances | src/components/colony-client.tsx:1022-1024,1522-1527; src/app/(protected)/dashbo |
| 39 | medium | M | ia-nav | Experiments section lacks a 'Batteries' list and uses ambiguous taxonomy labels | src/components/experiments-client.tsx:87-97 |
| 40 | medium | M | ia-nav | Move global Protocol Timepoints out of the Cohorts tab; clarify ambiguous tab labels | src/components/colony-client.tsx:1464-1536; src/components/nav.tsx:82,88-95 |
| 41 | medium | M | battery | Battery editing forces full 5-step re-entry; review page too sparse for complex batteries | src/components/experiments-client.tsx:1049-1062; src/components/battery-creation |
| 42 | medium | M | data-model | No unified Run→Results→Analysis navigation/breadcrumb | src/app/(protected)/experiments/page.tsx; colony result entry form |
| 43 | medium | M | results | Import handling/derivation validation inconsistent across surfaces; derived labels not shown in viz | src/lib/results-import.ts; src/components/behavior-import-dialog.tsx; src/compon |
| 44 | low | S | battery | Schedule template name/description unvalidated; copy-to-timepoints lacks overwrite preview | src/components/schedule-builder.tsx:1347; src/components/battery-creation-wizard |
| 45 | low | S | reliability | Defensive cleanups: unsafe timepoints[0] fallback; web push deletions/audit gaps | src/app/(protected)/colony/actions.ts:1295,1523; supabase/migrations/061_web_pus |
| 46 | low | S | ui | Low-value polish: view-mode persistence, badge wrapping, dropdown summaries, sticky notes column | src/components/schedule-builder.tsx:470; src/components/colony-analysis-panel.ts |

## Fix detail

### #1 [critical/S] Audit could not locate the actual source tree — confirm canonical repo path before acting on file-line findings
- **area:** infra/meta  **files:** working dir vs /Users/tahouranedaee/Desktop/📁 Code & Apps/BPAN-Platform/bpan-app
- **fix:** Confirm the canonical repo path (findings reference /Users/.../Desktop/📁 Code & Apps/BPAN-Platform/bpan-app while cwd is the Google Drive 'BPAN Platform' folder). All file:line references below assume the Desktop bpan-app tree. Verify that path is the source of truth and git-tracked before changing anything; a Google-Drive-synced working copy is unsafe to edit directly.

### #2 [critical/S] CORS allows any origin ('*') on authenticated API incl. extension login
- **area:** security  **files:** src/lib/cors.ts:6-12; src/app/api/extension/login/route.ts
- **fix:** Replace wildcard Access-Control-Allow-Origin with an allowlist of trusted origins (env-configured extension origin). Never combine '*' with credentialed/authenticated endpoints.

### #3 [critical/M] Run/experiment data fetched with select('*') and no owner/lab filter — relies solely on RLS
- **area:** runs/security  **files:** src/app/(protected)/experiments/page.tsx (~fetchRunExecutionData, ~220-230)
- **fix:** Add explicit .eq('owner_user_id', userId) / lab visibility filters at the query layer in fetchRunExecutionData() (defense in depth), and verify RLS on run_schedule_blocks and run_assignments matches.

### #4 [critical/S] Google Sheets OAuth refresh_token can be silently absent → all future syncs fail
- **area:** integrations  **files:** src/app/api/sheets/google/callback/route.ts:79-85
- **fix:** In the OAuth callback, if neither a new nor existing refresh_token is present, throw a clear 'reconnect with consent' error instead of persisting null. Already sets access_type=offline + prompt=consent; add the missing-token guard.

### #5 [critical/M] study-scoped run assignments reference a non-existent studies table
- **area:** data-model  **files:** supabase/migrations/040_platform_phase2_scheduling.sql:110
- **fix:** Either create a studies table (id/user_id/lab_id/name) with an FK enforced when scope_type='study', or remove 'study' as a scope option until implemented. Currently study_id is orphaned with no validation.

### #6 [high/L] Token-only public endpoints (PI portal, calendar feed, share, extension login) have no rate limiting / brute-force protection
- **area:** security  **files:** src/app/api/pi/[token]/*; src/app/api/calendar/feed/[token].ics/route.ts; src/app/api/share/[token]/route.ts; src/app/api/extension/login/route.ts; supabase/migrations/028_calendar_integrations.sql:27
- **fix:** Add IP+token rate limiting and exponential backoff to all token-addressed endpoints; add token expiration and a revocation flag. Strengthen weak token generation (replace md5(random()...) calendar token with encode(gen_random_bytes(32),'hex')). Enforce expires_at on shared snapshots (currently never checked).

### #7 [high/L] Google Drive/Sheets/Outlook OAuth tokens stored in plaintext at rest
- **area:** security  **files:** supabase/migrations/053_google_sheets_live_sync.sql:1-8; google_drive_tokens; outlook tokens
- **fix:** Encrypt tokens at rest (Supabase Vault / envelope encryption), decrypt only on use, and add token-refresh logging + revocation. Refresh tokens are the highest-value secret in the DB.

### #8 [high/M] Token refresh failure modes are silent — DB-update errors swallowed, scope validation skipped on network failure, refresh race conditions
- **area:** integrations  **files:** src/lib/outlook-equipment-calendar.ts:93-104; src/lib/google-sheets.ts:108-129,146
- **fix:** Three related fixes: (1) throw when the post-refresh DB update fails instead of proceeding with an in-memory-only token (Outlook); (2) make validateGoogleSheetsScopes throw on 5xx/network failure rather than returning success; (3) treat invalid_grant as 'reconnect required' and serialize concurrent refreshes (lock/refreshing flag) to avoid double-refresh races.

### #9 [high/S] Cron-triggered sync endpoints accept generic/fallback secrets and lack strict auth
- **area:** integrations  **files:** src/app/api/sheets/google/auto-sync/route.ts:1-10,302-309
- **fix:** Require a single dedicated secret (SHEETS_CRON_SECRET) and reject if missing, rather than falling back through CRON_SECRET/CALENDAR_CRON_SECRET/etc. Validate the Authorization header before any work in auto-sync.

### #10 [high/M] run_assignments has no unique constraint per run; save deletes-then-reinserts and silently drops extras
- **area:** runs  **files:** src/app/(protected)/experiments/run-actions.ts:1191-1213; run_assignments schema
- **fix:** Add UNIQUE(experiment_run_id) on run_assignments to enforce 1:1 with runs (matching the single-scope UI), and surface a warning in RunExecutionBuilder if multiple assignments are ever found.

### #11 [high/L] Run→Battery→Cohort schedule generation is fragile and silently no-ops when the battery is missing
- **area:** runs  **files:** src/app/(protected)/experiments/run-actions.ts:260-528 (esp. 310-311,347-367,414-426)
- **fix:** Make battery discovery explicit: validate/require the battery at run creation, store its reference in run metadata, query the battery by tags at the DB level (not load-all-then-filter), and throw a clear error instead of computing schedules with null age windows when not found.

### #12 [high/M] Cascade deletes/updates in colony actions run in loops with no per-batch error handling or rollback
- **area:** reliability  **files:** src/app/(protected)/colony/actions.ts:795-810,841-842,1315-1350,1565-1619
- **fix:** Check the error on each delete/update in deleteColonyTimepoint/updateColonyTimepoint loops; fail-fast or collect+report failed batches. Use atomic/transactional operations where possible to avoid half-applied cascades that corrupt cohort state.

### #13 [high/M] Form fields parsed/cast without validation (unsafe parseInt + 'as string' on possibly-null required fields)
- **area:** reliability  **files:** src/app/(protected)/colony/actions.ts:72-100,101,712-723,752-763,713,1295,1523
- **fix:** Validate form payloads at the boundary (zod schema) and use a safe int parser. Replaces fragile parseInt(formData.get(x) as string)||fallback and null-as-string casts that produce cryptic DB null errors instead of actionable validation messages.

### #14 [high/L] Two competing results surfaces (ColonyResultsTab vs ResultsClient) with divergent behavior
- **area:** results  **files:** src/components/colony-results-tab.tsx; src/components/results-client.tsx
- **fix:** Consolidate to ResultsClient as the single results surface (it already has data + visualization tabs); deprecate ColonyResultsTab or redirect the tracker results tab into ResultsClient in capture mode. Eliminates duplicate/competing data-entry UX.

### #15 [high/M] Derived-measure logic duplicated across two files; rotarod/stamina averages never computed in primary surface, and derived columns editable in ResultsClient
- **area:** results  **files:** src/lib/derived-measures.ts:75,95,106; src/components/colony-results-tab.tsx:213-257; src/components/results-client.tsx (run-capture panel ~1385-1450)
- **fix:** Move applyDerivedMeasuresForExperiment into lib/derived-measures.ts as one unified function (Y-maze total_entries + rotarod + stamina), call it from both surfaces, and enforce isDerivedReadOnlyField in ResultsClient so computed columns (latency_to_fall_sec, rpm_at_fall, avg_duration_sec) are non-editable. Protects data integrity.

### #16 [high/L] Dual colony_results data model (legacy timepoint/experiment_type vs run-based FKs) with no constraint or migration path
- **area:** data-model  **files:** src/types/index.ts:568-582; src/app/(protected)/colony/result-actions.ts:162-189; supabase/migrations/068_run_results_layout.sql
- **fix:** Add a DB constraint forbidding a legacy result when a matching run-based result exists, pick a single source-of-truth write path, and ship a one-time backfill tool to upgrade legacy results to the run-based model. Currently the same animal+timepoint+experiment can have two divergent rows.

### #17 [high/M] dataset→experiment_run link is nullable/backfilled, breaking battery→run→results→analysis traceability
- **area:** data-model  **files:** supabase/migrations/047_backfill_run_template_lab_links.sql:6-10; supabase/migrations/009_results_analyzer.sql:12
- **fix:** Make experiment_run_id NOT NULL for new datasets created from analysis/run import; provide a batch-link tool for existing unlinked datasets; document it as immutable. Also remove the dead dataset.experiment_id FK to the deprecated experiments table.

### #18 [high/L] Colony tabs are unreachable / duplicated across navbar and page; monolithic 9-tab Colony page
- **area:** ia-nav  **files:** src/components/colony-client.tsx:1246-1254,1979; src/components/nav.tsx:42-83
- **fix:** Pick one navigation model: make tracker/results/analysis/pi reachable as visible tabs OR as top-level routes — not both. Add the missing TabsTriggers (tracker, results, analysis, pi) or remove the dead TabsContent, and remove the duplicate PRIMARY_NAV vs SECONDARY_NAV colony entries. Strongly consider splitting the monolithic colony page into focused per-task routes.

### #19 [high/M] No confirmation for destructive/bulk actions; deletes fire immediately and batch ops give no preview
- **area:** ui-system  **files:** src/components/colony-client.tsx:1525,358-362; src/components/experiment-tracker-matrix.tsx:447-610; battery-creation-wizard.tsx:1919-1922
- **fix:** Add a reusable ConfirmDialog for all delete/destructive actions and a preview modal for batch operations (e.g., 'This will reschedule/delete N records for M animals'). Include affected-count summaries for timepoint-window deletion and batch tracker updates.

### #20 [high/L] Tracker matrix is read-only with no sort/reorder — unusable at scale
- **area:** tracker  **files:** src/components/experiment-tracker-matrix.tsx:320-349
- **fix:** Add sortable/clickable column headers, column reordering or per-timepoint visibility toggles, and a 'group by experiment type' option, persisting preference per run. Core workhorse view currently has fixed column order for 20+ timepoints × 5+ experiments.

### #21 [high/M] Run-selected matrix silently drops AnimalExperiment (legacy) status; users see false 'complete' picture
- **area:** tracker  **files:** src/components/experiment-tracker-matrix.tsx:254-273,322-349
- **fix:** When a run is selected, union AnimalExperiment status with ColonyResult-backed status (match on timepoint_age_days/experiment_type) and badge cells that have legacy data, OR show a clear banner that only run-based assignments are displayed. Prevents missed/over-scheduled experiments.

### #22 [high/M] Battery timepoint windows accept invalid age ranges (non-numeric, min>max, no range) and orphaned layout items
- **area:** battery  **files:** src/components/battery-creation-wizard.tsx:286,808-816,1319-1331,1935-1939,2054-2106
- **fix:** Validate timepoint windows at save: minAgeDays/maxAgeDays are positive numbers with min<=max; validate layout-step items reference an existing window (timepointWindows.some(w=>w.id===item.timepointWindowId)); warn when scheduling into a window with no defined range. Surface errors in toast.

### #23 [high/L] No unified form/modal pattern; errors shown only via transient toasts with no field-level validation
- **area:** ui-system  **files:** src/components/colony-client.tsx:786-803,1050-1086,2204
- **fix:** Introduce a FormModal wrapper (header/body/footer, async submit with loading, inline field errors, success callback) and adopt React Hook Form-style field-level validation. Standardizes the mix of inline-edit/drawer/dialog forms and replaces disappearing error toasts on large forms.

### #24 [medium/M] Service-role client used where authenticated client + RLS would suffice, bypassing defense-in-depth
- **area:** security  **files:** src/app/api/gdrive/photo/route.ts:22; src/app/api/pi/[token]/photo/[photoId]/route.ts:22; src/app/api/labs/chat/seen/route.ts:45; src/app/api/calendar/feed/[token].ics/route.ts:26
- **fix:** Swap createServiceClient() for the authenticated client on routes that already validate a user/token (gdrive photo, pi photo, labs chat seen, calendar feed); reserve service role for cron/webhooks/admin. Verify RLS exists on colony_photos, advisor_portal, message_reads, calendar_feed_tokens so an app-layer miss is still caught.

### #25 [medium/M] PI portal: unvalidated can_see permissions, no operator-message length limit (ReDoS risk), DB-side photo proxy exposes lab Drive
- **area:** security  **files:** src/app/api/pi/[token]/route.ts:55,67-73; src/app/api/pi/[token]/operator/route.ts:44-45; src/app/api/pi/[token]/photo/[photoId]/route.ts:45-69
- **fix:** Whitelist allowed can_see values and reject others; validate results_drive_url belongs to portal.user_id; cap operator message length (e.g. 2000) with regex timeouts; cache PI-shared photos server-side instead of proxying the lab's live Drive token. Add audit logging for these accesses.

### #26 [medium/S] exact_time slots accept any string — no HH:MM validation before persisting to start_time
- **area:** battery/runs  **files:** src/components/battery-creation-wizard.tsx:2094-2098,1247; src/components/schedule-builder.tsx:1001-1005,1359
- **fix:** Add a shared time-format validator (/^\d{1,2}:\d{2}$/) used by both the battery wizard and schedule builder; block Next/Save and show an inline error on malformed exact_time values that otherwise corrupt downstream time sorting/filtering.

### #27 [medium/M] ScheduledBlock.metadata is untyped/inconsistent; reducing dayCount orphans blocks; window settings only in local state
- **area:** battery  **files:** src/components/schedule-builder.tsx:315-318,471,559-576,823-872,841-845; battery-creation-wizard.tsx:1264-1271
- **fix:** Define a ScheduledBlockMetadata interface with typed getters/setters and validate/repair on load (log repairs). Persist window settings reliably (dedicated table or guaranteed metadata on every block) so they survive template switches. When dayCount decreases, warn about or relocate blocks beyond the new range instead of silently orphaning them on save.

### #28 [medium/M] Run block instantiation: silent dedup drops intentional duplicates; multi-window expansion loses traceability
- **area:** runs  **files:** src/app/(protected)/experiments/run-actions.ts:187-222,662-717
- **fix:** Preserve traceability on expanded/deduped blocks (store expandedFrom/windowIndex in metadata, use a distinctKey/UUID) so intentional duplicate tests on the same day survive and override detection works correctly. Guard against empty window-name defaults.

### #29 [medium/S] message_threads can link to 'protocol' but access function returns false → messages become inaccessible
- **area:** data-model  **files:** supabase/migrations/046_add_lab_root_chat_and_message_reads.sql:50-80
- **fix:** Add a 'protocol' branch to can_access_operations_linked_object() that checks protocols.user_id = auth.uid(), so protocol-linked messages are not silently lost behind RLS.

### #30 [medium/S] Missing/weak constraints and indexes on run results (no schema↔template check; index omits animal_id)
- **area:** data-model  **files:** supabase/migrations/068_run_results_layout.sql:35,219-220
- **fix:** Add a check ensuring run_timepoint_experiment.result_schema_id belongs to the run's template, and add idx_colony_results_run_animal(experiment_run_id, animal_id, run_timepoint_experiment_id) WHERE experiment_run_id IS NOT NULL to support the common per-run-per-animal fetch.

### #31 [medium/M] Sheets/Quartzy/Outlook sync swallow partial failures (pagination stops, sanitizeImportConfig fallback, orphaned Outlook maps, token errors not surfaced)
- **area:** integrations  **files:** scripts/quartzy_sync_orders.mjs:176-210; src/app/api/sheets/google/sync/route.ts:276; src/lib/outlook-equipment-calendar.ts:347-358; src/app/api/sheets/google/auto-sync/route.ts:254-271
- **fix:** Throw/log on mid-pagination failures with retry/backoff (Quartzy); warn when sanitizeImportConfig discards invalid mappings instead of silently defaulting; delete orphaned Outlook event maps when a BPAN booking no longer exists; surface token/invalid_grant errors as a prominent 'reconnect' alert in the Sheets UI.

### #32 [medium/M] Fire-and-forget promises lose data/audit silently (meeting save clears draft on failure; auto-title; assistant action logs)
- **area:** reliability  **files:** src/components/meetings-client.tsx:477; src/app/api/advisor/chat/route.ts:145-151; src/app/api/labs/assistant/route.ts (1422+ logging calls)
- **fix:** Add .catch handlers that log (and toast where user-facing): don't clear the meeting localStorage draft unless onSave succeeds; log+retry conversation auto-title failures and reuse the outer Supabase client; upgrade assistant audit-log .catch(()=>undefined) to warn-level logging so missing audit records for high-impact actions are visible.

### #33 [medium/L] Analysis panel: overloaded single 12-col control grid and buried save/load + figure studio workflows
- **area:** analysis  **files:** src/components/colony-analysis-panel.tsx:2124,3706,5215,7807
- **fix:** Separate core stat controls (test type, measure) from model-specific advanced fields (accordion/collapsible 'Test-Specific Options'); surface a discoverable 'Load Analysis'/'Compare Revisions' entry point; move Figure Studio into a dedicated 'Figure Settings' modal. Reduces clutter and makes primary workflows findable.

### #34 [medium/S] Timepoint/line-chart constraints not communicated until after failure
- **area:** analysis  **files:** src/components/colony-analysis-panel.tsx:3406,7766-7772,8575-8581; src/app/(protected)/colony/analysis/page.tsx
- **fix:** Compute unique timepoints in current scope and proactively disable the 'Timepoints (line)' chart type and 'Genotype×Sex×Timepoint' grouping with explanatory tooltips when <2 timepoints are selected, instead of showing a reactive error after selection. Show 'Timepoints selected: N' in the viz header.

### #35 [medium/M] Matrix cell ambiguity and truncated headers reduce trust in the data shown
- **area:** tracker  **files:** src/components/experiment-tracker-matrix.tsx:624,627-632,661-663,694,743-755
- **fix:** Visually distinguish 'pending' from 'no record' (use the pending icon vs an empty cell), widen/rotate truncated experiment headers with instant hover tooltips, and add per-timepoint completion indicators. Fix sticky-header z-index/rowSpan layering so the Animal column stays aligned on scroll.

### #36 [medium/M] Run status transitions and cross-run block integrity are unconstrained
- **area:** runs  **files:** src/components/run-execution-builder.tsx:425-437,943-974
- **fix:** Enforce valid run status transitions (and block reopening completed runs with recorded results without flagging dependents); add NOT NULL + unique(experiment_run_id,id) on run_schedule_blocks and validate block↔run integrity on load to prevent showing another run's blocks after a bad save.

### #37 [medium/L] Inconsistent loading/empty/error states and ad-hoc styling (inline gradients, varied spacing, mobile breakpoints)
- **area:** ui-system  **files:** src/components/colony-client.tsx:983-1000,1022-1024,1545,1630; src/components/results-client.tsx:81; src/app/(protected)/dashboard/page.tsx:189-248
- **fix:** Ship reusable LoadingSkeleton/ErrorState/EmptyState components (incl. for dynamic Plotly import), and centralize spacing/tone tokens + StatCard/StatusBadge components to replace inline styles, ternary badge className logic, and grid-to-flex inconsistencies. Audit responsive breakpoints and add table horizontal-scroll fallbacks.

### #38 [medium/M] Icon-only buttons and color-only status badges lack accessibility affordances
- **area:** ui-system  **files:** src/components/colony-client.tsx:1022-1024,1522-1527; src/app/(protected)/dashboard/page.tsx:634-641
- **fix:** Add aria-label to icon-only edit/delete buttons, ensure status is conveyed by text/icon not color alone, add visible focus-visible rings, and label dialog close buttons. Quick, broad accessibility win across colony/dashboard.

### #39 [medium/M] Experiments section lacks a 'Batteries' list and uses ambiguous taxonomy labels
- **area:** ia-nav  **files:** src/components/experiments-client.tsx:87-97
- **fix:** Add a 'Batteries' tab to list/manage saved batteries (status, run count, last modified), and rename ambiguous labels ('Single Experiments'→'Experiment Templates', 'Battery Layout'→'Battery Composition') with a short legend of Protocols→Batteries→Runs.

### #40 [medium/M] Move global Protocol Timepoints out of the Cohorts tab; clarify ambiguous tab labels
- **area:** ia-nav  **files:** src/components/colony-client.tsx:1464-1536; src/components/nav.tsx:82,88-95
- **fix:** Promote Protocol Timepoints to its own top-level/Settings tab (it is global config, not per-cohort), and rename ambiguous labels ('Cage Changes'→'Maintenance Schedule', 'Memory'→'Lab Memory/Knowledge Base').

### #41 [medium/M] Battery editing forces full 5-step re-entry; review page too sparse for complex batteries
- **area:** battery  **files:** src/components/experiments-client.tsx:1049-1062; src/components/battery-creation-wizard.tsx:2125-2196
- **fix:** Add a quick-edit mode for minor changes (experiment list/names) that skips unchanged timepoint/layout steps, and expand the review step with a per-day×timepoint schedule table (slot times, notes, protocol links). Reduces friction and catches mistakes before save.

### #42 [medium/M] No unified Run→Results→Analysis navigation/breadcrumb
- **area:** data-model  **files:** src/app/(protected)/experiments/page.tsx; colony result entry form
- **fix:** Add a 'Linked Run' widget in the colony result entry form (run name/template/protocol + quick links) or a unified Run Execution dashboard, so users can navigate provenance instead of manually hopping between experiments/colony/results pages.

### #43 [medium/M] Import handling/derivation validation inconsistent across surfaces; derived labels not shown in viz
- **area:** results  **files:** src/lib/results-import.ts; src/components/behavior-import-dialog.tsx; src/components/results-client.tsx; src/components/colony-results-tab.tsx:158-163,213-249
- **fix:** Extract a shared import service/hook used by both ColonyResultsTab and ResultsClient (consistent schema reconciliation), apply DERIVED_MEASURE_LABELS in ResultsClient charts/dropdowns, and warn when expected source fields for derived averages are missing (e.g., trial_1 vs trial_1_sec) instead of silently producing null.

### #44 [low/S] Schedule template name/description unvalidated; copy-to-timepoints lacks overwrite preview
- **area:** battery  **files:** src/components/schedule-builder.tsx:1347; src/components/battery-creation-wizard.tsx:1988-2037
- **fix:** Validate name (<255) and description (<2000) length and reject control/null chars before saving; show an overwrite summary ('Window X has Y items, will be replaced with Z') before 'Apply To Other Timepoints' copies.

### #45 [low/S] Defensive cleanups: unsafe timepoints[0] fallback; web push deletions/audit gaps
- **area:** reliability  **files:** src/app/(protected)/colony/actions.ts:1295,1523; supabase/migrations/061_web_push_subscriptions.sql:36-39
- **fix:** Replace timepoints[0] fallbacks with explicit empty-array guards (throw clear error), and soft-delete web_push_subscriptions with an audit log rather than hard delete. Low risk today but cheap to harden.

### #46 [low/S] Low-value polish: view-mode persistence, badge wrapping, dropdown summaries, sticky notes column
- **area:** ui  **files:** src/components/schedule-builder.tsx:470; src/components/colony-analysis-panel.tsx:3363,5236; src/components/colony-results-tab.tsx:2247,2504
- **fix:** Batch of minor UX wins: persist list/calendar view mode in localStorage; consolidate data-summary badges into one line; show a 'selected test' summary box; make the results notes/attachments columns right-sticky. Do opportunistically, not as a milestone.
