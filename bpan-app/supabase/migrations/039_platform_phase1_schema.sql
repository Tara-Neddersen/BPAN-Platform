-- ============================================================
-- BPAN Platform — Redesign Phase 1 schema and contracts
-- Introduces lab ownership, reusable experiment templates, result schemas,
-- and concrete experiment runs without the schedule-template layer yet.
-- ============================================================

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  shared_template_edit_policy text not null default 'manager_controlled'
    check (shared_template_edit_policy in ('open_edit', 'manager_controlled')),
  shared_protocol_edit_policy text not null default 'manager_controlled'
    check (shared_protocol_edit_policy in ('open_edit', 'manager_controlled')),
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists labs_created_by_idx on public.labs (created_by);

create table if not exists public.lab_members (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('member', 'manager', 'admin')),
  display_title text,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_id, user_id)
);

create index if not exists lab_members_user_id_idx on public.lab_members (user_id);
create index if not exists lab_members_lab_role_idx on public.lab_members (lab_id, role);

create table if not exists public.experiment_templates (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'lab')),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  owner_lab_id uuid references public.labs(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private', 'lab_shared')),
  title text not null,
  description text,
  category text,
  default_assignment_scope text
    check (default_assignment_scope in ('study', 'cohort', 'animal')),
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiment_templates_owner_consistency_check check (
    (
      owner_type = 'user'
      and owner_user_id is not null
      and owner_lab_id is null
      and visibility = 'private'
    )
    or (
      owner_type = 'lab'
      and owner_lab_id is not null
      and owner_user_id is null
      and visibility = 'lab_shared'
    )
  )
);

create index if not exists experiment_templates_owner_user_idx
  on public.experiment_templates (owner_user_id);
create index if not exists experiment_templates_owner_lab_idx
  on public.experiment_templates (owner_lab_id);
create index if not exists experiment_templates_visibility_owner_lab_idx
  on public.experiment_templates (visibility, owner_lab_id);
create index if not exists experiment_templates_title_search_idx
  on public.experiment_templates using gin (to_tsvector('simple', title));

create table if not exists public.template_protocol_links (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.experiment_templates(id) on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, protocol_id)
);

create index if not exists template_protocol_links_template_sort_idx
  on public.template_protocol_links (template_id, sort_order);
create index if not exists template_protocol_links_default_idx
  on public.template_protocol_links (template_id)
  where is_default = true;

create table if not exists public.result_schemas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.experiment_templates(id) on delete cascade,
  name text not null default 'Default schema',
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists result_schemas_template_idx on public.result_schemas (template_id);
create index if not exists result_schemas_template_active_idx
  on public.result_schemas (template_id, is_active);
create unique index if not exists result_schemas_one_active_per_template_idx
  on public.result_schemas (template_id)
  where is_active = true;

create table if not exists public.result_schema_columns (
  id uuid primary key default gen_random_uuid(),
  schema_id uuid not null references public.result_schemas(id) on delete cascade,
  key text not null,
  label text not null,
  column_type text not null check (
    column_type in (
      'text',
      'long_text',
      'number',
      'integer',
      'boolean',
      'date',
      'time',
      'datetime',
      'select',
      'multi_select',
      'file',
      'url',
      'animal_ref',
      'cohort_ref',
      'batch_ref'
    )
  ),
  required boolean not null default false,
  default_value jsonb,
  options jsonb not null default '[]',
  unit text,
  help_text text,
  group_key text,
  sort_order integer not null default 0,
  is_system_default boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schema_id, key)
);

create index if not exists result_schema_columns_schema_sort_idx
  on public.result_schema_columns (schema_id, sort_order);
create index if not exists result_schema_columns_schema_group_idx
  on public.result_schema_columns (schema_id, group_key);

create table if not exists public.experiment_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.experiment_templates(id) on delete set null,
  legacy_experiment_id uuid references public.experiments(id) on delete set null,
  owner_user_id uuid references public.profiles(id) on delete cascade,
  owner_lab_id uuid references public.labs(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private', 'lab_shared')),
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'planned', 'in_progress', 'completed', 'cancelled')),
  selected_protocol_id uuid references public.protocols(id) on delete set null,
  result_schema_id uuid references public.result_schemas(id) on delete set null,
  schema_snapshot jsonb not null default '[]',
  start_anchor_date date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiment_runs_owner_consistency_check check (
    (
      owner_user_id is not null
      and owner_lab_id is null
      and visibility = 'private'
    )
    or (
      owner_lab_id is not null
      and owner_user_id is null
      and visibility = 'lab_shared'
    )
  )
);

