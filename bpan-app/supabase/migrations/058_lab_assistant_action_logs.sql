-- BPAN Platform — Labs assistant action audit trail

create table if not exists public.lab_assistant_action_logs (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action_kind text not null,
  action_payload jsonb not null default '{}'::jsonb,
  outcome text not null check (outcome in ('planned', 'confirmed', 'executed', 'denied', 'failed', 'cancelled')),
  outcome_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_assistant_action_logs_lab_created_idx
  on public.lab_assistant_action_logs (lab_id, created_at desc);

create index if not exists lab_assistant_action_logs_actor_created_idx
  on public.lab_assistant_action_logs (actor_user_id, created_at desc);

alter table public.lab_assistant_action_logs enable row level security;

drop policy if exists "Lab members can view assistant action logs" on public.lab_assistant_action_logs;
create policy "Lab members can view assistant action logs"
  on public.lab_assistant_action_logs for select
  using (
    exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_assistant_action_logs.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );

drop policy if exists "Lab members can insert assistant action logs" on public.lab_assistant_action_logs;
create policy "Lab members can insert assistant action logs"
  on public.lab_assistant_action_logs for insert
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1
      from public.lab_members lm
      where lm.lab_id = lab_assistant_action_logs.lab_id
        and lm.user_id = auth.uid()
        and lm.is_active = true
    )
  );
