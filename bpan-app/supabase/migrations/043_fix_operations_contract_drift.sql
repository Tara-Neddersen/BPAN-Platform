-- ============================================================
-- BPAN Platform — Follow-up fix: operations contract drift
-- Resolves:
-- 1) protocol object-link mismatch
-- 2) keeps operations link helper aligned with supported object types
-- ============================================================

delete from public.messages
where thread_id in (
  select mt.id
  from public.message_threads mt
  where mt.linked_object_type = 'protocol'
);

delete from public.message_threads
where linked_object_type = 'protocol';

delete from public.task_links
where linked_object_type = 'protocol';

alter table public.message_threads
  drop constraint if exists message_threads_linked_object_type_check;

alter table public.task_links
  drop constraint if exists task_links_linked_object_type_check;

alter table public.message_threads
  add constraint message_threads_linked_object_type_check
  check (
    linked_object_type in (
      'experiment_template',
      'experiment_run',
      'lab_reagent',
      'lab_reagent_stock_event',
      'lab_equipment',
      'lab_equipment_booking',
      'task'
    )
  );

alter table public.task_links
  add constraint task_links_linked_object_type_check
  check (
    linked_object_type in (
      'experiment_template',
      'experiment_run',
      'lab_reagent',
      'lab_reagent_stock_event',
      'lab_equipment',
      'lab_equipment_booking',
      'task'
    )
  );

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
