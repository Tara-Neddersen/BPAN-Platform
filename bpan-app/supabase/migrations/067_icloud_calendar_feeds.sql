create table if not exists public.icloud_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  label text not null,
  feed_url text not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_icloud_calendar_feeds_user
  on public.icloud_calendar_feeds(user_id, created_at desc);

alter table public.icloud_calendar_feeds enable row level security;

drop policy if exists "Users manage own iCloud calendar feeds" on public.icloud_calendar_feeds;
create policy "Users manage own iCloud calendar feeds"
  on public.icloud_calendar_feeds
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists on_icloud_calendar_feeds_updated on public.icloud_calendar_feeds;
create trigger on_icloud_calendar_feeds_updated
  before update on public.icloud_calendar_feeds
  for each row execute function public.handle_updated_at();
