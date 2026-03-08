-- ============================================================
-- BPAN Platform — Fix UUID aggregate in backfill_platform_sync
-- ============================================================

create or replace function public.backfill_platform_sync(dry_run boolean default true, sample_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_runs_missing_count integer := 0;
  v_runs_inserted_count integer := 0;
  v_runs_sample jsonb := '[]'::jsonb;

  v_datasets_candidates_count integer := 0;
  v_datasets_linkable_count integer := 0;
  v_datasets_ambiguous_count integer := 0;
  v_datasets_unmatched_count integer := 0;
  v_datasets_updated_count integer := 0;
  v_datasets_linked_sample jsonb := '[]'::jsonb;
  v_datasets_ambiguous_sample jsonb := '[]'::jsonb;
  v_datasets_unmatched_sample jsonb := '[]'::jsonb;

  v_snapshot_candidates_count integer := 0;
  v_snapshot_linkable_count integer := 0;
  v_snapshot_skipped_count integer := 0;
  v_snapshot_updated_count integer := 0;
  v_snapshot_linked_sample jsonb := '[]'::jsonb;
  v_snapshot_skipped_sample jsonb := '[]'::jsonb;
begin
  create temporary table tmp_run_candidates on commit drop as
  select
    e.id as legacy_experiment_id,
    e.user_id,
    e.title,
    e.description,
    e.protocol_id,
    e.notes,
    e.created_at,
    e.updated_at,
    case
      when e.status in ('planned', 'in_progress', 'completed', 'cancelled') then e.status
      else 'draft'
    end as mapped_status
  from public.experiments e
  left join public.experiment_runs er on er.legacy_experiment_id = e.id
  where er.id is null;

  select count(*) into v_runs_missing_count from tmp_run_candidates;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_runs_sample
  from (
    select legacy_experiment_id, user_id, title
    from tmp_run_candidates
    order by created_at asc
    limit greatest(sample_limit, 0)
  ) s;

  if not dry_run then
    insert into public.experiment_runs (
      legacy_experiment_id,
      owner_user_id,
      owner_lab_id,
      visibility,
      name,
      description,
      status,
      selected_protocol_id,
      notes,
      created_by,
      created_at,
      updated_at
    )
    select
      legacy_experiment_id,
      user_id,
      null,
      'private',
      title,
      description,
      mapped_status,
      protocol_id,
      notes,
      user_id,
      created_at,
      updated_at
    from tmp_run_candidates;

    get diagnostics v_runs_inserted_count = row_count;
  else
    v_runs_inserted_count := v_runs_missing_count;
  end if;

  create temporary table tmp_dataset_match_counts on commit drop as
  select
    d.id as dataset_id,
    d.experiment_id,
    count(er.id) as match_count,
    case
      when count(er.id) = 1 then (array_agg(er.id order by er.id))[1]
      else null
    end as matched_run_id
  from public.datasets d
  left join public.experiment_runs er on er.legacy_experiment_id = d.experiment_id
  where d.experiment_id is not null
    and d.experiment_run_id is null
  group by d.id, d.experiment_id;

  select count(*) into v_datasets_candidates_count from tmp_dataset_match_counts;
  select count(*) into v_datasets_linkable_count
  from tmp_dataset_match_counts
  where match_count = 1;
  select count(*) into v_datasets_ambiguous_count
  from tmp_dataset_match_counts
  where match_count > 1;
  select count(*) into v_datasets_unmatched_count
  from tmp_dataset_match_counts
  where match_count = 0;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_datasets_linked_sample
  from (
    select dataset_id, experiment_id, matched_run_id
    from tmp_dataset_match_counts
    where match_count = 1
    order by dataset_id
    limit greatest(sample_limit, 0)
  ) s;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_datasets_ambiguous_sample
  from (
    select dataset_id, experiment_id, match_count
    from tmp_dataset_match_counts
    where match_count > 1
    order by dataset_id
    limit greatest(sample_limit, 0)
  ) s;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_datasets_unmatched_sample
  from (
    select dataset_id, experiment_id
    from tmp_dataset_match_counts
    where match_count = 0
    order by dataset_id
    limit greatest(sample_limit, 0)
  ) s;

  if not dry_run then
    update public.datasets d
    set experiment_run_id = m.matched_run_id
    from tmp_dataset_match_counts m
    where d.id = m.dataset_id
      and m.match_count = 1
      and d.experiment_run_id is null;

    get diagnostics v_datasets_updated_count = row_count;
  else
    v_datasets_updated_count := v_datasets_linkable_count;
  end if;

  create temporary table tmp_snapshot_candidates on commit drop as
  with run_targets as (
    select
      er.id as run_id,
      er.result_schema_id as existing_schema_id,
      coalesce(
        er.result_schema_id,
        (
          select rs.id
          from public.result_schemas rs
          where rs.template_id = er.template_id
            and rs.is_active = true
          order by rs.version desc, rs.created_at desc
          limit 1
        )
      ) as target_schema_id
    from public.experiment_runs er
    where er.schema_snapshot = '[]'::jsonb
  )
  select
    rt.run_id,
    rt.target_schema_id,
    rt.existing_schema_id,
    (
      select jsonb_agg(
        jsonb_build_object(
          'key', c.key,
          'label', c.label,
          'column_type', c.column_type,
          'required', c.required,
          'default_value', c.default_value,
          'options', c.options,
          'unit', c.unit,
          'help_text', c.help_text,
          'group_key', c.group_key,
          'sort_order', c.sort_order,
          'is_system_default', c.is_system_default,
          'is_enabled', c.is_enabled
        )
        order by c.sort_order asc, c.key asc
      )
      from public.result_schema_columns c
      where c.schema_id = rt.target_schema_id
        and c.is_enabled = true
    ) as snapshot_json
  from run_targets rt;

  select count(*) into v_snapshot_candidates_count from tmp_snapshot_candidates;
  select count(*) into v_snapshot_linkable_count
  from tmp_snapshot_candidates
  where target_schema_id is not null
    and snapshot_json is not null
    and jsonb_array_length(snapshot_json) > 0;
  select count(*) into v_snapshot_skipped_count
  from tmp_snapshot_candidates
  where target_schema_id is null
    or snapshot_json is null
    or jsonb_array_length(snapshot_json) = 0;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_snapshot_linked_sample
  from (
    select run_id, target_schema_id, jsonb_array_length(snapshot_json) as column_count
    from tmp_snapshot_candidates
    where target_schema_id is not null
      and snapshot_json is not null
      and jsonb_array_length(snapshot_json) > 0
    order by run_id
    limit greatest(sample_limit, 0)
  ) s;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_snapshot_skipped_sample
  from (
    select
      run_id,
      target_schema_id,
      case
        when target_schema_id is null then 'missing_result_schema'
        when snapshot_json is null or jsonb_array_length(snapshot_json) = 0 then 'missing_enabled_schema_columns'
        else 'unknown'
      end as reason
    from tmp_snapshot_candidates
    where target_schema_id is null
      or snapshot_json is null
      or jsonb_array_length(snapshot_json) = 0
    order by run_id
    limit greatest(sample_limit, 0)
  ) s;

  if not dry_run then
    update public.experiment_runs er
    set
      schema_snapshot = sc.snapshot_json,
      result_schema_id = coalesce(er.result_schema_id, sc.target_schema_id)
    from tmp_snapshot_candidates sc
    where er.id = sc.run_id
      and er.schema_snapshot = '[]'::jsonb
      and sc.target_schema_id is not null
      and sc.snapshot_json is not null
      and jsonb_array_length(sc.snapshot_json) > 0;

    get diagnostics v_snapshot_updated_count = row_count;
  else
    v_snapshot_updated_count := v_snapshot_linkable_count;
  end if;

  return jsonb_build_object(
    'dry_run', dry_run,
    'sample_limit', greatest(sample_limit, 0),
    'experiments_to_runs', jsonb_build_object(
      'missing_legacy_runs', v_runs_missing_count,
      'linked_or_would_link', v_runs_inserted_count,
      'skipped', 0,
      'samples', v_runs_sample
    ),
    'datasets_to_runs', jsonb_build_object(
      'candidates', v_datasets_candidates_count,
      'linked_or_would_link', v_datasets_updated_count,
      'skipped_ambiguous', v_datasets_ambiguous_count,
      'skipped_unmatched', v_datasets_unmatched_count,
      'samples_linked', v_datasets_linked_sample,
      'samples_ambiguous', v_datasets_ambiguous_sample,
      'samples_unmatched', v_datasets_unmatched_sample
    ),
    'schema_snapshots', jsonb_build_object(
      'candidates', v_snapshot_candidates_count,
      'linked_or_would_link', v_snapshot_updated_count,
      'skipped', v_snapshot_skipped_count,
      'samples_linked', v_snapshot_linked_sample,
      'samples_skipped', v_snapshot_skipped_sample
    )
  );
end;
$$;
