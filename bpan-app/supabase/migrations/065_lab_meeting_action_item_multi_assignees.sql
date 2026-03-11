-- BPAN Platform — support multiple assignees per lab meeting action item

alter table public.lab_meeting_action_items
  add column if not exists responsible_member_ids uuid[] not null default '{}'::uuid[],
  add column if not exists responsible_labels text[] not null default '{}'::text[];

-- Backfill existing single-assignee data.
update public.lab_meeting_action_items
set responsible_member_ids = array[responsible_member_id]
where responsible_member_id is not null
  and coalesce(array_length(responsible_member_ids, 1), 0) = 0;

update public.lab_meeting_action_items
set responsible_labels = array[responsible_label]
where responsible_label is not null
  and btrim(responsible_label) <> ''
  and coalesce(array_length(responsible_labels, 1), 0) = 0;

create index if not exists lab_meeting_action_items_responsible_member_ids_gin
  on public.lab_meeting_action_items using gin (responsible_member_ids);
