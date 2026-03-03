ALTER TABLE public.housing_cages
  ADD COLUMN IF NOT EXISTS cage_sex text DEFAULT 'female';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'housing_cages_cage_sex_check'
  ) THEN
    ALTER TABLE public.housing_cages
      ADD CONSTRAINT housing_cages_cage_sex_check
      CHECK (cage_sex IN ('female', 'male'));
  END IF;
END $$;
