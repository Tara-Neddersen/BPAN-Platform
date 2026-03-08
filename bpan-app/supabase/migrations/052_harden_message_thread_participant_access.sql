-- ============================================================
-- BPAN Platform — Hardening: participant-thread visibility/manage
-- 1) Participant-scope visibility now requires active lab membership
-- 2) Thread management is creator-or-manager/admin only
-- ============================================================

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
          and public.is_lab_member(mt.lab_id)
          and (
            (
              mt.recipient_scope = 'lab'
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
          and public.is_lab_member(mt.lab_id)
          and (
            mt.created_by = auth.uid()
            or public.has_lab_role(mt.lab_id, array['manager', 'admin'])
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
        and public.is_lab_member(lab_id)
        and (
          (
            recipient_scope = 'lab'
          )
          or (
            recipient_scope = 'participants'
            and (
              exists (
                select 1
                from public.message_thread_participants mtp
                where mtp.thread_id = message_threads.id
                  and mtp.user_id = auth.uid()
              )
              or (
                created_by = auth.uid()
                and not exists (
                  select 1
                  from public.message_thread_participants mtp_bootstrap
                  where mtp_bootstrap.thread_id = message_threads.id
                )
              )
            )
          )
        )
      )
    )
  );
