ALTER TABLE public.breeder_cages
  ADD COLUMN IF NOT EXISTS female_1_birth_date date,
  ADD COLUMN IF NOT EXISTS female_2_birth_date date,
  ADD COLUMN IF NOT EXISTS female_3_birth_date date,
  ADD COLUMN IF NOT EXISTS male_birth_date date;
