-- BPAN Platform — Shared lab announcements and shared task boards

create table if not exists public.lab_announcements (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  type text not null default 'general' check (type in ('inspection', 'general')),
  title text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_announcements_lab_created_idx
  on public.lab_announcements (lab_id, created_at desc);

create index if not exists lab_announcements_lab_type_created_idx
  on public.lab_announcements (lab_id, type, created_at desc);

create table if not exists public.lab_shared_tasks (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  list_type text not null default 'general' check (list_type in ('inspection', 'general')),
  title text not null,
  details text not null default '',
  assignee_member_id uuid references public.lab_members(id) on delete set null,
  done boolean not null default false,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_shared_tasks_lab_created_idx
  on public.lab_shared_tasks (lab_id, created_at desc);

create index if not exists lab_shared_tasks_lab_list_done_idx
  on public.lab_shared_tasks (lab_id, list_type, done, created_at desc);

alter table public.lab_announcements enable row level security;
alter table public.lab_shared_tasks enable row level security;

drop policy if exists "Lab members can view announcements" on public.lab_announcements;
create policy "Lab members can view announcements"
  on public.lab_announcements for select
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_announcements.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab managers can insert announcements" on public.lab_announcements;
create policy "Lab managers can insert announcements"
  on public.lab_announcements for insert
  with check (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_announcements.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  );

drop policy if exists "Lab managers can update announcements" on public.lab_announcements;
create policy "Lab managers can update announcements"
  on public.lab_announcements for update
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_announcements.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_announcements.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  );

drop policy if exists "Lab managers can delete announcements" on public.lab_announcements;
create policy "Lab managers can delete announcements"
  on public.lab_announcements for delete
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_announcements.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  );

drop policy if exists "Lab members can view shared tasks" on public.lab_shared_tasks;
create policy "Lab members can view shared tasks"
  on public.lab_shared_tasks for select
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_shared_tasks.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab managers can insert shared tasks" on public.lab_shared_tasks;
create policy "Lab managers can insert shared tasks"
  on public.lab_shared_tasks for insert
  with check (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_shared_tasks.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  );

drop policy if exists "Lab managers can update shared tasks" on public.lab_shared_tasks;
create policy "Lab managers can update shared tasks"
  on public.lab_shared_tasks for update
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_shared_tasks.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_shared_tasks.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  );

drop policy if exists "Lab managers can delete shared tasks" on public.lab_shared_tasks;
create policy "Lab managers can delete shared tasks"
  on public.lab_shared_tasks for delete
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_shared_tasks.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
        and lm.role in ('manager', 'admin')
    )
  );

drop trigger if exists on_lab_announcements_updated on public.lab_announcements;
create trigger on_lab_announcements_updated
  before update on public.lab_announcements
  for each row execute function public.handle_updated_at();

drop trigger if exists on_lab_shared_tasks_updated on public.lab_shared_tasks;
create trigger on_lab_shared_tasks_updated
  before update on public.lab_shared_tasks
  for each row execute function public.handle_updated_at();
