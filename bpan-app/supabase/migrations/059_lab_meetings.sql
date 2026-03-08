-- BPAN Platform — Lab meetings with AI-extracted action items

create table if not exists public.lab_meetings (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  meeting_date date not null default current_date,
  attendees jsonb not null default '[]'::jsonb,
  content text not null default '',
  ai_summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_meetings_lab_date_idx
  on public.lab_meetings (lab_id, meeting_date desc, created_at desc);

create index if not exists lab_meetings_created_by_idx
  on public.lab_meetings (created_by, created_at desc);

create table if not exists public.lab_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  lab_meeting_id uuid not null references public.lab_meetings(id) on delete cascade,
  text text not null,
  details text,
  category text not null default 'general' check (category in ('general', 'inspection')),
  status text not null default 'open' check (status in ('open', 'completed')),
  responsible_member_id uuid references public.lab_members(id) on delete set null,
  responsible_label text,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_meeting_action_items_meeting_created_idx
  on public.lab_meeting_action_items (lab_meeting_id, created_at desc);

create index if not exists lab_meeting_action_items_status_idx
  on public.lab_meeting_action_items (status, created_at desc);

create index if not exists lab_meeting_action_items_responsible_member_idx
  on public.lab_meeting_action_items (responsible_member_id, created_at desc);

alter table public.lab_meetings enable row level security;
alter table public.lab_meeting_action_items enable row level security;

drop policy if exists "Lab members can view lab meetings" on public.lab_meetings;
create policy "Lab members can view lab meetings"
  on public.lab_meetings for select
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_meetings.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can insert lab meetings" on public.lab_meetings;
create policy "Lab members can insert lab meetings"
  on public.lab_meetings for insert
  with check (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_meetings.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can update lab meetings" on public.lab_meetings;
create policy "Lab members can update lab meetings"
  on public.lab_meetings for update
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_meetings.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_meetings.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can delete lab meetings" on public.lab_meetings;
create policy "Lab members can delete lab meetings"
  on public.lab_meetings for delete
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_meetings.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can view lab meeting action items" on public.lab_meeting_action_items;
create policy "Lab members can view lab meeting action items"
  on public.lab_meeting_action_items for select
  using (
    exists (
      select 1
      from public.lab_meetings m
      join public.lab_members lm on lm.lab_id = m.lab_id
      where m.id = lab_meeting_action_items.lab_meeting_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can insert lab meeting action items" on public.lab_meeting_action_items;
create policy "Lab members can insert lab meeting action items"
  on public.lab_meeting_action_items for insert
  with check (
    exists (
      select 1
      from public.lab_meetings m
      join public.lab_members lm on lm.lab_id = m.lab_id
      where m.id = lab_meeting_action_items.lab_meeting_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can update lab meeting action items" on public.lab_meeting_action_items;
create policy "Lab members can update lab meeting action items"
  on public.lab_meeting_action_items for update
  using (
    exists (
      select 1
      from public.lab_meetings m
      join public.lab_members lm on lm.lab_id = m.lab_id
      where m.id = lab_meeting_action_items.lab_meeting_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.lab_meetings m
      join public.lab_members lm on lm.lab_id = m.lab_id
      where m.id = lab_meeting_action_items.lab_meeting_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can delete lab meeting action items" on public.lab_meeting_action_items;
create policy "Lab members can delete lab meeting action items"
  on public.lab_meeting_action_items for delete
  using (
    exists (
      select 1
      from public.lab_meetings m
      join public.lab_members lm on lm.lab_id = m.lab_id
      where m.id = lab_meeting_action_items.lab_meeting_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop trigger if exists on_lab_meetings_updated on public.lab_meetings;
create trigger on_lab_meetings_updated
  before update on public.lab_meetings
  for each row execute function public.handle_updated_at();

drop trigger if exists on_lab_meeting_action_items_updated on public.lab_meeting_action_items;
create trigger on_lab_meeting_action_items_updated
  before update on public.lab_meeting_action_items
  for each row execute function public.handle_updated_at();
