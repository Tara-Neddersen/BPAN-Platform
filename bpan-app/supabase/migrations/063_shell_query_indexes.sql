-- BPAN Platform — Safe index boosts for shell query paths

create index if not exists tasks_user_status_updated_idx
  on public.tasks (user_id, status, updated_at desc);

create index if not exists tasks_tags_gin_idx
  on public.tasks using gin (tags);

create index if not exists lab_members_user_active_joined_idx
  on public.lab_members (user_id, is_active, joined_at);
