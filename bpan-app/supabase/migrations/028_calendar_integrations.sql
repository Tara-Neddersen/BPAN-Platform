create table if not exists public.google_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  google_email text,
  calendar_id text not null default 'primary',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.google_calendar_tokens enable row level security;

drop policy if exists "Users manage own calendar tokens" on public.google_calendar_tokens;
create policy "Users manage own calendar tokens" on public.google_calendar_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists on_google_calendar_tokens_updated on public.google_calendar_tokens;
create trigger on_google_calendar_tokens_updated
  before update on public.google_calendar_tokens
  for each row execute function public.handle_updated_at();

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  token text not null unique default md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.calendar_feed_tokens enable row level security;

drop policy if exists "Users manage own calendar feed tokens" on public.calendar_feed_tokens;
create policy "Users manage own calendar feed tokens" on public.calendar_feed_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists on_calendar_feed_tokens_updated on public.calendar_feed_tokens;
create trigger on_calendar_feed_tokens_updated
  before update on public.calendar_feed_tokens
  for each row execute function public.handle_updated_at();
