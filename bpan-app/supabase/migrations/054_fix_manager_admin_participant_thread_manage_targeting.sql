-- ============================================================
-- BPAN Platform — Fix manager/admin participant-thread write targeting
-- Allows manager/admin manage paths to target participant-scoped
-- thread rows for UPDATE/DELETE without widening message visibility.
-- ============================================================

drop policy if exists "Managers can target participant threads for management" on public.message_threads;

create policy "Managers can target participant threads for management"
  on public.message_threads for select
  using (
    recipient_scope = 'participants'
    and lab_id is not null
    and owner_user_id is null
    and public.can_manage_message_thread(id)
    and public.has_lab_role(lab_id, array['manager', 'admin'])
  );
