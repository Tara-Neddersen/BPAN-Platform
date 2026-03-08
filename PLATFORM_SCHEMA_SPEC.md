# BPAN Platform Schema Spec

## Purpose

This document is the implementation contract for the platform redesign.

It defines:

- new tables
- key columns
- relationships
- ownership rules
- RLS direction
- migration order
- compatibility strategy with current tables

It is the primary handoff for the schema/contracts owner before parallel implementation starts.

## Existing Tables To Preserve During Transition

These already exist and should remain functional while the new model is introduced:

- `profiles`
- `protocols`
- `experiments`
- `experiment_timepoints`
- `reagents`
- `datasets`
- `analyses`
- `figures`
- `tasks`
- colony-related tables
- `workspace_calendar_events`

The redesign extends these surfaces. It does not require immediate deletion or hard replacement.

## Design Rules

1. Reusable definitions and specific runs must be separate.
2. Shared lab resources must be separate from personal ownership.
3. Runs must store snapshots of template-derived configuration so future template edits do not corrupt historical records.
4. New tables should prefer additive rollout over destructive migration.
5. RLS should support both user-owned and lab-shared records.

## Enum And Check Value Standards

Prefer check constraints first unless a Postgres enum becomes necessary later.

### Visibility

- `private`
- `lab_shared`

### Owner Type

- `user`
- `lab`

### Assignment Scope

- `study`
- `cohort`
- `animal`

### Slot Kind

- `am`
- `pm`
- `midday`
- `evening`
- `custom`
- `exact_time`

### Lab Role

- `member`
- `manager`
- `admin`

### Shared Edit Policy

- `open_edit`
- `manager_controlled`

### Column Type

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

### Run Status

- `draft`
- `planned`
- `in_progress`
- `completed`
- `cancelled`

### Booking Status

- `draft`
- `confirmed`
- `in_use`
- `completed`
- `cancelled`

### Inventory Event Type

- `receive`
- `consume`
- `adjust`
- `reorder_request`
- `reorder_placed`
- `reorder_received`

## Core Tables

### 1. `labs`

Purpose:
Top-level shared workspace for a lab.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text unique`
- `description text`
- `created_by uuid references profiles(id) on delete set null`
- `shared_template_edit_policy text not null default 'manager_controlled' check in allowed values`
- `shared_protocol_edit_policy text not null default 'manager_controlled' check in allowed values`
- `timezone text not null default 'America/Los_Angeles'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- unique index on `slug`
- index on `created_by`

RLS:

- visible to members of the lab
- insert by authenticated users
- update/delete by lab admins, with manager access optional later

### 2. `lab_members`

Purpose:
Membership and role mapping.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `lab_id uuid references labs(id) on delete cascade not null`
- `user_id uuid references profiles(id) on delete cascade not null`
- `role text not null check in ('member','manager','admin')`
- `display_title text`
- `is_active boolean not null default true`
- `joined_at timestamptz default now()`
- `invited_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- unique `(lab_id, user_id)`

Indexes:

- index on `user_id`
- index on `(lab_id, role)`

RLS:

- members can view active members in their lab
- admins/managers can insert and update
- only admins can remove or deactivate members by default

### 3. `experiment_templates`

Purpose:
Reusable experiment definition.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `owner_type text not null check in ('user','lab')`
- `owner_user_id uuid references profiles(id) on delete cascade`
- `owner_lab_id uuid references labs(id) on delete cascade`
- `visibility text not null default 'private' check in ('private','lab_shared')`
- `title text not null`
- `description text`
- `category text`
- `default_assignment_scope text check in ('study','cohort','animal')`
- `is_archived boolean not null default false`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Contract note:

- deployed schema allows `created_by` to be nullable for delete-preservation; application writes should still set it

Constraints:

- exactly one owner target must be set:
  - if `owner_type = 'user'`, `owner_user_id` required and `owner_lab_id` null
  - if `owner_type = 'lab'`, `owner_lab_id` required and `owner_user_id` null

Indexes:

- index on `owner_user_id`
- index on `owner_lab_id`
- index on `(visibility, owner_lab_id)`
- search index on `title`

RLS:

- user-owned private templates visible only to owner
- lab-owned shared templates visible to lab members
- edits allowed by owner for user-owned records
- lab-owned edits follow the lab policy and member role

### 4. `template_protocol_links`

Purpose:
Allow multiple protocols to be linked to one experiment template.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `template_id uuid references experiment_templates(id) on delete cascade not null`
- `protocol_id uuid references protocols(id) on delete cascade not null`
- `sort_order int not null default 0`
- `is_default boolean not null default false`
- `notes text`
- `created_by uuid references profiles(id) on delete set null not null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- unique `(template_id, protocol_id)`

