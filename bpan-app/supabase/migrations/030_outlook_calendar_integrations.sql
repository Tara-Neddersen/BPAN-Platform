create table if not exists public.outlook_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  outlook_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.outlook_calendar_tokens enable row level security;

drop policy if exists "Users manage own outlook calendar tokens" on public.outlook_calendar_tokens;
create policy "Users manage own outlook calendar tokens" on public.outlook_calendar_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists on_outlook_calendar_tokens_updated on public.outlook_calendar_tokens;
create trigger on_outlook_calendar_tokens_updated
  before update on public.outlook_calendar_tokens
  for each row execute function public.handle_updated_at();

create table if not exists public.outlook_calendar_event_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  source_uid text not null,
  outlook_event_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, source_uid)
);

alter table public.outlook_calendar_event_map enable row level security;

drop policy if exists "Users manage own outlook event map" on public.outlook_calendar_event_map;
create policy "Users manage own outlook event map" on public.outlook_calendar_event_map
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists on_outlook_calendar_event_map_updated on public.outlook_calendar_event_map;
create trigger on_outlook_calendar_event_map_updated
  before update on public.outlook_calendar_event_map
  for each row execute function public.handle_updated_at();

create index if not exists idx_outlook_calendar_event_map_user_uid
  on public.outlook_calendar_event_map(user_id, source_uid);
