-- ============================================================
-- BPAN Platform — Labs chat contract: lab-root threads + read state
-- Adds support for linked_object_type='lab' and per-user message read state.
-- ============================================================

alter table public.message_threads
  drop constraint if exists message_threads_linked_object_type_check;

alter table public.message_threads
  add constraint message_threads_linked_object_type_check
  check (
    linked_object_type in (
      'experiment_template',
      'experiment_run',
      'lab',
      'lab_reagent',
      'lab_reagent_stock_event',
      'lab_equipment',
      'lab_equipment_booking',
      'task'
    )
  );

alter table public.message_threads
  drop constraint if exists message_threads_context_check;

alter table public.message_threads
  add constraint message_threads_context_check
  check (
    (
      lab_id is not null
      and owner_user_id is null
      and (
        linked_object_type <> 'lab'
        or linked_object_id = lab_id
      )
    )
    or (
      lab_id is null
      and owner_user_id is not null
      and linked_object_type <> 'lab'
    )
  );

create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_reads_user_message_idx
  on public.message_reads (user_id, message_id);
create index if not exists message_reads_message_user_idx
  on public.message_reads (message_id, user_id);

create or replace function public.can_access_operations_linked_object(target_object_type text, target_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case target_object_type
    when 'experiment_template' then public.can_view_experiment_template(target_object_id)
    when 'experiment_run' then public.can_view_experiment_run(target_object_id)
    when 'lab' then public.is_lab_member(target_object_id)
    when 'lab_reagent' then public.can_view_lab_reagent(target_object_id)
    when 'lab_reagent_stock_event' then exists (
      select 1
      from public.lab_reagent_stock_events lrse
      join public.lab_reagents lr on lr.id = lrse.lab_reagent_id
      where lrse.id = target_object_id
        and public.is_lab_member(lr.lab_id)
    )
    when 'lab_equipment' then public.can_view_lab_equipment(target_object_id)
    when 'lab_equipment_booking' then public.can_view_lab_equipment_booking(target_object_id)
    when 'task' then public.can_access_task(target_object_id)
    else false
  end;
$$;

alter table public.message_reads enable row level security;

create policy "Users can view own message read states"
  on public.message_reads for select
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_view_message_thread(m.thread_id)
    )
  );

create policy "Users can create own message read states"
  on public.message_reads for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_view_message_thread(m.thread_id)
    )
  );

create policy "Users can update own message read states"
  on public.message_reads for update
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_view_message_thread(m.thread_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_view_message_thread(m.thread_id)
    )
  );

create policy "Users can delete own message read states"
  on public.message_reads for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_view_message_thread(m.thread_id)
    )
  );

create or replace trigger on_message_reads_updated
  before update on public.message_reads
  for each row execute function public.handle_updated_at();
