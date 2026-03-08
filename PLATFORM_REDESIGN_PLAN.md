# BPAN Platform Redesign Plan

## Goal

Evolve BPAN from a personalized single-user experiment tracker into a flexible platform where any user can:

- define any experiment type they want
- attach multiple protocols to that experiment type
- configure default result columns and still add custom columns later
- build relative day-by-day schedules (`Day 1`, `Day 2`, etc.)
- schedule work by study, cohort, or individual animal
- reorder experiments across days and time slots
- keep private workflows or share them with a lab

This plan preserves existing features and extends them rather than replacing them.

## Current Foundation

The current codebase already has a usable base:

- experiment planning UI in [`/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/components/experiments-client.tsx`](/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/components/experiments-client.tsx)
- experiment actions in [`/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/app/(protected)/experiments/actions.ts`](/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/app/(protected)/experiments/actions.ts)
- results UI in [`/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/components/results-client.tsx`](/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/components/results-client.tsx)
- shared app types in [`/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/types/index.ts`](/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/src/types/index.ts)
- existing experiment schema in [`/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/supabase/migrations/007_experiments.sql`](/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/supabase/migrations/007_experiments.sql)
- existing results schema in [`/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/supabase/migrations/009_results_analyzer.sql`](/Users/tahouranedaee/Desktop/BPAN-Platform/bpan-app/supabase/migrations/009_results_analyzer.sql)

Today the model is still primarily:

- one user owns experiments
- one experiment optionally references one protocol
- one dataset optionally references one experiment
- scheduling is date-centric, not reusable plan-centric

That is the main constraint this redesign needs to remove.

## Product Principles

1. Nothing existing gets deleted unless there is a clean compatibility path.
2. New users should be able to set things up through guided steps.
3. Power users should still have an advanced editor.
4. Reusable templates must be separate from specific experiment runs.
5. Shared lab data must be separate from personal data ownership.
6. Scheduling must support both simple and advanced use cases.
7. The schema must allow future AI automation to attach to real domain objects.

## Core Domain Model

The redesign should introduce a layered model.

### 1. Template Layer

Reusable definitions that can be created by a user or shared by a lab.

- `experiment_templates`
  - reusable experiment definition
  - fully custom title and description
  - visibility: private or shared
  - ownership: user or lab

- `template_protocol_links`
  - links many protocols to one experiment template
  - supports ordering
  - supports a default protocol flag

- `result_schemas`
  - reusable result schema attached to a template
  - one active schema per template at minimum
  - versioning can be added later

- `result_schema_columns`
  - the default columns shown during setup
  - supports add/remove/reorder
  - supports grouped concepts like `batch`, `colony`, `timepoint`

### 2. Planning Layer

Reusable or one-off schedules.

- `schedule_templates`
  - optional reusable relative schedule for a template
  - can be personal or lab-shared

- `schedule_days`
  - `day_index` (`1`, `2`, `3`, etc.)
  - label override optional (`Baseline`, `Post-op Day 1`)
  - reorderable

- `schedule_slots`
  - child of a day
  - supports `AM`, `PM`, `Midday`, `Evening`, or custom label
  - may also store optional exact time
  - reorderable

- `scheduled_blocks`
  - an experiment block placed in a day/slot
  - references an `experiment_template`
  - can appear multiple times in the same plan
  - reorderable within a slot
  - may override protocol or column defaults if needed

### 3. Execution Layer

Specific runs derived from templates and plans.

- `experiment_runs`
  - a concrete planned or active run
  - references `experiment_template`
  - optionally references `schedule_template`
  - stores chosen protocol and applied schema snapshot

- `run_schedule_blocks`
  - instantiated schedule items for a run
  - preserve order and context from the template
  - can diverge without mutating the reusable template

- `run_assignments`
  - defines scope
  - supports `study`, `cohort`, or `animal`
  - can support multiple assignments per run if needed later

### 4. Data Collection Layer

Collected data linked to runs rather than just generic experiments.

- keep `datasets`
- add `experiment_run_id` to `datasets`
- preserve existing `experiment_id` during transition for compatibility
- treat dataset columns as:
  - inherited snapshot from the selected result schema
  - plus run-level custom additions

### 5. Collaboration Layer

Lab-aware ownership and sharing.

- `labs`
- `lab_members`
- `lab_roles`
- `lab_feature_flags` (optional later)

This allows both:

- personal/private templates and runs
- lab-shared templates, schedules, reagents, and equipment

### 6. Operations Layer

Shared lab tools.

- `lab_reagents`
- `lab_reagent_stock_events`
- `lab_reagent_reorder_rules`
- `lab_equipment`
- `lab_equipment_bookings`
- `task_links`
- `message_threads`
- `messages`

Tasks and messages should be attachable to objects such as:

