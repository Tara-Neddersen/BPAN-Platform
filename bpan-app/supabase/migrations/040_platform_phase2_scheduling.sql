-- ============================================================
-- BPAN Platform — Redesign Phase 2 scheduling schema and contracts
-- Adds reusable schedule templates, run schedule instances, and run assignments.
-- ============================================================

create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.experiment_templates(id) on delete cascade,
  name text not null default 'Default schedule',
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_templates_template_idx
  on public.schedule_templates (template_id);

create table if not exists public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  schedule_template_id uuid not null references public.schedule_templates(id) on delete cascade,
  day_index integer not null,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_template_id, day_index)
);

create index if not exists schedule_days_template_sort_idx
  on public.schedule_days (schedule_template_id, sort_order);

create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  schedule_day_id uuid not null references public.schedule_days(id) on delete cascade,
  slot_kind text not null check (slot_kind in ('am', 'pm', 'midday', 'evening', 'custom', 'exact_time')),
  label text,
  start_time time,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_slots_kind_requirements_check check (
    (slot_kind <> 'custom' or (label is not null and btrim(label) <> ''))
    and (slot_kind <> 'exact_time' or start_time is not null)
  )
);

create index if not exists schedule_slots_day_sort_idx
  on public.schedule_slots (schedule_day_id, sort_order);

