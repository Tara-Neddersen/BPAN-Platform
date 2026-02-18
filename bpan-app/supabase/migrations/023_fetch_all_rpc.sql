-- ============================================================
-- RPC functions to bypass PostgREST 1000-row limit
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Fetch ALL animal experiments for a user (no row limit)
CREATE OR REPLACE FUNCTION get_all_animal_experiments(p_user_id uuid)
RETURNS SETOF animal_experiments
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM animal_experiments WHERE user_id = p_user_id ORDER BY scheduled_date;
$$;

-- Fetch ALL animals for a user (no row limit)
CREATE OR REPLACE FUNCTION get_all_animals(p_user_id uuid)
RETURNS SETOF animals
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM animals WHERE user_id = p_user_id ORDER BY identifier;
$$;

-- Fetch ALL colony results for a user (no row limit)
CREATE OR REPLACE FUNCTION get_all_colony_results(p_user_id uuid)
RETURNS SETOF colony_results
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM colony_results WHERE user_id = p_user_id ORDER BY created_at;
$$;

-- Fetch ALL cage changes for a user (no row limit)
CREATE OR REPLACE FUNCTION get_all_cage_changes(p_user_id uuid)
RETURNS SETOF cage_changes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM cage_changes WHERE user_id = p_user_id ORDER BY scheduled_date;
$$;

-- Fetch experiment summaries for a cohort (for schedule/delete logic)
CREATE OR REPLACE FUNCTION get_cohort_experiments(p_user_id uuid, p_animal_ids uuid[])
RETURNS TABLE(id uuid, animal_id uuid, experiment_type text, timepoint_age_days int)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ae.id, ae.animal_id, ae.experiment_type, ae.timepoint_age_days
  FROM animal_experiments ae
  WHERE ae.user_id = p_user_id
    AND ae.animal_id = ANY(p_animal_ids);
$$;

-- Fetch experiment IDs for deletion (with optional filters)
CREATE OR REPLACE FUNCTION get_experiment_ids_for_delete(
  p_user_id uuid,
  p_animal_ids uuid[],
  p_timepoint_ages int[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ae.id
  FROM animal_experiments ae
  WHERE ae.user_id = p_user_id
    AND ae.animal_id = ANY(p_animal_ids)
    AND (p_timepoint_ages IS NULL OR ae.timepoint_age_days = ANY(p_timepoint_ages))
    AND (p_statuses IS NULL OR ae.status = ANY(p_statuses));
$$;

