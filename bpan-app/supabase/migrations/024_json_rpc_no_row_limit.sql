-- ============================================================
-- JSON-returning RPC functions — truly bypass PostgREST row limit
-- SETOF/TABLE returns are still subject to max-rows (1000).
-- Returning a single json scalar avoids this entirely.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Fetch ALL animal experiments as JSON array (no row limit)
CREATE OR REPLACE FUNCTION get_all_animal_experiments_json(p_user_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(ae)), '[]'::json)
  FROM (
    SELECT * FROM animal_experiments WHERE user_id = p_user_id ORDER BY scheduled_date
  ) ae;
$$;

-- Fetch ALL animals as JSON array (no row limit)
CREATE OR REPLACE FUNCTION get_all_animals_json(p_user_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(a)), '[]'::json)
  FROM (
    SELECT * FROM animals WHERE user_id = p_user_id ORDER BY identifier
  ) a;
$$;

-- Fetch ALL colony results as JSON array (no row limit)
CREATE OR REPLACE FUNCTION get_all_colony_results_json(p_user_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(cr)), '[]'::json)
  FROM (
    SELECT * FROM colony_results WHERE user_id = p_user_id ORDER BY created_at
  ) cr;
$$;

-- Fetch ALL cage changes as JSON array (no row limit)
CREATE OR REPLACE FUNCTION get_all_cage_changes_json(p_user_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(cc)), '[]'::json)
  FROM (
    SELECT * FROM cage_changes WHERE user_id = p_user_id ORDER BY scheduled_date
  ) cc;
$$;

-- Fetch cohort experiment summaries as JSON array (no row limit)
CREATE OR REPLACE FUNCTION get_cohort_experiments_json(p_user_id uuid, p_animal_ids uuid[])
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', ae.id,
    'animal_id', ae.animal_id,
    'experiment_type', ae.experiment_type,
    'timepoint_age_days', ae.timepoint_age_days
  )), '[]'::json)
  FROM animal_experiments ae
  WHERE ae.user_id = p_user_id
    AND ae.animal_id = ANY(p_animal_ids);
$$;

-- Fetch experiment IDs for deletion as JSON array (no row limit)
CREATE OR REPLACE FUNCTION get_experiment_ids_for_delete_json(
  p_user_id uuid,
  p_animal_ids uuid[],
  p_timepoint_ages int[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(json_build_object('id', ae.id)), '[]'::json)
  FROM animal_experiments ae
  WHERE ae.user_id = p_user_id
    AND ae.animal_id = ANY(p_animal_ids)
    AND (p_timepoint_ages IS NULL OR ae.timepoint_age_days = ANY(p_timepoint_ages))
    AND (p_statuses IS NULL OR ae.status = ANY(p_statuses));
$$;

