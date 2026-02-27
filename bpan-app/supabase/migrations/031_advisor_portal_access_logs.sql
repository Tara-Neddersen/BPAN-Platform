create table if not exists public.advisor_portal_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  portal_id uuid not null references public.advisor_portal(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists advisor_portal_access_logs_user_idx
  on public.advisor_portal_access_logs(user_id, viewed_at desc);

create index if not exists advisor_portal_access_logs_portal_idx
  on public.advisor_portal_access_logs(portal_id, viewed_at desc);

alter table public.advisor_portal_access_logs enable row level security;

do $$ begin
  create policy "Users can read own advisor portal access logs"
    on public.advisor_portal_access_logs
    for select
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can insert own advisor portal access logs"
    on public.advisor_portal_access_logs
    for insert
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can delete own advisor portal access logs"
    on public.advisor_portal_access_logs
    for delete
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;
