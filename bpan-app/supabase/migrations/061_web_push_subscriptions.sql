-- BPAN Platform — Web push subscriptions for Home Screen app notifications

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, endpoint)
);

create index if not exists web_push_subscriptions_user_idx
  on public.web_push_subscriptions (user_id, updated_at desc);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users can view own web push subscriptions" on public.web_push_subscriptions;
create policy "Users can view own web push subscriptions"
  on public.web_push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own web push subscriptions" on public.web_push_subscriptions;
create policy "Users can insert own web push subscriptions"
  on public.web_push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own web push subscriptions" on public.web_push_subscriptions;
create policy "Users can update own web push subscriptions"
  on public.web_push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own web push subscriptions" on public.web_push_subscriptions;
create policy "Users can delete own web push subscriptions"
  on public.web_push_subscriptions for delete
  using (auth.uid() = user_id);

drop trigger if exists on_web_push_subscriptions_updated on public.web_push_subscriptions;
create trigger on_web_push_subscriptions_updated
  before update on public.web_push_subscriptions
  for each row execute function public.handle_updated_at();
