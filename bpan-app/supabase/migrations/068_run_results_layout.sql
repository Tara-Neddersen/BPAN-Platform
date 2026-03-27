-- ============================================================
-- BPAN Platform — Separate run results layout from run schedule
-- Adds explicit run timepoints, run timepoint experiments, and
-- per-experiment schedule steps so Colony Results no longer has
-- to infer data-entry structure from schedule blocks.
-- ============================================================

create table if not exists public.run_timepoints (
  id uuid primary key default gen_random_uuid(),
  experiment_run_id uuid not null references public.experiment_runs(id) on delete cascade,
  key text not null,
  label text not null,
  target_age_days integer not null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_timepoints_key_not_blank check (btrim(key) <> ''),
  constraint run_timepoints_label_not_blank check (btrim(label) <> '')
);

create unique index if not exists run_timepoints_run_key_idx
  on public.run_timepoints (experiment_run_id, key);
create index if not exists run_timepoints_run_sort_idx
  on public.run_timepoints (experiment_run_id, sort_order);
create index if not exists run_timepoints_run_age_idx
  on public.run_timepoints (experiment_run_id, target_age_days);

create table if not exists public.run_timepoint_experiments (
  id uuid primary key default gen_random_uuid(),
  run_timepoint_id uuid not null references public.run_timepoints(id) on delete cascade,
  experiment_key text not null,
  label text not null,
  sort_order integer not null default 0,
  result_schema_id uuid references public.result_schemas(id) on delete set null,
  schema_snapshot jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_timepoint_experiments_key_not_blank check (btrim(experiment_key) <> ''),
  constraint run_timepoint_experiments_label_not_blank check (btrim(label) <> '')
);

create unique index if not exists run_timepoint_experiments_timepoint_key_idx
  on public.run_timepoint_experiments (run_timepoint_id, experiment_key);
create index if not exists run_timepoint_experiments_timepoint_sort_idx
  on public.run_timepoint_experiments (run_timepoint_id, sort_order);

