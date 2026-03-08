-- ============================================================
-- BPAN Platform — Follow-up fix: experiment_templates select policy
-- Fixes insert(...).select() failures by avoiding a self-query-based
-- visibility function for row-level SELECT evaluation.
-- ============================================================

drop policy if exists "Users can view accessible experiment templates" on public.experiment_templates;

create policy "Users can view accessible experiment templates"
  on public.experiment_templates for select
  using (
    (
      owner_type = 'user'
      and owner_user_id = auth.uid()
    )
    or (
      owner_type = 'lab'
      and owner_lab_id is not null
      and public.is_lab_member(owner_lab_id)
    )
  );
