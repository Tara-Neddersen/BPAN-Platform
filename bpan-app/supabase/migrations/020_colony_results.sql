-- 020: Colony Results — per-animal per-experiment per-timepoint result data
-- Uses JSONB for flexible measure storage (different metrics per experiment type)

CREATE TABLE IF NOT EXISTS public.colony_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  animal_id uuid REFERENCES public.animals(id) ON DELETE CASCADE NOT NULL,
  timepoint_age_days int NOT NULL,
  experiment_type text NOT NULL,
  measures jsonb DEFAULT '{}',
  notes text,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One result row per animal + timepoint + experiment combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_colony_results_unique
  ON public.colony_results(animal_id, timepoint_age_days, experiment_type);

CREATE INDEX IF NOT EXISTS idx_colony_results_user
  ON public.colony_results(user_id);

CREATE INDEX IF NOT EXISTS idx_colony_results_timepoint
  ON public.colony_results(user_id, timepoint_age_days, experiment_type);

ALTER TABLE public.colony_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own colony results" ON public.colony_results;
CREATE POLICY "Users manage own colony results" ON public.colony_results
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER on_colony_results_updated
  BEFORE UPDATE ON public.colony_results
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