create table if not exists public.run_experiment_schedule_steps (
  id uuid primary key default gen_random_uuid(),
  run_timepoint_experiment_id uuid not null references public.run_timepoint_experiments(id) on delete cascade,
  relative_day integer not null default 1,
  slot_kind text not null check (slot_kind in ('am', 'pm', 'midday', 'evening', 'custom', 'exact_time')),
  slot_label text,
  scheduled_time time,
  sort_order integer not null default 0,
  task_type text not null default 'experiment'
    check (task_type in ('experiment', 'handling', 'transport', 'prep', 'recovery', 'collection', 'custom')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_experiment_schedule_steps_kind_requirements_check check (
    (slot_kind <> 'custom' or (slot_label is not null and btrim(slot_label) <> ''))
    and (slot_kind <> 'exact_time' or scheduled_time is not null)
  )
);

create index if not exists run_experiment_schedule_steps_experiment_day_sort_idx
  on public.run_experiment_schedule_steps (run_timepoint_experiment_id, relative_day, sort_order);

create or replace function public.can_view_run_timepoint(target_run_timepoint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.run_timepoints rt
    where rt.id = target_run_timepoint_id
      and public.can_view_experiment_run(rt.experiment_run_id)
  );
$$;

create or replace function public.can_edit_run_timepoint(target_run_timepoint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.run_timepoints rt
    where rt.id = target_run_timepoint_id
      and public.can_edit_experiment_run(rt.experiment_run_id)
  );
$$;

create or replace function public.can_view_run_timepoint_experiment(target_run_timepoint_experiment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.run_timepoint_experiments rte
    where rte.id = target_run_timepoint_experiment_id
      and public.can_view_run_timepoint(rte.run_timepoint_id)
  );
$$;

create or replace function public.can_edit_run_timepoint_experiment(target_run_timepoint_experiment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.run_timepoint_experiments rte
    where rte.id = target_run_timepoint_experiment_id
      and public.can_edit_run_timepoint(rte.run_timepoint_id)
  );
$$;

alter table public.run_timepoints enable row level security;
alter table public.run_timepoint_experiments enable row level security;
alter table public.run_experiment_schedule_steps enable row level security;

create policy "Users can view run timepoints"
  on public.run_timepoints for select
  using (public.can_view_experiment_run(experiment_run_id));

create policy "Users can create run timepoints"
  on public.run_timepoints for insert
  with check (public.can_edit_experiment_run(experiment_run_id));

create policy "Users can update run timepoints"
  on public.run_timepoints for update
  using (public.can_edit_experiment_run(experiment_run_id))
  with check (public.can_edit_experiment_run(experiment_run_id));

create policy "Users can delete run timepoints"
  on public.run_timepoints for delete
  using (public.can_edit_experiment_run(experiment_run_id));

create policy "Users can view run timepoint experiments"
  on public.run_timepoint_experiments for select
  using (public.can_view_run_timepoint(run_timepoint_id));

create policy "Users can create run timepoint experiments"
  on public.run_timepoint_experiments for insert
  with check (
    public.can_edit_run_timepoint(run_timepoint_id)
    and (result_schema_id is null or public.can_view_result_schema(result_schema_id))
  );

create policy "Users can update run timepoint experiments"
  on public.run_timepoint_experiments for update
  using (public.can_edit_run_timepoint(run_timepoint_id))
  with check (
    public.can_edit_run_timepoint(run_timepoint_id)
    and (result_schema_id is null or public.can_view_result_schema(result_schema_id))
  );

create policy "Users can delete run timepoint experiments"
  on public.run_timepoint_experiments for delete
  using (public.can_edit_run_timepoint(run_timepoint_id));

create policy "Users can view run experiment schedule steps"
  on public.run_experiment_schedule_steps for select
  using (public.can_view_run_timepoint_experiment(run_timepoint_experiment_id));

create policy "Users can create run experiment schedule steps"
  on public.run_experiment_schedule_steps for insert
  with check (public.can_edit_run_timepoint_experiment(run_timepoint_experiment_id));

create policy "Users can update run experiment schedule steps"
  on public.run_experiment_schedule_steps for update
  using (public.can_edit_run_timepoint_experiment(run_timepoint_experiment_id))
  with check (public.can_edit_run_timepoint_experiment(run_timepoint_experiment_id));

create policy "Users can delete run experiment schedule steps"
  on public.run_experiment_schedule_steps for delete
  using (public.can_edit_run_timepoint_experiment(run_timepoint_experiment_id));

create or replace trigger on_run_timepoints_updated
  before update on public.run_timepoints
  for each row execute function public.handle_updated_at();

create or replace trigger on_run_timepoint_experiments_updated
  before update on public.run_timepoint_experiments
  for each row execute function public.handle_updated_at();

create or replace trigger on_run_experiment_schedule_steps_updated
  before update on public.run_experiment_schedule_steps
  for each row execute function public.handle_updated_at();

alter table public.colony_results
  add column if not exists experiment_run_id uuid references public.experiment_runs(id) on delete set null,
  add column if not exists run_timepoint_id uuid references public.run_timepoints(id) on delete set null,
  add column if not exists run_timepoint_experiment_id uuid references public.run_timepoint_experiments(id) on delete set null;

drop index if exists public.idx_colony_results_unique;

create unique index if not exists idx_colony_results_legacy_unique
  on public.colony_results(animal_id, timepoint_age_days, experiment_type)
  where experiment_run_id is null and run_timepoint_experiment_id is null;

create unique index if not exists idx_colony_results_run_unique
  on public.colony_results(experiment_run_id, animal_id, run_timepoint_experiment_id)
  where experiment_run_id is not null and run_timepoint_experiment_id is not null;

create index if not exists idx_colony_results_run_lookup
  on public.colony_results(experiment_run_id, run_timepoint_id, run_timepoint_experiment_id);
