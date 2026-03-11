-- BPAN Platform — Efficient unread notification count for shell layout

create or replace function public.count_unread_notification_tasks(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.tasks t
  where t.user_id = p_user_id
    and t.status not in ('skipped', 'completed')
    and (
      t.source_type = 'reminder'
      or exists (
        select 1
        from unnest(coalesce(t.tags, '{}'::text[])) as tag
        where tag in (
          'automation',
          'notification',
          'protocol_change',
          'low_stock',
          'booking_conflict',
          'template_workflow',
          'ai_assist',
          'ops_update'
        )
      )
    )
    and not ('notification_read' = any(coalesce(t.tags, '{}'::text[])));
$$;

grant execute on function public.count_unread_notification_tasks(uuid) to authenticated;