- experiment template
- experiment run
- reagent
- reorder request
- equipment booking

For the initial operations rollout, protocol-linked tasks/messages are deferred until protocols gain coherent lab-scoped ownership.
General lab chat is supported through lab-root message threads (`linked_object_type = 'lab'`) with per-user message read state.

## Minimum Column Type Support

The result column system should support all common field types from the start:

- `text`
- `long_text`
- `number`
- `integer`
- `boolean`
- `date`
- `time`
- `datetime`
- `select`
- `multi_select`
- `file`
- `url`
- `animal_ref`
- `cohort_ref`
- `batch_ref`

Recommended metadata on each column:

- `id`
- `key`
- `label`
- `type`
- `required`
- `default_value`
- `options` (for select types)
- `unit`
- `help_text`
- `group_key` (for grouped defaults like batch/timepoint)
- `sort_order`
- `is_system_default`

## UX Structure

The primary UX should be a guided builder, with an advanced editor available after setup.

### Guided Builder

1. Choose personal or lab context.
2. Create or pick an experiment template.
3. Add or choose one or more protocols.
4. Review default result columns.
5. Add, delete, or reorder columns.
6. Build a relative schedule.
7. Choose assignment scope (`study`, `cohort`, `animal`).
8. Save as reusable template, a run, or both.

### Advanced Editor

After creation, users can:

- drag and reorder days
- drag and reorder slots
- move blocks across days
- duplicate days
- duplicate blocks
- add repeated sessions
- override protocol choice on a specific block
- add custom run-only columns without mutating the template

### UX Rule

Default mode should hide complexity. Advanced mode should expose flexibility without removing guardrails.

## Permissions Model

The cleanest permissions model is capability-based, not hardcoded by one role.

### Roles

- `personal_user`
- `lab_member`
- `lab_manager`
- `lab_admin`

### Shared Template Editing Modes

Each lab should be able to choose per resource category:

- `open_edit`
  - members can edit shared templates
- `manager_controlled`
  - only managers/admins can edit

This supports the requested "both" behavior without making policy global.

### Visibility Rules

- private resources are only visible to the owner
- shared resources are visible inside the lab
- runs may be private even if derived from a shared template
- schema snapshots on runs should not retroactively change when a template changes

## Compatibility Strategy

The current `experiments` table should not be deleted immediately.

Recommended transition:

1. Keep existing `experiments`, `protocols`, and `datasets` operational.
2. Add new template/run tables alongside them.
3. Backfill existing `experiments` into:
   - `experiment_templates` for reusable metadata where possible
   - `experiment_runs` for specific planned entries
4. Continue reading old and new records during migration windows.
5. Only consolidate UI paths after the new model is stable.

This reduces risk and avoids breaking active work.

## Proposed Schema Additions

These are the first new tables worth introducing.

### Phase 1 Schema

- `experiment_templates`
- `template_protocol_links`
- `result_schemas`
- `result_schema_columns`
- `experiment_runs`

### Phase 2 Schema

- `schedule_templates`
- `schedule_days`
- `schedule_slots`
- `scheduled_blocks`
- `run_schedule_blocks`
- `run_assignments`

### Phase 3 Schema

- add `experiment_run_id` to `datasets`
- optional `result_schema_id` and `schema_snapshot` on `experiment_runs`

### Phase 4 Schema

- `labs`
- `lab_members`
- `lab_roles`

### Phase 5 Schema

- `lab_reagents`
- `lab_reagent_stock_events`
- `lab_equipment`
- `lab_equipment_bookings`
- `message_threads`
- `messages`
- `task_links`

## API and UI Surface Changes

To minimize churn, the first pass should add new surfaces instead of rewriting everything at once.

### New Server Actions

Recommended new action groups:

- `template-actions.ts`
- `schedule-actions.ts`
- `run-actions.ts`
- `lab-actions.ts`
- `inventory-actions.ts`
- `equipment-actions.ts`

### New UI Modules

Recommended new components:

- `experiment-template-builder.tsx`
- `result-schema-editor.tsx`
- `schedule-builder.tsx`
- `run-planner.tsx`
- `lab-switcher.tsx`
- `lab-members-panel.tsx`
- `lab-inventory-panel.tsx`
- `equipment-booking-calendar.tsx`

This is better than forcing everything into the current monolithic experiments client.

## Delivery Phases

### Phase 1: Generalize Experiment Definitions

Goal:
Support custom experiment templates with multiple protocols and editable default result columns.

Scope:

- add template data model
- allow multiple protocols per template
- add result schema editor
- preserve current experiment planner

Exit criteria:

- a user can define any experiment type
- a user can attach multiple protocols
- a user can configure default columns and still add more later

### Phase 2: Add Flexible Relative Scheduling

