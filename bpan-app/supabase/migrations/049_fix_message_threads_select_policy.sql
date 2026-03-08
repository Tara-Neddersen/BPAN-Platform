-- ============================================================
-- BPAN Platform — Follow-up fix: message_threads select policy
-- Fixes insert(...).select() failures for lab-root thread creation by
-- avoiding helper self-query evaluation in SELECT policy.
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
        and public.is_lab_member(lab_id)
      )
    )
  );
