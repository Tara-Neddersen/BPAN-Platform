create table if not exists public.google_sheets_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  google_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_sheets_tokens enable row level security;

drop policy if exists "Users manage own google sheets tokens" on public.google_sheets_tokens;
create policy "Users manage own google sheets tokens"
  on public.google_sheets_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists on_google_sheets_tokens_updated on public.google_sheets_tokens;
create trigger on_google_sheets_tokens_updated
  before update on public.google_sheets_tokens
  for each row execute function public.handle_updated_at();

create table if not exists public.google_sheet_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dataset_id uuid references public.datasets(id) on delete set null,
  experiment_id uuid references public.experiments(id) on delete set null,
  experiment_run_id uuid references public.experiment_runs(id) on delete set null,
  sheet_id text not null,
  gid text,
  sheet_title text,
  sheet_url text not null,
  name text not null,
  target text not null default 'auto' check (target in ('auto', 'dataset', 'colony_results')),
  auto_sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  last_row_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_google_sheet_links_user
  on public.google_sheet_links(user_id, created_at desc);

alter table public.google_sheet_links enable row level security;

drop policy if exists "Users manage own google sheet links" on public.google_sheet_links;
create policy "Users manage own google sheet links"
  on public.google_sheet_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists on_google_sheet_links_updated on public.google_sheet_links;
create trigger on_google_sheet_links_updated
  before update on public.google_sheet_links
  for each row execute function public.handle_updated_at();
