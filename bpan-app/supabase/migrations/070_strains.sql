-- ============================================================
-- 070_strains.sql — Top-level "strain" grouping (BPAN, SynGAP, ...)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor).
--
-- ADDITIVE + NON-DESTRUCTIVE: creates a new `strains` table and adds a
-- nullable `strain_id` to cohorts / breeder_cages / housing_cages, then
-- backfills every existing record to a per-user default strain named "BPAN"
-- so nothing disappears. No columns are dropped; the legacy free-text
-- breeder_cages.strain column is left untouched.
-- ============================================================

-- 1. Strains table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,                 -- e.g., "BPAN", "SynGAP"
  description text,
  color text,                         -- optional UI accent (hex), nullable
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.strains ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'strains'
      AND policyname = 'Users manage own strains'
  ) THEN
    CREATE POLICY "Users manage own strains" ON public.strains
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_strains_user ON public.strains(user_id);

-- 2. strain_id on the strain-scoped tables (nullable, set null on delete) -
ALTER TABLE public.cohorts        ADD COLUMN IF NOT EXISTS strain_id uuid REFERENCES public.strains(id) ON DELETE SET NULL;
ALTER TABLE public.breeder_cages  ADD COLUMN IF NOT EXISTS strain_id uuid REFERENCES public.strains(id) ON DELETE SET NULL;
ALTER TABLE public.housing_cages  ADD COLUMN IF NOT EXISTS strain_id uuid REFERENCES public.strains(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cohorts_strain        ON public.cohorts(strain_id);
CREATE INDEX IF NOT EXISTS idx_breeder_cages_strain  ON public.breeder_cages(strain_id);
CREATE INDEX IF NOT EXISTS idx_housing_cages_strain  ON public.housing_cages(strain_id);

-- 3. Backfill: give every user with colony data a default "BPAN" strain
--    and point existing records at it, so the app shows everything under
--    a real strain from day one. Re-runnable (ON CONFLICT / IS NULL guards).
INSERT INTO public.strains (user_id, name)
SELECT DISTINCT user_id, 'BPAN' FROM public.cohorts
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.strains (user_id, name)
SELECT DISTINCT user_id, 'BPAN' FROM public.breeder_cages
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.strains (user_id, name)
SELECT DISTINCT user_id, 'BPAN' FROM public.housing_cages
ON CONFLICT (user_id, name) DO NOTHING;

UPDATE public.cohorts c SET strain_id = s.id
  FROM public.strains s
  WHERE s.user_id = c.user_id AND s.name = 'BPAN' AND c.strain_id IS NULL;

UPDATE public.breeder_cages b SET strain_id = s.id
  FROM public.strains s
  WHERE s.user_id = b.user_id AND s.name = 'BPAN' AND b.strain_id IS NULL;

UPDATE public.housing_cages h SET strain_id = s.id
  FROM public.strains s
  WHERE s.user_id = h.user_id AND s.name = 'BPAN' AND h.strain_id IS NULL;

-- After running this, tell the agent "strains migration applied" and it will
-- ship the strain switcher + scoping UI (animals inherit their strain via cohort).
