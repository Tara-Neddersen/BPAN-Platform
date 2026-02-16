-- ============================================================
-- BPAN Platform — Mouse Colony Manager + PI Portal
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Breeder Cages
CREATE TABLE IF NOT EXISTS public.breeder_cages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,            -- e.g., "Breeder Cage A"
  strain text,                   -- e.g., "BPAN / ATP13A2"
  location text,                 -- e.g., "Room 204, Rack 3"
  breeding_start date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Cohorts (litters / offspring groups)
CREATE TABLE IF NOT EXISTS public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  breeder_cage_id uuid REFERENCES public.breeder_cages(id) ON DELETE SET NULL,
  name text NOT NULL,            -- e.g., "BPAN 1", "BPAN 2"
  birth_date date NOT NULL,
  litter_size int,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Individual Animals
CREATE TABLE IF NOT EXISTS public.animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  identifier text NOT NULL,      -- e.g., "BPAN1-HM-1"
  sex text NOT NULL CHECK (sex IN ('male', 'female')),
  genotype text NOT NULL CHECK (genotype IN ('hemi', 'wt', 'het')),
  ear_tag text,
  birth_date date NOT NULL,
  cage_number text,              -- current housing cage
  status text DEFAULT 'active' CHECK (status IN ('active', 'sacrificed', 'transferred', 'deceased')),
  eeg_implanted boolean DEFAULT false,
  eeg_implant_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Experiment Timepoints (user-editable schedule template)
CREATE TABLE IF NOT EXISTS public.colony_timepoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,            -- e.g., "60-day Behavioral"
  age_days int NOT NULL,         -- 60, 120, 180
  experiments text[] DEFAULT '{}', -- e.g., {'y_maze','ldb','marble','nesting','rotarod','catwalk','blood_draw'}
  handling_days_before int DEFAULT 3,  -- start handling X days before
  duration_days int DEFAULT 21,  -- total experiment window
  includes_eeg_implant boolean DEFAULT false,
  eeg_recovery_days int DEFAULT 14,    -- days to wait after implant
  eeg_recording_days int DEFAULT 3,    -- how many days of recording
  sort_order int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Animal Experiments (per-animal, per-experiment records)
CREATE TABLE IF NOT EXISTS public.animal_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid REFERENCES public.animals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  experiment_type text NOT NULL,  -- 'y_maze','ldb','marble','nesting','rotarod','catwalk','blood_draw','eeg_implant','eeg_recording','handling'
  timepoint_age_days int,         -- which timepoint (60, 120, 180)
  scheduled_date date,
  completed_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'skipped')),
  results_drive_url text,         -- Google Drive link to results file
  results_notes text,             -- quick notes about the result
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. PI / Advisor Portal Access (persistent live view)
CREATE TABLE IF NOT EXISTS public.advisor_portal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  advisor_name text NOT NULL,     -- e.g., "Dr. Smith"
  advisor_email text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  can_see text[] DEFAULT '{experiments,animals,results,timeline}',
  last_viewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 7. RLS
ALTER TABLE public.breeder_cages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colony_timepoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_portal ENABLE ROW LEVEL SECURITY;

-- breeder_cages policies
CREATE POLICY "Users manage own breeder cages" ON public.breeder_cages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- cohorts policies
CREATE POLICY "Users manage own cohorts" ON public.cohorts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- animals policies
CREATE POLICY "Users manage own animals" ON public.animals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- colony_timepoints policies
CREATE POLICY "Users manage own timepoints" ON public.colony_timepoints FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- animal_experiments policies
CREATE POLICY "Users manage own animal experiments" ON public.animal_experiments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- advisor_portal policies
CREATE POLICY "Users manage own advisor portal" ON public.advisor_portal FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Triggers
CREATE OR REPLACE TRIGGER on_breeder_cages_updated BEFORE UPDATE ON public.breeder_cages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER on_cohorts_updated BEFORE UPDATE ON public.cohorts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER on_animals_updated BEFORE UPDATE ON public.animals FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER on_colony_timepoints_updated BEFORE UPDATE ON public.colony_timepoints FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER on_animal_experiments_updated BEFORE UPDATE ON public.animal_experiments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