Indexes:

- index on `(template_id, sort_order)`
- partial index on `(template_id)` where `is_default = true`

Rule:

- application/service layer should enforce only one default protocol per template

RLS:

- inherits visibility/edit rules from the parent template

### 5. `result_schemas`

Purpose:
Reusable default result configuration for a template.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `template_id uuid references experiment_templates(id) on delete cascade not null`
- `name text not null default 'Default schema'`
- `description text`
- `version int not null default 1`
- `is_active boolean not null default true`
- `created_by uuid references profiles(id) on delete set null not null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `template_id`
- index on `(template_id, is_active)`

Rule:

- start with one active schema per template
- future versions can be added later, but runs should snapshot applied columns

RLS:

- inherits parent template visibility/edit rules

### 6. `result_schema_columns`

Purpose:
Default columns available when creating or running an experiment.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `schema_id uuid references result_schemas(id) on delete cascade not null`
- `key text not null`
- `label text not null`
- `column_type text not null check in allowed column types`
- `required boolean not null default false`
- `default_value jsonb`
- `options jsonb not null default '[]'`
- `unit text`
- `help_text text`
- `group_key text`
- `sort_order int not null default 0`
- `is_system_default boolean not null default false`
- `is_enabled boolean not null default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- unique `(schema_id, key)`

Indexes:

- index on `(schema_id, sort_order)`
- index on `(schema_id, group_key)`

Notes:

- `group_key` supports grouped defaults like `batch`, `colony`, and `timepoint`
- `is_enabled` allows soft removal from defaults without losing history

RLS:

- inherits parent schema/template visibility/edit rules

### 7. `schedule_templates`

Purpose:
Reusable relative schedule definition.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `template_id uuid references experiment_templates(id) on delete cascade not null`
- `name text not null default 'Default schedule'`
- `description text`
- `is_active boolean not null default true`
- `created_by uuid references profiles(id) on delete set null not null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `template_id`

RLS:

- inherits parent template visibility/edit rules

### 8. `schedule_days`

Purpose:
Relative days within a schedule template.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `schedule_template_id uuid references schedule_templates(id) on delete cascade not null`
- `day_index int not null`
- `label text`
- `sort_order int not null default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- unique `(schedule_template_id, day_index)`

Indexes:

- index on `(schedule_template_id, sort_order)`

RLS:

- inherits parent schedule/template rules

### 9. `schedule_slots`

Purpose:
Time buckets or exact-time containers within a day.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `schedule_day_id uuid references schedule_days(id) on delete cascade not null`
- `slot_kind text not null check in allowed slot kinds`
- `label text`
- `start_time time`
- `sort_order int not null default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `(schedule_day_id, sort_order)`

Rules:

- `label` required when `slot_kind = 'custom'`
- `start_time` recommended when `slot_kind = 'exact_time'`

RLS:

- inherits parent schedule/template rules

### 10. `scheduled_blocks`

Purpose:
Blocks placed into a reusable schedule template.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `schedule_slot_id uuid references schedule_slots(id) on delete cascade not null`
- `experiment_template_id uuid references experiment_templates(id) on delete cascade not null`
- `protocol_id uuid references protocols(id) on delete set null`
- `title_override text`
- `notes text`
- `sort_order int not null default 0`
- `repeat_key text`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `(schedule_slot_id, sort_order)`
- index on `experiment_template_id`

Notes:

- same experiment can appear multiple times because there is no uniqueness on template reference
- `repeat_key` can group related repeated sessions later

RLS:

- inherits parent schedule/template rules

### 11. `experiment_runs`

Purpose:
Concrete run of an experiment used for planning, execution, and results.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `template_id uuid references experiment_templates(id) on delete set null`
- `legacy_experiment_id uuid references experiments(id) on delete set null`
- `owner_user_id uuid references profiles(id) on delete cascade`
- `owner_lab_id uuid references labs(id) on delete cascade`
- `visibility text not null default 'private' check in ('private','lab_shared')`
- `name text not null`
- `description text`
- `status text not null default 'draft' check in allowed run statuses`
- `selected_protocol_id uuid references protocols(id) on delete set null`
- `result_schema_id uuid references result_schemas(id) on delete set null`
- `schema_snapshot jsonb not null default '[]'`
- `schedule_template_id uuid references schedule_templates(id) on delete set null`
- `start_anchor_date date`
- `notes text`
- `created_by uuid references profiles(id) on delete set null not null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- at least one owner target must be present

