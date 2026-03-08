-- ============================================================
-- BPAN Platform — Follow-up fix: experiment_templates insert RLS
-- Fixes template create failures from authenticated user flows by
-- allowing created_by to be omitted while preserving ownership parity.
-- ============================================================

drop policy if exists "Users can create experiment templates" on public.experiment_templates;

create policy "Users can create experiment templates"
  on public.experiment_templates for insert
  with check (
    (
      owner_type = 'user'
      and owner_user_id = auth.uid()
      and owner_lab_id is null
      and visibility = 'private'
      and (created_by is null or created_by = auth.uid())
    )
    or (
      owner_type = 'lab'
      and owner_user_id is null
      and owner_lab_id is not null
      and visibility = 'lab_shared'
      and public.has_lab_role(owner_lab_id, array['manager', 'admin'])
      and (created_by is null or created_by = auth.uid())
    )
  );
