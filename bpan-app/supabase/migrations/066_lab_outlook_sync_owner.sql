alter table public.labs
  add column if not exists outlook_sync_owner_user_id uuid references public.profiles(id) on delete set null;

create index if not exists labs_outlook_sync_owner_idx
  on public.labs (outlook_sync_owner_user_id)
  where outlook_sync_owner_user_id is not null;