create table if not exists public.scheduled_blocks (
  id uuid primary key default gen_random_uuid(),
  schedule_slot_id uuid not null references public.schedule_slots(id) on delete cascade,
  experiment_template_id uuid not null references public.experiment_templates(id) on delete cascade,
  protocol_id uuid references public.protocols(id) on delete set null,
  title_override text,
  notes text,
  sort_order integer not null default 0,
  repeat_key text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_blocks_slot_sort_idx
  on public.scheduled_blocks (schedule_slot_id, sort_order);
create index if not exists scheduled_blocks_template_idx
  on public.scheduled_blocks (experiment_template_id);

alter table public.experiment_runs
  add column if not exists schedule_template_id uuid references public.schedule_templates(id) on delete set null;

create index if not exists experiment_runs_schedule_template_idx
  on public.experiment_runs (schedule_template_id);

create table if not exists public.run_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  experiment_run_id uuid not null references public.experiment_runs(id) on delete cascade,
  source_scheduled_block_id uuid references public.scheduled_blocks(id) on delete set null,
  day_index integer not null,
  slot_kind text not null check (slot_kind in ('am', 'pm', 'midday', 'evening', 'custom', 'exact_time')),
  slot_label text,
  scheduled_time time,
  sort_order integer not null default 0,
  experiment_template_id uuid references public.experiment_templates(id) on delete set null,
  protocol_id uuid references public.protocols(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'planned'
    check (status in ('draft', 'planned', 'in_progress', 'completed', 'cancelled')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_schedule_blocks_kind_requirements_check check (
    (slot_kind <> 'custom' or (slot_label is not null and btrim(slot_label) <> ''))
    and (slot_kind <> 'exact_time' or scheduled_time is not null)
  )
);

create index if not exists run_schedule_blocks_run_day_sort_idx
  on public.run_schedule_blocks (experiment_run_id, day_index, sort_order);
create index if not exists run_schedule_blocks_run_status_idx
  on public.run_schedule_blocks (experiment_run_id, status);

create table if not exists public.run_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_run_id uuid not null references public.experiment_runs(id) on delete cascade,
  scope_type text not null check (scope_type in ('study', 'cohort', 'animal')),
  study_id uuid,
  cohort_id uuid references public.cohorts(id) on delete set null,
  animal_id uuid references public.animals(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_assignments_scope_target_check check (
    (
      scope_type = 'study'
      and study_id is not null
      and cohort_id is null
      and animal_id is null
    )
    or (
      scope_type = 'cohort'
      and study_id is null
      and cohort_id is not null
      and animal_id is null
    )
    or (
      scope_type = 'animal'
      and study_id is null
      and cohort_id is null
      and animal_id is not null
    )
  )
);

create index if not exists run_assignments_run_idx
  on public.run_assignments (experiment_run_id);
create index if not exists run_assignments_scope_cohort_idx
  on public.run_assignments (scope_type, cohort_id);
create index if not exists run_assignments_scope_animal_idx
  on public.run_assignments (scope_type, animal_id);

create or replace function public.can_view_schedule_template(target_schedule_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_templates st
    where st.id = target_schedule_template_id
      and public.can_view_experiment_template(st.template_id)
  );
$$;

create or replace function public.can_edit_schedule_template(target_schedule_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_templates st
    where st.id = target_schedule_template_id
      and public.can_edit_experiment_template(st.template_id)
  );
$$;

create or replace function public.can_view_schedule_day(target_schedule_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_days sd
    where sd.id = target_schedule_day_id
      and public.can_view_schedule_template(sd.schedule_template_id)
  );
$$;

create or replace function public.can_edit_schedule_day(target_schedule_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_days sd
    where sd.id = target_schedule_day_id
      and public.can_edit_schedule_template(sd.schedule_template_id)
  );
$$;

create or replace function public.can_view_schedule_slot(target_schedule_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_slots ss
    where ss.id = target_schedule_slot_id
      and public.can_view_schedule_day(ss.schedule_day_id)
  );
$$;

create or replace function public.can_edit_schedule_slot(target_schedule_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_slots ss
    where ss.id = target_schedule_slot_id
      and public.can_edit_schedule_day(ss.schedule_day_id)
  );
$$;

alter table public.schedule_templates enable row level security;
alter table public.schedule_days enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.scheduled_blocks enable row level security;
alter table public.run_schedule_blocks enable row level security;
alter table public.run_assignments enable row level security;

create policy "Users can view schedule templates"
  on public.schedule_templates for select
  using (public.can_view_experiment_template(template_id));

create policy "Users can create schedule templates"
  on public.schedule_templates for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_experiment_template(template_id)
  );

create policy "Users can update schedule templates"
  on public.schedule_templates for update
  using (public.can_edit_experiment_template(template_id))
  with check (public.can_edit_experiment_template(template_id));

create policy "Users can delete schedule templates"
  on public.schedule_templates for delete
  using (public.can_edit_experiment_template(template_id));

create policy "Users can view schedule days"
  on public.schedule_days for select
  using (public.can_view_schedule_template(schedule_template_id));

create policy "Users can create schedule days"
  on public.schedule_days for insert
  with check (public.can_edit_schedule_template(schedule_template_id));

create policy "Users can update schedule days"
  on public.schedule_days for update
  using (public.can_edit_schedule_template(schedule_template_id))
  with check (public.can_edit_schedule_template(schedule_template_id));

create policy "Users can delete schedule days"
  on public.schedule_days for delete
  using (public.can_edit_schedule_template(schedule_template_id));

create policy "Users can view schedule slots"
  on public.schedule_slots for select
  using (public.can_view_schedule_day(schedule_day_id));

create policy "Users can create schedule slots"
  on public.schedule_slots for insert
  with check (public.can_edit_schedule_day(schedule_day_id));

create policy "Users can update schedule slots"
  on public.schedule_slots for update
  using (public.can_edit_schedule_day(schedule_day_id))
  with check (public.can_edit_schedule_day(schedule_day_id));

create policy "Users can delete schedule slots"
  on public.schedule_slots for delete
  using (public.can_edit_schedule_day(schedule_day_id));

create policy "Users can view scheduled blocks"
  on public.scheduled_blocks for select
  using (public.can_view_schedule_slot(schedule_slot_id));

create policy "Users can create scheduled blocks"
  on public.scheduled_blocks for insert
  with check (
    public.can_edit_schedule_slot(schedule_slot_id)
    and public.can_view_experiment_template(experiment_template_id)
    and (
      protocol_id is null
      or exists (
        select 1
        from public.template_protocol_links tpl
        where tpl.template_id = experiment_template_id
          and tpl.protocol_id = protocol_id
      )
    )
  );

create policy "Users can update scheduled blocks"
  on public.scheduled_blocks for update
  using (public.can_edit_schedule_slot(schedule_slot_id))
  with check (
    public.can_edit_schedule_slot(schedule_slot_id)
    and public.can_view_experiment_template(experiment_template_id)
    and (
      protocol_id is null
      or exists (
        select 1
        from public.template_protocol_links tpl
        where tpl.template_id = experiment_template_id
          and tpl.protocol_id = protocol_id
      )
    )
  );

create policy "Users can delete scheduled blocks"
  on public.scheduled_blocks for delete
  using (public.can_edit_schedule_slot(schedule_slot_id));

drop policy if exists "Users can create experiment runs" on public.experiment_runs;
drop policy if exists "Users can update editable experiment runs" on public.experiment_runs;

create policy "Users can create experiment runs"
  on public.experiment_runs for insert
  with check (
    auth.uid() = created_by
    and (
      (
        owner_user_id = auth.uid()
        and owner_lab_id is null
        and visibility = 'private'
      )
      or (
        owner_user_id is null
        and owner_lab_id is not null
        and visibility = 'lab_shared'
        and public.has_lab_role(owner_lab_id, array['manager', 'admin'])
      )
    )
    and (template_id is null or public.can_view_experiment_template(template_id))
    and (result_schema_id is null or public.can_view_result_schema(result_schema_id))
    and (schedule_template_id is null or public.can_view_schedule_template(schedule_template_id))
    and (
      template_id is null
      or result_schema_id is null
      or exists (
        select 1
        from public.result_schemas rs
        where rs.id = result_schema_id
          and rs.template_id = template_id
      )
    )
    and (
      template_id is null
      or selected_protocol_id is null
      or exists (
        select 1
        from public.template_protocol_links tpl
        where tpl.template_id = template_id
          and tpl.protocol_id = selected_protocol_id
      )
    )
    and (
      schedule_template_id is null
      or (
        template_id is not null
        and exists (
          select 1
          from public.schedule_templates st
          where st.id = schedule_template_id
            and st.template_id = template_id
        )
      )
    )
  );

create policy "Users can update editable experiment runs"
  on public.experiment_runs for update
  using (public.can_edit_experiment_run(id))
  with check (
    (
      (
        owner_user_id = auth.uid()
        and owner_lab_id is null
        and visibility = 'private'
      )
      or (
        owner_user_id is null
        and owner_lab_id is not null
        and visibility = 'lab_shared'
        and public.has_lab_role(owner_lab_id, array['manager', 'admin'])
      )
    )
    and (template_id is null or public.can_view_experiment_template(template_id))
    and (result_schema_id is null or public.can_view_result_schema(result_schema_id))
    and (schedule_template_id is null or public.can_view_schedule_template(schedule_template_id))
    and (
      template_id is null
      or result_schema_id is null
      or exists (
        select 1
        from public.result_schemas rs
        where rs.id = result_schema_id
          and rs.template_id = template_id
      )
    )
    and (
      template_id is null
      or selected_protocol_id is null
      or exists (
        select 1
        from public.template_protocol_links tpl
        where tpl.template_id = template_id
          and tpl.protocol_id = selected_protocol_id
      )
    )
    and (
      schedule_template_id is null
      or (
        template_id is not null
        and exists (
          select 1
          from public.schedule_templates st
          where st.id = schedule_template_id
            and st.template_id = template_id
        )
      )
    )
  );

create policy "Users can view run schedule blocks"
  on public.run_schedule_blocks for select
  using (public.can_view_experiment_run(experiment_run_id));

create policy "Users can create run schedule blocks"
  on public.run_schedule_blocks for insert
  with check (
    public.can_edit_experiment_run(experiment_run_id)
    and (experiment_template_id is null or public.can_view_experiment_template(experiment_template_id))
    and (
      protocol_id is null
      or experiment_template_id is null
      or exists (
        select 1
        from public.template_protocol_links tpl
        where tpl.template_id = experiment_template_id
          and tpl.protocol_id = protocol_id
      )
    )
  );

create policy "Users can update run schedule blocks"
  on public.run_schedule_blocks for update
  using (public.can_edit_experiment_run(experiment_run_id))
  with check (
    public.can_edit_experiment_run(experiment_run_id)
    and (experiment_template_id is null or public.can_view_experiment_template(experiment_template_id))
    and (
      protocol_id is null
      or experiment_template_id is null
      or exists (
        select 1
        from public.template_protocol_links tpl
        where tpl.template_id = experiment_template_id
          and tpl.protocol_id = protocol_id
      )
    )
  );

create policy "Users can delete run schedule blocks"
  on public.run_schedule_blocks for delete
  using (public.can_edit_experiment_run(experiment_run_id));

create policy "Users can view run assignments"
  on public.run_assignments for select
  using (public.can_view_experiment_run(experiment_run_id));

create policy "Users can create run assignments"
  on public.run_assignments for insert
  with check (
    public.can_edit_experiment_run(experiment_run_id)
    and (
      cohort_id is null
      or exists (
        select 1
        from public.cohorts c
        where c.id = cohort_id
          and c.user_id = auth.uid()
      )
    )
    and (
      animal_id is null
      or exists (
        select 1
        from public.animals a
        where a.id = animal_id
          and a.user_id = auth.uid()
      )
    )
  );

create policy "Users can update run assignments"
  on public.run_assignments for update
  using (public.can_edit_experiment_run(experiment_run_id))
  with check (
    public.can_edit_experiment_run(experiment_run_id)
    and (
      cohort_id is null
      or exists (
        select 1
        from public.cohorts c
        where c.id = cohort_id
          and c.user_id = auth.uid()
      )
    )
    and (
      animal_id is null
      or exists (
        select 1
        from public.animals a
        where a.id = animal_id
          and a.user_id = auth.uid()
      )
    )
  );

create policy "Users can delete run assignments"
  on public.run_assignments for delete
  using (public.can_edit_experiment_run(experiment_run_id));

create or replace trigger on_schedule_templates_updated
  before update on public.schedule_templates
  for each row execute function public.handle_updated_at();

create or replace trigger on_schedule_days_updated
  before update on public.schedule_days
  for each row execute function public.handle_updated_at();

create or replace trigger on_schedule_slots_updated
  before update on public.schedule_slots
  for each row execute function public.handle_updated_at();

create or replace trigger on_scheduled_blocks_updated
  before update on public.scheduled_blocks
  for each row execute function public.handle_updated_at();

create or replace trigger on_run_schedule_blocks_updated
  before update on public.run_schedule_blocks
  for each row execute function public.handle_updated_at();

create or replace trigger on_run_assignments_updated
  before update on public.run_assignments
  for each row execute function public.handle_updated_at();
