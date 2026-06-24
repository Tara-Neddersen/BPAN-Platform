# Overnight Work Log — BPAN / LabLynx

**Mission:** Iterate until the platform is polished, coherent, and sellable. Fix bugs (reported + discovered), build requested features, overhaul the UI (pop-ups, decluttered, professional), ensure the pipeline and cross-feature connections make sense, verify with evaluator agents. Log every change.

**Started:** night of 2026-06-23 (PT). Target: continuous progress by morning.

## ⭐ MORNING TL;DR (read this first)
**Already LIVE in production** (verified + evaluator-checked, your data untouched): cohort numeric sort · stronger genotype colors · sticky animal-ID + genotype columns · **average columns that actually compute** · **Analysis time-series line graph** (per-genotype/animal/cohort toggle) · clearer Google Sheets error · battery timepoint validation · **"move mouse to breeders"** feature.

**On ONE preview URL awaiting your sign-off** → **https://bpan-gdp9hltgd-tara-neddersens-projects.vercel.app** (open logged-in): the **decluttered Analysis UI** (modal-driven, evaluator: SHIP) · **drag-drop weekly-calendar days** (evaluator-fixed) · **Tracker row sorting** (SHIP) · **colony reliability hardening** (clear validation, not cryptic crashes) · **shared run selection across Tracker/Results/Analysis** (#42 — pick a run once, it follows you). Like it? Say "promote" and it all goes live in one step. *(Each new commit makes a fresh preview URL; this is the newest as of ~00:25.)*

**Your 4 quick decisions** (details in "FOR YOU IN THE MORNING" below): (1) 1-click enable Google Sheets API in GCP — that's the whole Sheets fix; (2) sign off on the preview; (3) pick the results-consolidation direction; (4) approve security-hardening rollout.

**Deep audit:** 113 findings → 46 ranked items in `AUDIT_BACKLOG.md`. Notable criticals staged for your OK (CORS, token encryption, rate-limiting). IA "duplicate subtabs" mostly false alarms; one real mis-parent (Protocol Timepoints) recommended for a reviewed fix.

---

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
| 2026-06-23 ~21:00 | 0e5462f | Wave 1 batch | #7 genotype colors, #8 sticky animal-ID+genotype cols, #11 generic computed averages, #1 analysis time-series line graph (per-genotype/animal/cohort toggle), #9 Sheets "API disabled" clear error | tsc 0 errors |
| 2026-06-23 ~21:10 | 72cc489 | Battery | #22 timepoint window validation (numeric/range/named, inline errors, save gating) | tsc 0 |
| 2026-06-23 ~21:20 | bebc879 | Wave 1 fixes | evaluator fixes: opaque sticky cells (tracker odd rows + results dark mode); guard against sourceless-average data-loss | tsc 0 |
| 2026-06-23 ~21:30 | bebc879 | **DEPLOY** | **Wave 1 + #22 + fixes LIVE in production** (lablynk.vercel.app / bpan-app.vercel.app both HTTP 200) | live ✅ |
| 2026-06-23 ~21:45 | 1f51ba3 | Breeder feature | "Move to breeders" on animal row/detail/cohort card + Status filter; moveAnimalToBreeders sets status=breeding, cascade-skips pending exps, results untouched. Self-reviewed data-safe. | tsc 0; **LIVE ✅** |
| 2026-06-23 ~22:05 | 6680bac | #12 calendar | Drag-to-reorder days. PREVIEW (needs visual sign-off): https://bpan-b9ysdjhri-tara-neddersens-projects.vercel.app | tsc 0; preview |

## Open questions for the user (non-blocking; defaults assumed)
1. Deploy policy: prod for safe changes + preview for big ones (default) vs everything to prod?
2. Sheets sync failure mode (error vs nothing) + Sheets-vs-Drive connection?
3. Anything off-limits?

## New feature request (added ~20:34 PT)
- **Repurpose a cohort mouse as a breeder** — a "Move to breeders" / "Mark as breeder" action available everywhere it makes sense (animal row in Animals list, animal detail, cohort view). Schema foundation exists: migration 069 already added the `breeding` animal status for exactly this. Wire the action to set status=breeding + link/create a breeder cage entry, and make sure such animals drop out of active/experimental lists but keep their historical results. Queued behind the table agent (touches colony-client.tsx). Wave 2.

