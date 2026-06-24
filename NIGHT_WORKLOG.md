# Overnight Work Log — BPAN / LabLynx

**Mission:** Iterate until the platform is polished, coherent, and sellable. Fix bugs (reported + discovered), build requested features, overhaul the UI (pop-ups, decluttered, professional), ensure the pipeline and cross-feature connections make sense, verify with evaluator agents. Log every change.

**Started:** night of 2026-06-23 (PT). Target: continuous progress by morning.

## Operating policy
- Data is sacred: additive migrations only, backup before schema changes, no data loss.
- Verify before promote: typecheck → build → evaluator-agent review → deploy. Rollback armed.
- Deploy default: verified bug-fixes/contained features → production; big/subjective (UI overhaul, strains) → preview URL for morning review.
- Branch: `codex/lablynx-branding-clean`. Repo: Tara-Neddersen/BPAN-Platform.

## Backlog (waves)
- Wave 1 (bugs): #6 cohort sort ✅ DONE & LIVE (37cb958) · #11 averages · #8 sticky cols · #7 colors · #9 Sheets sync
- Wave 2 (features): inline animal creation + auto ear-tags + `cohort#-mouse#` naming · line-graph timepoint toggle · drag-drop weekly calendar · strains as top-level grouping
- Wave 3 (UX): app-wide audit + Analysis flagship redesign (pop-ups, declutter, fix misplaced/duplicate subtabs)
- Wave 4: deep cross-feature connection audit + evaluator pass + final verification

## Change log
| Time (PT) | Commit | Area | Change | Verified |
|-----------|--------|------|--------|----------|
| 2026-06-23 eve | 1c69a57 | Battery save | Unique result-column keys (fix duplicate-key save crash) | tsc, build, live |
| 2026-06-23 eve | e7f13a2 | Battery timepoints | age_days from nominal label, not range floor | tsc, build, live |
| 2026-06-23 eve | 1403d7c | Battery/Legacy | Removed colony-timepoint bridge — batteries fully isolated | tsc, build, live |
| 2026-06-23 night | 37cb958 | Cohort ordering | Natural numeric sort (3 before 10) across tracker/results/colony/dropdowns | tsc, build, live |

## Open questions for the user (non-blocking; defaults assumed)
1. Deploy policy: prod for safe changes + preview for big ones (default) vs everything to prod?
2. Sheets sync failure mode (error vs nothing) + Sheets-vs-Drive connection?
3. Anything off-limits?

## New feature request (added ~20:34 PT)
- **Repurpose a cohort mouse as a breeder** — a "Move to breeders" / "Mark as breeder" action available everywhere it makes sense (animal row in Animals list, animal detail, cohort view). Schema foundation exists: migration 069 already added the `breeding` animal status for exactly this. Wire the action to set status=breeding + link/create a breeder cage entry, and make sure such animals drop out of active/experimental lists but keep their historical results. Queued behind the table agent (touches colony-client.tsx). Wave 2.

## Status checkpoints
- 20:34 PT — Wave-1 table agent running (#7/#8/#11). Sheets #9 root-caused (API disabled in GCP project — user one-click fix). Spawning analysis line-graph agent (#1, disjoint file). ~15.5h remaining.

## Notes / discoveries
- (running notes appended as work proceeds)
- **#11 averages root cause:** `lib/derived-measures.ts` only implements Y-maze `total_entries`. The user's generic "Average" columns (key `average_score`, with `averageSourceKeys` + `options:[__average__, field:...]`) are NOT computed anywhere — they're effectively empty manual fields. Fix = generic derived-average that reads each average column's source keys from the schema and computes the row mean live in `colony-results-tab.tsx` (schema is available there; `applyDerivedMeasures` only gets measures, not the schema, so the computation must live where the schema is or take the schema as an arg). Medium effort; correctness-critical.
- Deep-audit workflow launched (run wf_b2870ee6-887, 12 area agents + synthesizer) — backlog will drive the rest of the night.
- **Deep audit COMPLETE:** 113 findings → 46 prioritized items saved to AUDIT_BACKLOG.md. Top themes: critical security gaps (CORS wildcard, plaintext OAuth tokens, token endpoints no rate-limit), the two-results data-model split, tracker usability (read-only, sticky), IA cleanup (misplaced/duplicate tabs), Analysis clutter. Rank-1 "path" finding is a false alarm (audit agents' cwd was the Drive data folder; real code is the Desktop git repo).
- Execution plan: (A) safe verified fixes → production: averages #11/#15, colors #7, sticky #8, timepoint validation #22, Sheets refresh guard #4. (B) risky/big → preview for morning sign-off: security auth changes (#2,#3,#6,#7-sec), results consolidation #14/#16, strains, UI overhaul. Evaluator agent review before every prod deploy.
- Spawned background implementation agent for Wave-1 colony/results table batch (#7 colors, #8 sticky cols, #11 generic averages) — serialized on shared files; main loop will review+build+deploy.
- **#9 Google Sheets sync ROOT CAUSE FOUND (not a code bug):** tested the stored token live — it refreshes fine and has all scopes (spreadsheets + drive.file). The real error is `HTTP 403: Google Sheets API has not been used in project 591300647601 ... or it is disabled`. **The Google Sheets API is DISABLED in the Google Cloud project.** USER ACTION (one click): enable "Google Sheets API" (and "Google Drive API") at https://console.cloud.google.com/apis/library?project=591300647601 (direct: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=591300647601). No reconnect needed — token is valid.
  - Code improvement made (lib/google-sheets.ts): detect the "API disabled" 403 and surface a clear actionable message (`getGoogleSheetsApiDisabledMessage`) instead of a cryptic dump / misleading "reconnect" prompt. Applied in validateGoogleSheetsAccess (single chokepoint) + createGoogleSpreadsheet. Will typecheck+deploy with the Wave-1 batch.
