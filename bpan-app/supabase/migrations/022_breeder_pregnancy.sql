-- Add pregnancy tracking columns to breeder_cages
ALTER TABLE public.breeder_cages
  ADD COLUMN IF NOT EXISTS is_pregnant boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pregnancy_start_date date,
  ADD COLUMN IF NOT EXISTS expected_birth_date date,
  ADD COLUMN IF NOT EXISTS last_check_date date,
  ADD COLUMN IF NOT EXISTS check_interval_days int DEFAULT 7;