## Status checkpoints
- 20:34 PT — Wave-1 table agent running (#7/#8/#11). Sheets #9 root-caused (API disabled in GCP project — user one-click fix). Spawning analysis line-graph agent (#1, disjoint file). ~15.5h remaining.

## Status checkpoint ~21:20 PT
- Wave-1 evaluator verdict: FIX. Found (1) sticky cells translucent on odd rows (tracker) + dark mode (results) → defeated the pin; (2) latent data-loss: sourceless "average" columns could null-wipe values. Both FIXED (commit bebc879): opaque sticky cells; applyAverageColumns now skips columns with no declared source fields. Evaluator confirmed averages math, SEM, self-reference prevention, sticky offsets, sheets regex all otherwise correct.
- Commits since last: 0e5462f (Wave 1), 72cc489 (#22 battery validation), bebc879 (review fixes). All tsc clean.
- Wave-1 batch (incl #22 + fixes) DEPLOYING to production now (background, task biwptq4jk) — gated on Vercel preview READY.
- Breeder feature (#new "move mouse to breeders") agent launched (colony-client + colony actions); uses existing `breeding` status from migration 069.

## Status checkpoint ~22:05 PT
- #12 drag-to-reorder calendar days committed (6680bac) — PREVIEW-bound (DnD needs visual sign-off; not auto-promoted to prod). Confined to schedule-builder.tsx; disambiguated from block-drag via a grip handle.
- Breeder feature (1f51ba3) promoting to production (task bka43dxx1).
- Flagship **Analysis UI overhaul** agent launched (colony-analysis-panel.tsx): declutter into modal/popover-driven professional layout, preserve all functionality, PREVIEW-bound for morning sign-off.
- Remaining queue: IA cleanup (#18/#39/#40 misplaced/duplicate subtabs), results consolidation decision (#14/#16 — needs user; they prefer Colony Results), security hardening (#2-#9 → preview), more UI polish (#19 confirmations, #37/#38 states/a11y).

## Status checkpoint ~22:35 PT
- **Analysis UI overhaul** committed (2d4fe07): decluttered toolbar + "Grouping & filters" / "Chart settings" (Figure Studio + Significance tabs) dialogs; all controls relocated, wiring unchanged; tsc 0. PREVIEW: https://bpan-d8wrzn3pv-tara-neddersens-projects.vercel.app — evaluator reviewing control-preservation before sign-off.
- IA cleanup agent running (duplicate/misplaced subtabs + Protocol-Timepoints-out-of-Cohorts; preview-bound; speculative restructuring left as recommendations).
- PROD now: cohort sort, colors, sticky cols, averages, line-graph, sheets-msg, battery validation, breeder. PREVIEW: #12 calendar, Analysis overhaul.
- NOTE for user: the two preview URLs are deployment-protected — open while logged into Vercel/the app.

## 🧬 STRAINS (#2) — migration ready, needs YOU to run it (I have no DDL access)
Strains is a foundational schema change. I cannot execute DDL (no exec-SQL path; migrations are run by hand in the Supabase SQL Editor — the migration files even say so) and I can't runtime-verify a schema-dependent feature against the un-migrated DB. So rather than ship a large, untestable, broken-against-prod feature, I wrote the migration + plan for you to run, then I build+verify the UI.

**Step 1 (you):** open Supabase → SQL Editor → paste & run `bpan-app/supabase/migrations/070_strains.sql`. It's ADDITIVE + non-destructive: new `strains` table + nullable `strain_id` on cohorts/breeder_cages/housing_cages, and backfills everything to a default "BPAN" strain so your current data stays exactly as-is. (Full Supabase backup already on your Desktop.)

**Step 2 (me, once you say "strains migration applied"):** ship the feature — a global **strain switcher** in the header that filters the whole app (Colony, Tracker, Results, Analysis) by strain; strain CRUD (add "SynGAP" etc.); assign cohorts/breeders/cages to a strain; animals inherit strain via their cohort. Built behind the new columns, evaluated, preview → your sign-off.

This was the right call vs. dumping an unverifiable pervasive change overnight. Everything's teed up for a fast turnaround.

## DEPLOY STRATEGY (corrected ~23:00 PT)
- **Production = `1f51ba3`** (breeder build): all Wave-1 + #22 + breeder, verified & live. Stable.
- **Preview line = codex HEAD** = ONE cumulative sign-off preview bundling everything since: drag-drop calendar (#12), Analysis UI overhaul, colony reliability hardening, + ongoing. Latest preview URL: https://bpan-9rdvjl9ps-tara-neddersens-projects.vercel.app (rebuilds per commit — use the newest row below).
- Rationale: backend reliability commit landed on top of the preview-only UI commits; promoting it alone would drag the unapproved UI to prod. So everything post-breeder ships to prod TOGETHER once you sign off — and the riskier items get your eyes first. Cleaner + safer.

## ☀️ FOR YOU IN THE MORNING — decisions & sign-off
1. **Enable Google Sheets sync (1 click):** turn on "Google Sheets API" + "Google Drive API" at https://console.cloud.google.com/apis/library?project=591300647601 — that's the entire fix for #9 (token is valid).
2. **Sign off on preview UI** (open while logged in): the LATEST preview URL bundles the decluttered **Analysis page**, the **drag-drop calendar**, and the **IA/subtab cleanup**. If you like it, I promote to production. (Latest preview URL will be in the changelog row of the final commit.)
3. **Results consolidation (your "why two result sections"):** decide direction — keep **Colony Results** as the single surface (my recommendation, it's what you use) and fold in the other's useful bits, vs the audit's suggestion to standardize on the dataset/ResultsClient surface. I did NOT change this overnight (needs your call).
4. **Security hardening rollout:** audit found criticals (CORS wildcard, plaintext OAuth tokens at rest, no rate-limiting on token endpoints). I staged these for review rather than risk breaking auth unattended — say the word and I roll them out (preview first).

## Analysis overhaul evaluator: SHIP (no fixes needed)
- Verified all controls preserved, no wiring changed, no logic touched, JSX balanced, tsc 0. Safe preview for sign-off.

## IA audit result (~22:50 PT) — no code changes (correct, conservative)
- The feared duplicate/misplaced subtabs are mostly FALSE ALARMS: Experiments "Reagents" vs Labs reagents are DIFFERENT tables (rename Labs one to "Lab Inventory" to disambiguate — label only); Colony top-nav vs in-page is one component via multiple routes (sound); no exact-duplicate subtabs exist.
- ONE real issue: global "Protocol Timepoints" lives in the **Cohorts** tab (colony-client.tsx:1531-1603) — genuinely mis-parented, but moving it needs a cross-component refactor (its dialogs/state/delete wiring live in colony-client). Deferred to a reviewed task → recommendation for sign-off, NOT changed unattended.
- Recommendations for you: (a) move Protocol Timepoints to Experiments as its own "Timepoints" tab; (b) rename one "Reagents" → "Lab Inventory"; (c) clarify battery/run/single-experiment taxonomy naming. All need your input.
- Reliability batch launched (colony actions #12 cascade error-handling + #13 safe form parsing) — prod-safe robustness for sellability.

## Status checkpoint ~23:40 PT — preview bundle fully verified
- Evaluator pass on the two remaining UI features: Tracker sorting (#20) = SHIP (clean); Calendar day-drag (#12) = FIX → found a forward-drop off-by-one + filler-day grip no-op, BOTH FIXED in db1dadd (use moveDayToPosition(targetVisibleIndex); gate grip to real days).
- Sign-off preview bundle now = calendar(fixed) + Analysis overhaul(SHIP) + reliability(verified) + tracker sorting(SHIP). All tsc 0, all evaluator-checked. Latest commit db1dadd; newest preview URL via `vercel` deployments list.
- Next: read-only connectivity/completeness critic (battery→run→tracker→results→analysis; colony→run→results) to confirm cross-feature wiring + catch any regression from the night, per the user's "make sure parts connect" ask.

## Connectivity critic result (~00:05) — pipeline mostly connected, ZERO regressions tonight
- Verified clean (NOT regressions): breeder feature, required-field validation (matches create form), computed averages→analysis, calendar off-by-one fix, tracker sort vs sticky. Good.
- ONE real BROKEN connectivity item = audit #42: Tracker/Results/Analysis each track the selected run independently (different defaults, no `run` URL param) → pick a run in Results, switch to Analysis = back to "All runs." Degrades core workflow. → IMPLEMENTING (shared run context), preview-bound + evaluated.
- WEAK (documented for user, not changed): run assignment is a live pointer not a snapshot; genotype not snapshotted onto results (editing genotype retroactively changes historical analysis grouping); unresolved run-timepoint age can write timepoint_age_days:0 (#16 bucket-merge risk); dataset→run link nullable (#17). All are pre-existing design choices — flagged for your decision, not silently changed.
- TRIVIAL: getGoogleSheetsApiDisabledMessage export currently unused (harmless).

## Refocus ~00:40 PT — back to the user's explicit Wave-2 requests
- #42 evaluator = SHIP (all 6 must-holds verified). Preview bundle complete & verified.
- IMPORTANT: I drifted into audit-driven work; the user's own Wave-2 asks still pending:
  - #3/#4/#5 inline animal creation: add N animals while making a cohort → rows auto-named `cohort#-mouse#` + auto ear-tags (map 1:0100 2:0001 3:0101 4:1000 5:0010 6:1010 7:1100 8:1001 9:1101 10:0110 11:0011 12:0111) + inline genotype/sex; fix the single-add ID suggestion to `cohort#-mouse#`. → BUILDING NOW (agent).
  - #2 strains as TOP-LEVEL grouping (own cohorts/breeders/cages + app-wide strain switcher) → NEXT (big; needs additive migration + pervasive UI).
- These are higher priority than further audit polish. Doing them next, preview-bound + evaluated.

## Notes / discoveries
- (running notes appended as work proceeds)
- **#11 averages root cause:** `lib/derived-measures.ts` only implements Y-maze `total_entries`. The user's generic "Average" columns (key `average_score`, with `averageSourceKeys` + `options:[__average__, field:...]`) are NOT computed anywhere — they're effectively empty manual fields. Fix = generic derived-average that reads each average column's source keys from the schema and computes the row mean live in `colony-results-tab.tsx` (schema is available there; `applyDerivedMeasures` only gets measures, not the schema, so the computation must live where the schema is or take the schema as an arg). Medium effort; correctness-critical.
- Deep-audit workflow launched (run wf_b2870ee6-887, 12 area agents + synthesizer) — backlog will drive the rest of the night.
- **Deep audit COMPLETE:** 113 findings → 46 prioritized items saved to AUDIT_BACKLOG.md. Top themes: critical security gaps (CORS wildcard, plaintext OAuth tokens, token endpoints no rate-limit), the two-results data-model split, tracker usability (read-only, sticky), IA cleanup (misplaced/duplicate tabs), Analysis clutter. Rank-1 "path" finding is a false alarm (audit agents' cwd was the Drive data folder; real code is the Desktop git repo).
- Execution plan: (A) safe verified fixes → production: averages #11/#15, colors #7, sticky #8, timepoint validation #22, Sheets refresh guard #4. (B) risky/big → preview for morning sign-off: security auth changes (#2,#3,#6,#7-sec), results consolidation #14/#16, strains, UI overhaul. Evaluator agent review before every prod deploy.
- Spawned background implementation agent for Wave-1 colony/results table batch (#7 colors, #8 sticky cols, #11 generic averages) — serialized on shared files; main loop will review+build+deploy.
- **#9 Google Sheets sync ROOT CAUSE FOUND (not a code bug):** tested the stored token live — it refreshes fine and has all scopes (spreadsheets + drive.file). The real error is `HTTP 403: Google Sheets API has not been used in project 591300647601 ... or it is disabled`. **The Google Sheets API is DISABLED in the Google Cloud project.** USER ACTION (one click): enable "Google Sheets API" (and "Google Drive API") at https://console.cloud.google.com/apis/library?project=591300647601 (direct: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=591300647601). No reconnect needed — token is valid.
  - Code improvement made (lib/google-sheets.ts): detect the "API disabled" 403 and surface a clear actionable message (`getGoogleSheetsApiDisabledMessage`) instead of a cryptic dump / misleading "reconnect" prompt. Applied in validateGoogleSheetsAccess (single chokepoint) + createGoogleSpreadsheet. Will typecheck+deploy with the Wave-1 batch.
