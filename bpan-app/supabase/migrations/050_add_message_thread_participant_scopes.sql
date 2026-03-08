-- ============================================================
-- BPAN Platform — Private lab chat participant scopes
-- Adds participant-scoped message threads and participant membership.
-- ============================================================

alter table public.message_threads
  add column if not exists recipient_scope text not null default 'lab';

alter table public.message_threads
  drop constraint if exists message_threads_recipient_scope_check;

alter table public.message_threads
  add constraint message_threads_recipient_scope_check
  check (recipient_scope in ('lab', 'participants'));

alter table public.message_threads
  drop constraint if exists message_threads_participant_scope_context_check;

alter table public.message_threads
  add constraint message_threads_participant_scope_context_check
  check (
    recipient_scope <> 'participants'
    or (
      lab_id is not null
      and owner_user_id is null
    )
  );

create table if not exists public.message_thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index if not exists message_thread_participants_thread_idx
  on public.message_thread_participants (thread_id);
create index if not exists message_thread_participants_user_idx
  on public.message_thread_participants (user_id);

create or replace function public.can_view_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_threads mt
    where mt.id = target_thread_id
      and public.can_access_operations_linked_object(mt.linked_object_type, mt.linked_object_id)
      and (
        (
          mt.owner_user_id is not null
          and mt.owner_user_id = auth.uid()
          and mt.lab_id is null
        )
        or (
          mt.lab_id is not null
          and mt.owner_user_id is null
          and (
            (
              mt.recipient_scope = 'lab'
              and public.is_lab_member(mt.lab_id)
            )
            or (
              mt.recipient_scope = 'participants'
              and (
                exists (
                  select 1
                  from public.message_thread_participants mtp
                  where mtp.thread_id = mt.id
                    and mtp.user_id = auth.uid()
                )
                or (
                  mt.created_by = auth.uid()
                  and not exists (
                    select 1
                    from public.message_thread_participants mtp_bootstrap
                    where mtp_bootstrap.thread_id = mt.id
                  )
                )
              )
            )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_threads mt
    where mt.id = target_thread_id
      and public.can_access_operations_linked_object(mt.linked_object_type, mt.linked_object_id)
      and (
        (
          mt.owner_user_id is not null
          and mt.owner_user_id = auth.uid()
          and mt.lab_id is null
        )
        or (
          mt.lab_id is not null
          and mt.owner_user_id is null
          and (
            (
              mt.recipient_scope = 'lab'
              and (
                mt.created_by = auth.uid()
                or public.has_lab_role(mt.lab_id, array['manager', 'admin'])
              )
            )
            or (
              mt.recipient_scope = 'participants'
              and (
                exists (
                  select 1
                  from public.message_thread_participants mtp
                  where mtp.thread_id = mt.id
                    and mtp.user_id = auth.uid()
                )
                or (
                  mt.created_by = auth.uid()
                  and not exists (
                    select 1
                    from public.message_thread_participants mtp_bootstrap
                    where mtp_bootstrap.thread_id = mt.id
                  )
                )
              )
            )
          )
        )
      )
  );
$$;

drop policy if exists "Users can view accessible message threads" on public.message_threads;

create policy "Users can view accessible message threads"
  on public.message_threads for select
  using (
    public.can_access_operations_linked_object(linked_object_type, linked_object_id)
    and (
      (
        owner_user_id is not null
        and owner_user_id = auth.uid()
        and lab_id is null
      )
      or (
        lab_id is not null
        and owner_user_id is null
        and (
          (
            recipient_scope = 'lab'
            and public.is_lab_member(lab_id)
          )
          or (
            recipient_scope = 'participants'
            and (
              exists (
                select 1
                from public.message_thread_participants mtp
                where mtp.thread_id = id
                  and mtp.user_id = auth.uid()
              )
              or (
                created_by = auth.uid()
                and not exists (
                  select 1
                  from public.message_thread_participants mtp_bootstrap
                  where mtp_bootstrap.thread_id = id
                )
              )
            )
          )
        )
      )
    )
  );

drop policy if exists "Users can update manageable message threads" on public.message_threads;

create policy "Users can update manageable message threads"
  on public.message_threads for update
  using (public.can_manage_message_thread(id))
  with check (
    public.can_manage_message_thread(id)
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
    and (
      (owner_user_id = auth.uid() and lab_id is null)
      or (owner_user_id is null and lab_id is not null)
    )
  );

alter table public.message_thread_participants enable row level security;

drop policy if exists "Users can view participants for visible threads" on public.message_thread_participants;
create policy "Users can view participants for visible threads"
  on public.message_thread_participants for select
  using (public.can_view_message_thread(thread_id));

drop policy if exists "Creators and lab managers can add participants" on public.message_thread_participants;
create policy "Creators and lab managers can add participants"
  on public.message_thread_participants for insert
  with check (
    exists (
      select 1
      from public.message_threads mt
      where mt.id = thread_id
        and mt.recipient_scope = 'participants'
        and mt.lab_id is not null
        and (
          mt.created_by = auth.uid()
          or public.has_lab_role(mt.lab_id, array['manager', 'admin'])
        )
        and public.is_lab_member(mt.lab_id)
    )
    and exists (
      select 1
      from public.message_threads mt
      join public.lab_members lm
        on lm.lab_id = mt.lab_id
       and lm.user_id = message_thread_participants.user_id
       and lm.is_active = true
      where mt.id = thread_id
    )
    and (added_by is null or added_by = auth.uid())
  );

drop policy if exists "Creators and lab managers can remove participants" on public.message_thread_participants;
create policy "Creators and lab managers can remove participants"
  on public.message_thread_participants for delete
  using (
    exists (
      select 1
      from public.message_threads mt
      where mt.id = thread_id
        and mt.recipient_scope = 'participants'
        and mt.lab_id is not null
        and (
          mt.created_by = auth.uid()
          or public.has_lab_role(mt.lab_id, array['manager', 'admin'])
        )
    )
  );

create or replace trigger on_message_thread_participants_updated
  before update on public.message_thread_participants
  for each row execute function public.handle_updated_at();