Indexes:

- index on `template_id`
- index on `legacy_experiment_id`
- index on `owner_user_id`
- index on `owner_lab_id`
- index on `status`

Notes:

- `schema_snapshot` stores the exact applied columns at run creation time
- `legacy_experiment_id` supports transition from old `experiments`

RLS:

- mirrors visibility rules similar to templates
- private runs visible to owner
- lab-shared runs visible to lab members
- edit permissions controlled by ownership and role

### 12. `run_schedule_blocks`

Purpose:
Instantiated schedule blocks for a specific run.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `experiment_run_id uuid references experiment_runs(id) on delete cascade not null`
- `source_scheduled_block_id uuid references scheduled_blocks(id) on delete set null`
- `day_index int not null`
- `slot_kind text not null check in allowed slot kinds`
- `slot_label text`
- `scheduled_time time`
- `sort_order int not null default 0`
- `experiment_template_id uuid references experiment_templates(id) on delete set null`
- `protocol_id uuid references protocols(id) on delete set null`
- `title text not null`
- `notes text`
- `status text not null default 'planned' check in allowed run statuses`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `(experiment_run_id, day_index, sort_order)`
- index on `(experiment_run_id, status)`

Notes:

- this table lets a run diverge from the reusable schedule
- user drag-and-drop changes should update this table, not the template schedule, unless they choose to save back

RLS:

- inherits parent run visibility/edit rules

### 13. `run_assignments`

Purpose:
Declare what the run is assigned to.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `experiment_run_id uuid references experiment_runs(id) on delete cascade not null`
- `scope_type text not null check in ('study','cohort','animal')`
- `study_id uuid`
- `cohort_id uuid references cohorts(id) on delete set null`
- `animal_id uuid references animals(id) on delete set null`
- `sort_order int not null default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `experiment_run_id`
- index on `(scope_type, cohort_id)`
- index on `(scope_type, animal_id)`

Rules:

- exactly one target should be populated to match `scope_type`
- `study_id` remains an open extension point until a formal studies table exists

RLS:

- inherits parent run visibility/edit rules

### 14. `lab_reagents`

Purpose:
Shared reagent inventory for a lab.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `lab_id uuid references labs(id) on delete cascade not null`
- `name text not null`
- `catalog_number text`
- `supplier text`
- `lot_number text`
- `quantity numeric not null default 0`
- `unit text`
- `reorder_threshold numeric`
- `needs_reorder boolean not null default false`
- `last_ordered_at timestamptz`
- `storage_location text`
- `notes text`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `lab_id`
- index on `(lab_id, needs_reorder)`

RLS:

- view by lab members
- edit by lab members in the initial rollout
- delete restricted to managers/admins by default

Contract note:

- policy-based reagent edit control is deferred until a dedicated lab operations edit policy exists

### 15. `lab_reagent_stock_events`

Purpose:
Inventory ledger.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `lab_reagent_id uuid references lab_reagents(id) on delete cascade not null`
- `event_type text not null check in allowed inventory event types`
- `quantity_delta numeric not null default 0`
- `unit text`
- `vendor text`
- `reference_number text`
- `notes text`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`

