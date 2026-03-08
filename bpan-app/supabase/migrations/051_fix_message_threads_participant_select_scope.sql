-- ============================================================
-- BPAN Platform — Fix participant-scoped message_threads SELECT RLS
-- Aligns table SELECT policy with can_view_message_thread() behavior.
-- ============================================================

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
