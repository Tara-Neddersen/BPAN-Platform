-- ============================================================
-- BPAN Platform — Grace Period for experiment timepoints
-- If a timepoint is 60 days, experiments must finish by 60 + grace_period_days
-- Grace period is AFTER the timepoint only (no early start allowed)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colony_timepoints' AND column_name = 'grace_period_days') THEN
    ALTER TABLE public.colony_timepoints ADD COLUMN grace_period_days int DEFAULT 30;
  END IF;
END $$;