Indexes:

- index on `lab_reagent_id`
- index on `(lab_reagent_id, created_at desc)`

Rule:

- application layer should update `lab_reagents.quantity`, `needs_reorder`, and `last_ordered_at` from this ledger

RLS:

- inherits lab reagent visibility/edit rules

### 16. `lab_equipment`

Purpose:
Bookable lab equipment.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `lab_id uuid references labs(id) on delete cascade not null`
- `name text not null`
- `description text`
- `location text`
- `booking_requires_approval boolean not null default false`
- `is_active boolean not null default true`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `lab_id`
- index on `(lab_id, is_active)`

RLS:

- visible to lab members
- editable by managers/admins by default

### 17. `lab_equipment_bookings`

Purpose:
Reservations for equipment.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `equipment_id uuid references lab_equipment(id) on delete cascade not null`
- `booked_by uuid references profiles(id) on delete set null`
- `experiment_run_id uuid references experiment_runs(id) on delete set null`
- `task_id uuid references tasks(id) on delete set null`
- `title text not null`
- `notes text`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `status text not null default 'draft' check in allowed booking statuses`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `equipment_id`
- index on `(equipment_id, starts_at, ends_at)`
- index on `booked_by`

Rules:

- `ends_at > starts_at`
- overlap conflicts should be blocked in app logic initially
- can later be strengthened with exclusion constraints
- application writes should still set `booked_by`; nullability preserves historical bookings if the profile is deleted

RLS:

- visible to lab members
- editable by booking owner and managers/admins

### 18. `message_threads`

Purpose:
Object-linked conversations.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `lab_id uuid references labs(id) on delete cascade`
- `owner_user_id uuid references profiles(id) on delete cascade`
- `recipient_scope text not null default 'lab' check in ('lab','participants')`
- `subject text`
- `linked_object_type text not null`
- `linked_object_id uuid not null`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `(linked_object_type, linked_object_id)`
- index on `lab_id`
- index on `owner_user_id`

Rules:

- one of `lab_id` or `owner_user_id` should be present based on context
- `recipient_scope='participants'` is only valid for lab-owned threads (`lab_id` set, `owner_user_id` null)
- `created_by` is nullable to preserve the thread if the creating profile is deleted
- initial supported `linked_object_type` values are:
  - `experiment_template`
  - `experiment_run`
  - `lab` (for lab-root chat channels; `linked_object_id` must match `lab_id`)
  - `lab_reagent`
  - `lab_reagent_stock_event`
  - `lab_equipment`
  - `lab_equipment_booking`
  - `task`
- `protocol` is intentionally excluded until protocols gain coherent lab-scoped ownership

RLS:

- personal threads visible to owner
- lab threads with `recipient_scope='lab'` visible to lab members
- lab threads with `recipient_scope='participants'` visible only to listed participants
- no implicit lab-admin read override for participant-scoped threads
- exception for write-targeting parity: manager/admin may have thread-row metadata SELECT visibility on participant-scoped threads when `can_manage_message_thread()` is true; message content remains participant-scoped

Access matrix (read visibility parity contract):

- `owner_user_id = auth.uid()` personal thread: allowed
- lab thread + `recipient_scope='lab'` + active lab member: allowed
- lab thread + `recipient_scope='lab'` + not a lab member: denied
- lab thread + `recipient_scope='participants'` + listed in `message_thread_participants`: allowed
- lab thread + `recipient_scope='participants'` + not listed: denied (including lab managers/admins unless explicitly added as participants)
- participant-scoped bootstrap window: creator can read immediately after thread create only until participant rows exist
- all rows above still require linked-object access via `can_access_operations_linked_object(linked_object_type, linked_object_id)`

Management matrix (update/delete thread metadata):

- personal thread: owner can manage
- lab thread (`recipient_scope='lab'`): creator can manage; lab manager/admin can manage
- lab thread (`recipient_scope='participants'`): creator can manage; lab manager/admin can manage
- non-creator participants: cannot manage thread metadata
- all rows above still require linked-object access via `can_access_operations_linked_object(linked_object_type, linked_object_id)`