Goal:
Introduce reusable, drag-friendly schedule planning.

Scope:

- relative day model
- slots (`AM`, `PM`, custom, exact time)
- scheduled blocks with repeat support
- drag-and-drop reorder and move

Exit criteria:

- a user can build `Day 1`, `Day 2` style plans
- the same experiment can appear multiple times
- order can be changed across days and slots

### Phase 3: Connect Runs to Data Collection

Goal:
Tie planning to actual execution and results.

Scope:

- create `experiment_runs`
- attach datasets to runs
- preserve schema snapshots on runs
- allow run-level extra columns

Exit criteria:

- collected data is linked to a specific run
- template defaults remain reusable
- run-specific flexibility remains intact

### Phase 4: Add Labs and Sharing

Goal:
Support private and shared workspaces.

Scope:

- lab creation
- member invites
- roles and permissions
- shared template visibility
- lab-aware navigation

Exit criteria:

- users can keep resources private or share them with a lab
- role-based editing is enforced

### Phase 5: Add Lab Operations

Goal:
Make the platform useful as a lab operating system, not just a planner.

Scope:

- shared reagent inventory
- reorder tracking
- equipment booking calendar
- task assignment
- object-linked messaging

Exit criteria:

- labs can manage shared resources and coordinate around them

### Phase 6: Add Automation and AI Assist

Goal:
Make the platform proactive.

Scope:

- low-stock reorder triggers
- booking conflict alerts
- protocol update notifications
- run reminders
- AI-assisted setup and scheduling suggestions

Exit criteria:

- automations can trigger off first-class domain objects

## Parallel Agent Plan

Multiple agents can work in parallel if boundaries are explicit.

### Agent A: Domain and Contracts

Owns:

- schema design
- migrations sequencing
- shared TypeScript types
- permission contracts

Allowed files:

- `bpan-app/src/types/index.ts`
- new migration files
- domain docs

Must deliver first:

- table definitions
- object relationships
- enum values
- payload contracts for UI agents

Constraint:

Only this agent should author database migrations during the planning-to-build transition.

### Agent B: Template Builder

Owns:

- experiment template creation flow
- protocol linking UX
- default column setup UX

Primary files:

- new template builder components
- new template actions

Should avoid touching:

- scheduling components
- lab features

Dependency:

Consumes Agent A contracts.

### Agent C: Schedule Builder

Owns:

- relative day planner
- slot model UI
- drag-and-drop
- repeat session controls

Primary files:

- new schedule components
- new schedule actions

Should avoid touching:

- result schema editor internals
- lab modules

Dependency:

Consumes Agent A contracts and Agent B template selectors.

### Agent D: Results Integration

Owns:

- schema-to-dataset mapping
- run-level extra columns
- preserving compatibility with current results flow

Primary files:

- results actions
- results UI adapters
- dataset mapping helpers

Should avoid touching:

- scheduling implementation
- lab collaboration screens

Dependency:

Consumes Agent A contracts and Agent B result schema definitions.

### Agent E: Labs and Permissions

Owns:

- labs
- membership
- roles
- shared/private visibility controls
- lab navigation shell

Primary files:

- new lab actions
- lab layouts/pages
- access-control helpers

Dependency:

Consumes Agent A permission model.

### Agent F: Lab Operations

Owns:

- shared reagent inventory
- reorder logic
- equipment booking
- task/message object linking

Primary files:

- inventory and equipment modules
- task/message integration

Dependency:

Consumes Agent E lab model and Agent A object-link contracts.

### Agent G: Automation and AI

Owns:

- rule engine hooks
- object-triggered notifications
- AI workflow helpers

Primary files:

- automation service logic
- AI integration points

Dependency:

Consumes stable object IDs and event surfaces from Agents A, E, and F.

## Anti-Collision Rules For Parallel Work

1. One agent owns migrations.
2. One agent owns shared domain types.
3. UI agents should build new modular components before modifying large existing screens.
4. Existing monoliths like `experiments-client.tsx` should be treated as integration shells, not the main place for all new logic.
5. Shared enums and object references must be published as contracts before parallel UI work starts.
6. If an agent needs a schema change outside its contract, it must route that back through Agent A.

## Immediate Deliverables Before Coding

Before implementation starts, create these as the source of truth:

1. Domain model spec
2. Table-by-table migration plan
3. UX flow map for guided vs advanced setup
4. Permission matrix
5. Agent task briefs with file ownership boundaries

This document is the first draft of items 1 and 5.

## Recommended Next Planning Step

The next concrete artifact should be a table-by-table technical spec with:

- exact columns
- foreign keys
- enum/check values
- RLS strategy
- migration order
- compatibility/backfill notes

That technical spec should be produced before any implementation agent starts writing code.
