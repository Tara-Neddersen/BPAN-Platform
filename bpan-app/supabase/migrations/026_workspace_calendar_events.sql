-- 026: Workspace calendar events (internal unified calendar layer)

create table if not exists public.workspace_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default true,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  category text not null default 'general',
  location text,
  source_type text,
  source_id text,
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_calendar_events_user_start
  on public.workspace_calendar_events(user_id, start_at);

create index if not exists idx_workspace_calendar_events_user_source
  on public.workspace_calendar_events(user_id, source_type, source_id);

alter table public.workspace_calendar_events enable row level security;

drop policy if exists "Users manage own workspace calendar events" on public.workspace_calendar_events;
create policy "Users manage own workspace calendar events"
  on public.workspace_calendar_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace trigger on_workspace_calendar_events_updated
  before update on public.workspace_calendar_events
  for each row execute function public.handle_updated_at();