### 18a. `message_thread_participants`

Purpose:
Recipient membership for private participant-scoped lab threads.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `thread_id uuid references message_threads(id) on delete cascade not null`
- `user_id uuid references profiles(id) on delete cascade not null`
- `added_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- unique `(thread_id, user_id)`

Indexes:

- index on `thread_id`
- index on `user_id`

RLS:

- visible to users who can view the parent thread
- writes restricted to allowed creator/manager paths for participant-scoped lab threads
- added users must be active members of the thread lab

### 19. `messages`

Purpose:
Messages inside a thread.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `thread_id uuid references message_threads(id) on delete cascade not null`
- `author_user_id uuid references profiles(id) on delete set null`
- `body text not null`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index on `(thread_id, created_at)`

RLS:

- inherits thread visibility
- authors can edit their own messages for a limited policy window later if desired

Contract note:

- application writes should still set `author_user_id`; nullability preserves the message if the author profile is deleted

### 20. `message_reads`

Purpose:
Per-user read state for thread messages (unread/read support).

Columns:

- `id uuid primary key default gen_random_uuid()`
- `message_id uuid references messages(id) on delete cascade not null`
- `user_id uuid references profiles(id) on delete cascade not null`
- `read_at timestamptz not null default now()`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:

- unique `(message_id, user_id)`

Indexes:

- index on `(user_id, message_id)`
- index on `(message_id, user_id)`

RLS:

- users can manage only their own read-state rows
- access requires visibility to the parent thread via `messages.thread_id`

### 21. `task_links`

Purpose:
Attach tasks to first-class domain objects without overloading a single `source_type` pattern.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `task_id uuid references tasks(id) on delete cascade not null`
- `linked_object_type text not null`
- `linked_object_id uuid not null`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz default now()`

Constraints:

- unique `(task_id, linked_object_type, linked_object_id)`

Indexes:

- index on `task_id`
- index on `(linked_object_type, linked_object_id)`

RLS:

- visible/editable if the user can access the linked task and linked object

Contract note:

- initial supported `linked_object_type` values are:
  - `experiment_template`
  - `experiment_run`
  - `lab_reagent`
  - `lab_reagent_stock_event`
  - `lab_equipment`
  - `lab_equipment_booking`
  - `task`
- `lab` is intentionally not supported in `task_links` unless a dedicated task-to-lab-root contract is added later
- `protocol` is intentionally excluded until protocol ownership is expanded beyond user-only access
- migration `043_fix_operations_contract_drift.sql` deleted existing `protocol`-linked rows from `task_links` and `message_threads`; this deletion is irreversible without external backups/snapshots

## Changes To Existing Tables

### `datasets`

Add:

- `experiment_run_id uuid references experiment_runs(id) on delete set null`

Keep:

- existing `experiment_id`

Transition rule:

- new code should prefer `experiment_run_id`
- old code may continue to use `experiment_id` until the UI is migrated

### `protocols`

No destructive change required now.

Optional future additions:

- `owner_type`
- `owner_user_id`
- `owner_lab_id`
- `visibility`

For initial rollout, protocols can remain user-owned and be linked into templates. Lab-sharing for protocols can be layered later if needed.

### `experiments`

Keep intact for compatibility.

Optional additions:

- `experiment_run_id` back-reference only if needed for bridge UI, but not required initially

Preferred path:

- treat this as legacy planner state during migration
- create `experiment_runs.legacy_experiment_id` for traceability

## RLS Strategy

## Helper Function Recommendation

Create a reusable SQL function:

- `is_lab_member(target_lab_id uuid)`

Returns true if `auth.uid()` is an active member of the lab.

Optional helpers:

- `has_lab_role(target_lab_id uuid, required_role text[])`
- `can_edit_lab_shared_resource(target_lab_id uuid, policy text)`

These helpers will reduce duplicated policy logic.

## Baseline Policy Shape

For lab-owned tables:

- `SELECT`: allow if `is_lab_member(lab_id)`
- `INSERT`: allow if the actor is a member and the app permits create
- `UPDATE`: allow if:
  - actor is manager/admin
  - or table policy supports member edits
