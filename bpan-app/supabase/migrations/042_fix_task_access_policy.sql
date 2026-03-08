-- ============================================================
-- BPAN Platform — Follow-up fix: task access for lab-scoped links
-- Fixes the initial can_access_task() contract so tasks linked to
-- accessible shared objects are not treated as owner-only.
-- ============================================================

create or replace function public.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (
      select 1
      from public.tasks t
      where t.id = target_task_id
        and t.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.task_links tl
      where tl.task_id = target_task_id
        and tl.linked_object_type <> 'task'
        and public.can_access_operations_linked_object(tl.linked_object_type, tl.linked_object_id)
    )
  );
$$;