create index if not exists experiment_runs_template_idx on public.experiment_runs (template_id);
create index if not exists experiment_runs_legacy_experiment_idx
  on public.experiment_runs (legacy_experiment_id);
create index if not exists experiment_runs_owner_user_idx on public.experiment_runs (owner_user_id);
create index if not exists experiment_runs_owner_lab_idx on public.experiment_runs (owner_lab_id);
create index if not exists experiment_runs_status_idx on public.experiment_runs (status);

create or replace function public.is_lab_member(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_members lm
    where lm.lab_id = target_lab_id
      and lm.user_id = auth.uid()
      and lm.is_active = true
  );
$$;

create or replace function public.has_lab_role(target_lab_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_members lm
    where lm.lab_id = target_lab_id
      and lm.user_id = auth.uid()
      and lm.is_active = true
      and lm.role = any (allowed_roles)
  );
$$;

create or replace function public.can_manage_lab_members(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_lab_role(target_lab_id, array['manager', 'admin']);
$$;

create or replace function public.can_edit_lab_resources(target_lab_id uuid, edit_policy text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when edit_policy = 'open_edit' then public.is_lab_member(target_lab_id)
    else public.has_lab_role(target_lab_id, array['manager', 'admin'])
  end;
$$;

create or replace function public.can_view_experiment_template(target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.experiment_templates et
    where et.id = target_template_id
      and (
        (et.owner_type = 'user' and et.owner_user_id = auth.uid())
        or (et.owner_type = 'lab' and public.is_lab_member(et.owner_lab_id))
      )
  );
$$;

create or replace function public.can_edit_experiment_template(target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.experiment_templates et
    left join public.labs l on l.id = et.owner_lab_id
    where et.id = target_template_id
      and (
        (et.owner_type = 'user' and et.owner_user_id = auth.uid())
        or (
          et.owner_type = 'lab'
          and l.id is not null
          and public.can_edit_lab_resources(l.id, l.shared_template_edit_policy)
        )
      )
  );
$$;

create or replace function public.can_view_result_schema(target_schema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.result_schemas rs
    where rs.id = target_schema_id
      and public.can_view_experiment_template(rs.template_id)
  );
$$;

create or replace function public.can_edit_result_schema(target_schema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.result_schemas rs
    where rs.id = target_schema_id
      and public.can_edit_experiment_template(rs.template_id)
  );
$$;

create or replace function public.can_view_experiment_run(target_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.experiment_runs er
    where er.id = target_run_id
      and (
        (er.owner_user_id is not null and er.owner_user_id = auth.uid())
        or (er.owner_lab_id is not null and public.is_lab_member(er.owner_lab_id))
      )
  );
$$;

create or replace function public.can_edit_experiment_run(target_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.experiment_runs er
    where er.id = target_run_id
      and (
        (er.owner_user_id is not null and er.owner_user_id = auth.uid())
        or (
          er.owner_lab_id is not null
          and public.has_lab_role(er.owner_lab_id, array['manager', 'admin'])
        )
      )
  );
$$;

create or replace function public.handle_new_lab_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.lab_members (lab_id, user_id, role, invited_by)
    values (new.id, new.created_by, 'admin', new.created_by)
    on conflict (lab_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

alter table public.labs enable row level security;
alter table public.lab_members enable row level security;
alter table public.experiment_templates enable row level security;
alter table public.template_protocol_links enable row level security;
alter table public.result_schemas enable row level security;
alter table public.result_schema_columns enable row level security;
alter table public.experiment_runs enable row level security;

create policy "Users can view accessible labs"
  on public.labs for select
  using (public.is_lab_member(id));

create policy "Users can create labs they own"
  on public.labs for insert
  with check (auth.uid() = created_by);

create policy "Lab admins can update labs"
  on public.labs for update
  using (public.has_lab_role(id, array['admin']))
  with check (public.has_lab_role(id, array['admin']));

create policy "Lab admins can delete labs"
  on public.labs for delete
  using (public.has_lab_role(id, array['admin']));

create policy "Members can view lab rosters"
  on public.lab_members for select
  using (
    (
      public.is_lab_member(lab_id)
      and is_active = true
    )
    or public.has_lab_role(lab_id, array['manager', 'admin'])
  );

create policy "Managers can add lab members"
  on public.lab_members for insert
  with check (
    public.can_manage_lab_members(lab_id)
    and (
      public.has_lab_role(lab_id, array['admin'])
      or (role in ('member', 'manager') and is_active = true)
    )
  );

create policy "Managers can update active lab members"
  on public.lab_members for update
  using (public.can_manage_lab_members(lab_id))
  with check (
    public.can_manage_lab_members(lab_id)
    and (
      public.has_lab_role(lab_id, array['admin'])
      or (role in ('member', 'manager') and is_active = true)
    )
  );

create policy "Admins can remove lab members"
  on public.lab_members for delete
  using (public.has_lab_role(lab_id, array['admin']));

create policy "Users can view accessible experiment templates"
  on public.experiment_templates for select
  using (public.can_view_experiment_template(id));

create policy "Users can create experiment templates"
  on public.experiment_templates for insert
  with check (
    auth.uid() = created_by
    and (
      (
        owner_type = 'user'
        and owner_user_id = auth.uid()
        and owner_lab_id is null
        and visibility = 'private'
      )
      or (
        owner_type = 'lab'
        and owner_user_id is null
        and owner_lab_id is not null
        and visibility = 'lab_shared'
        and public.has_lab_role(owner_lab_id, array['manager', 'admin'])
      )
    )
  );

create policy "Users can update editable experiment templates"
  on public.experiment_templates for update
  using (public.can_edit_experiment_template(id))
  with check (
    (
      owner_type = 'user'
      and owner_user_id = auth.uid()
      and owner_lab_id is null
      and visibility = 'private'
    )
    or (
      owner_type = 'lab'
      and owner_user_id is null
      and owner_lab_id is not null
      and visibility = 'lab_shared'
      and public.can_edit_lab_resources(
        owner_lab_id,
        (
          select l.shared_template_edit_policy
          from public.labs l
          where l.id = owner_lab_id
        )
      )
    )
  );

create policy "Users can delete editable experiment templates"
  on public.experiment_templates for delete
  using (public.can_edit_experiment_template(id));

create policy "Users can view template protocol links"
  on public.template_protocol_links for select
  using (public.can_view_experiment_template(template_id));

create policy "Users can create template protocol links"
  on public.template_protocol_links for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_experiment_template(template_id)
  );

create policy "Users can update template protocol links"
  on public.template_protocol_links for update
  using (public.can_edit_experiment_template(template_id))
  with check (public.can_edit_experiment_template(template_id));

create policy "Users can delete template protocol links"
  on public.template_protocol_links for delete
  using (public.can_edit_experiment_template(template_id));

create policy "Users can view result schemas"
  on public.result_schemas for select
  using (public.can_view_experiment_template(template_id));

create policy "Users can create result schemas"
  on public.result_schemas for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_experiment_template(template_id)
  );

create policy "Users can update result schemas"
  on public.result_schemas for update
  using (public.can_edit_experiment_template(template_id))
  with check (public.can_edit_experiment_template(template_id));

create policy "Users can delete result schemas"
  on public.result_schemas for delete
  using (public.can_edit_experiment_template(template_id));

create policy "Users can view result schema columns"
  on public.result_schema_columns for select
  using (public.can_view_result_schema(schema_id));

create policy "Users can create result schema columns"
  on public.result_schema_columns for insert
  with check (public.can_edit_result_schema(schema_id));

create policy "Users can update result schema columns"
  on public.result_schema_columns for update
  using (public.can_edit_result_schema(schema_id))
  with check (public.can_edit_result_schema(schema_id));

create policy "Users can delete result schema columns"
  on public.result_schema_columns for delete
  using (public.can_edit_result_schema(schema_id));

create policy "Users can view accessible experiment runs"
  on public.experiment_runs for select
  using (public.can_view_experiment_run(id));

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
  );

create policy "Users can delete editable experiment runs"
  on public.experiment_runs for delete
  using (public.can_edit_experiment_run(id));

create or replace trigger on_labs_updated
  before update on public.labs
  for each row execute function public.handle_updated_at();

create or replace trigger on_lab_members_updated
  before update on public.lab_members
  for each row execute function public.handle_updated_at();

create or replace trigger on_experiment_templates_updated
  before update on public.experiment_templates
  for each row execute function public.handle_updated_at();

create or replace trigger on_template_protocol_links_updated
  before update on public.template_protocol_links
  for each row execute function public.handle_updated_at();

create or replace trigger on_result_schemas_updated
  before update on public.result_schemas
  for each row execute function public.handle_updated_at();

create or replace trigger on_result_schema_columns_updated
  before update on public.result_schema_columns
  for each row execute function public.handle_updated_at();

create or replace trigger on_experiment_runs_updated
  before update on public.experiment_runs
  for each row execute function public.handle_updated_at();

create or replace trigger on_labs_created
  after insert on public.labs
  for each row execute function public.handle_new_lab_membership();