- `DELETE`: restrict to manager/admin by default

For user-owned tables:

- `SELECT`: `auth.uid() = owner_user_id`
- `INSERT`: `auth.uid() = owner_user_id` or `created_by`
- `UPDATE`: owner only
- `DELETE`: owner only

For mixed-ownership tables like `experiment_templates` and `experiment_runs`:

- allow if private + owned by user
- allow if lab-shared + member of owning lab
- update path must additionally check role/policy

## Migration Order

This order minimizes breakage and supports phased rollout.

### Migration 1: Shared Workspace Foundation

Create:

- `labs`
- `lab_members`

Add helper functions for lab membership checks.

Reason:

- ownership and visibility rules need a foundation before shared resources are introduced

### Migration 2: Template Foundation

Create:

- `experiment_templates`
- `template_protocol_links`
- `result_schemas`
- `result_schema_columns`

Reason:

- this enables the new reusable experiment definition workflow without touching existing runs or datasets

### Migration 3: Schedule Foundation

Create:

- `schedule_templates`
- `schedule_days`
- `schedule_slots`
- `scheduled_blocks`

Reason:

- reusable planning can exist before run instantiation

### Migration 4: Run Foundation

Create:

- `experiment_runs`
- `run_schedule_blocks`
- `run_assignments`

Reason:

- this is the bridge between reusable definitions and actual execution

### Migration 5: Results Bridge

Alter:

- `datasets` to add `experiment_run_id`

Reason:

- lets new run-based workflows coexist with current experiment-based datasets

### Migration 6: Lab Operations

Create:

- `lab_reagents`
- `lab_reagent_stock_events`
- `lab_equipment`
- `lab_equipment_bookings`
- `message_threads`
- `messages`
- `task_links`

Reason:

- these depend on lab membership and, in some cases, run-level references

## Backfill Strategy

Backfill should be incremental and safe.

### Backfill Step 1: Existing Experiments To Runs

For each row in `experiments`:

- create an `experiment_run`
- set `legacy_experiment_id = experiments.id`
- set `name = experiments.title`
- set `description = experiments.description`
- map status where possible
- copy notes

Do not remove the original `experiments` row.

### Backfill Step 2: Optional Template Derivation

For recurring or clearly reusable existing experiments:

- create an `experiment_template`
- link the current protocol if present
- create a default result schema only when there is enough signal

This can be partial and should not be required for all legacy rows.

### Backfill Step 3: Datasets To Runs

Where `datasets.experiment_id` matches a migrated legacy experiment:

- set `datasets.experiment_run_id` to the mapped run

Keep `experiment_id` populated during transition.

### Backfill Step 4: Timepoints To Run Schedule Blocks

This is optional and should be handled carefully.

Because existing `experiment_timepoints` are timestamp-based rather than relative day-based:

- do not force a lossy conversion automatically
- only derive run schedule blocks when a clear mapping is available

## Application Contract Notes

These are not strict schema rules, but they matter for implementation.

1. Creating a run from a template should snapshot the active result schema into `experiment_runs.schema_snapshot`.
2. Editing a template later must not mutate prior run snapshots.
3. Drag-and-drop schedule changes on a run should only update `run_schedule_blocks`.
4. Saving a run’s modified schedule back to the template should be an explicit user action.
5. For grouped default columns, disabling a column should usually toggle `is_enabled` rather than delete the row.
6. Low-stock logic should be derived from `lab_reagents.quantity <= reorder_threshold`.

## Open Decisions Deferred For Later

These should not block the first schema pass.

- formal `studies` table design
- protocol sharing as first-class lab ownership
- booking approval workflow details
- message read receipts
- audit history tables
- automation event log tables
- exclusion constraints for booking conflicts

## Agent A Deliverable Checklist

Before any other agent starts schema-dependent work, Agent A should produce:

1. Migration files in the order defined above
2. RLS helper functions
3. Initial policies for each new table
4. TypeScript type additions matching the new schema
5. A short compatibility note for old `experiments` and `datasets`

That is the minimum contract needed for the UI and feature agents to work safely in parallel.
