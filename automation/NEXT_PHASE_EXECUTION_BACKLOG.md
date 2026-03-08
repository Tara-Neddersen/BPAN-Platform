# Next-Phase Execution Backlog

Source inputs:

- `/Users/tahouranedaee/Desktop/BPAN-Platform/PLATFORM_REDESIGN_PLAN.md`
- current status/blockers in `/Users/tahouranedaee/Desktop/BPAN-Platform/AGENT_COORDINATION.md`

## Must-Have Now

### 1) Fix operations shared-thread message persistence/render mismatch

- Scope: Resolve the blocking QA issue where operations shared-thread messages do not render or clear input despite successful POST.
- Acceptance criteria: posting a shared-thread message shows the new message immediately, clears the input, and persists after reload.
- Dependency: Phase 5 operations contracts already applied; no schema changes required.
- Suggested owner agent: Agent 6.
- Done definition: Agent 10 re-test notes in coordination doc confirm all three acceptance checks pass in linked dev.

### 2) Run end-to-end results import/analyze validation on run-linked flow

- Scope: Validate full results path (import, mapping, analysis) against run-linked dataset model.
- Acceptance criteria: import and analyze complete without runtime/schema errors for at least one run-linked dataset scenario.
- Dependency: Agent 4 run-link integration and current results UI adapters.
- Suggested owner agent: Agent 10 (verification) with Agent 4 on fixes.
- Done definition: Agent 10 documents successful end-to-end flow, and any discovered issues are resolved/closed.

### 3) Final release cut for stable snapshot (branch + tag)

- Scope: Create and push `safe/release-stable-2026-03-08` and `release-stable-2026-03-08`.
- Acceptance criteria: both ref names exist on `origin` and point to intended release commit.
- Dependency: critical QA blocker above is resolved or explicitly waived.
- Suggested owner agent: Agent 12 (or release operator).
- Done definition: remote `ls-remote` verification output recorded in release notes/coordination doc.

### 4) Lock deploy gate behavior to QA blocker truth

- Scope: Keep deploy gating blocked whenever QA blockers contain P1/P2 severity indicators in current blocker text.
- Acceptance criteria: orchestrator emits `deploy_gate_blocked` while QA P1/P2 blockers exist; no false `deploy_gate_opened`.
- Dependency: Agent 12 orchestration routing logic.
- Suggested owner agent: Agent 12.
- Done definition: regression scenario documented and passing in coordination notes.

## Should-Have Soon

### 5) Run-level dataset migration/backfill plan execution

- Scope: Plan and execute compatibility-safe backfill linking datasets to `experiment_runs` while preserving existing `experiment_id` compatibility.
- Acceptance criteria: documented migration/backfill procedure + verified sample records linked without breaking old reads.
- Dependency: Phase 3 execution/data-collection model.
- Suggested owner agent: Agent 1 (schema/contracts) + Agent 4 (app adapters).
- Done definition: backfill runbook exists and test queries confirm expected row linkage.

### 6) Lab sharing edit-policy UX completion

- Scope: Expose open-edit vs manager-controlled policy controls for shared resources in labs UX.
- Acceptance criteria: managers/admins can set and persist edit policy; effective behavior is visible in UI.
- Dependency: lab role and policy contracts already in place.
- Suggested owner agent: Agent 5.
- Done definition: policy toggle present, persisted, and validated by Agent 10 with role-specific behavior.

### 7) Equipment booking conflict guardrails

- Scope: Add application-layer overlap/conflict prevention for equipment bookings.
- Acceptance criteria: conflicting booking attempts are blocked with clear user feedback.
- Dependency: current booking table only enforces `ends_at > starts_at`.
- Suggested owner agent: Agent 6.
- Done definition: conflict scenario test demonstrates prevention for overlapping ranges.

### 8) Cross-surface integration QA matrix pass

- Scope: Execute a matrix pass across experiments, scheduling, labs, operations, results to verify no regressions.
- Acceptance criteria: documented matrix with pass/fail per scenario and blocker ownership handoff.
- Dependency: Must-have bug fixes completed.
- Suggested owner agent: Agent 10.
- Done definition: QA matrix attached in coordination notes with no open P1 issues.

## Nice-To-Have Later

### 9) Automation trigger pack for Phase 6 alerts/reminders

- Scope: Add stable trigger definitions for low-stock, booking conflicts, protocol updates, and run reminders.
- Acceptance criteria: trigger specs documented and testable against first-class domain objects.
- Dependency: stable operations/run object linkage.
- Suggested owner agent: Agent 7.
- Done definition: automation trigger catalog + at least one validated trigger per category.

### 10) AI-assisted guided setup suggestions

- Scope: Add assistive setup/scheduling recommendations in guided builder flow.
- Acceptance criteria: suggestions generated from template/schedule context without breaking manual workflow.
- Dependency: stable template + schedule + run contracts and telemetry signals.
- Suggested owner agent: Agent 7 (with Agent 2/3 integration points).
- Done definition: user can accept/reject AI suggestions; accepted suggestions persist correctly.

### 11) Compatibility cleanup planning for legacy reads

- Scope: Define deprecation timeline for legacy-only reads once run-linked model is fully stable.
- Acceptance criteria: documented compatibility checklist and migration checkpoint criteria.
- Dependency: run-linked data collection proven stable in production-like QA.
- Suggested owner agent: Agent 1.
- Done definition: signed-off deprecation plan with explicit rollback strategy.

### 12) Orchestration command transport hardening

- Scope: Improve command transport operational robustness (timeouts, richer diagnostics, safe sandbox wrappers).
- Acceptance criteria: failed send root cause is consistently actionable and retriable behavior remains deterministic.
- Dependency: current controlled full-auto outbox/approval flow.
- Suggested owner agent: Agent 12.
- Done definition: transport hardening checklist completed and validated via synthetic failure suite.
