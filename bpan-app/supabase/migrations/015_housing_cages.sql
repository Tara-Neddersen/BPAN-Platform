-- ============================================================
-- BPAN Platform — Housing Cages (where animals currently live)
-- Separate from breeder cages — these are experiment/housing cages
-- Max 5 mice per cage
-- ============================================================

CREATE TABLE IF NOT EXISTS public.housing_cages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cage_label text NOT NULL,           -- e.g., "HC-01", "Cage 12"
  location text,                      -- e.g., "Room 204, Rack 3, Shelf 2"
  max_occupancy int DEFAULT 5,        -- maximum mice allowed
  cage_type text DEFAULT 'standard',  -- 'standard', 'eeg', 'recovery', 'quarantine'
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.housing_cages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own housing cages" ON public.housing_cages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_housing_cages_updated BEFORE UPDATE ON public.housing_cages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add housing_cage_id to animals table (nullable FK)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'animals' AND column_name = 'housing_cage_id') THEN
    ALTER TABLE public.animals ADD COLUMN housing_cage_id uuid REFERENCES public.housing_cages(id) ON DELETE SET NULL;
  END IF;
END $$;

