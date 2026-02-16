-- ============================================================
-- BPAN Platform — Colony Photo Gallery
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Colony Photos — experiment/lab photos for gallery display
CREATE TABLE IF NOT EXISTS public.colony_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,           -- Direct image URL or Google Drive share link
  caption text,                      -- e.g., "BPAN1 - Rotarod Day 7"
  animal_id uuid REFERENCES public.animals(id) ON DELETE SET NULL,
  experiment_type text,              -- e.g., 'rotarod', 'catwalk', etc.
  taken_date date,
  sort_order int DEFAULT 0,
  show_in_portal boolean DEFAULT true,  -- include in PI portal gallery
  created_at timestamptz DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.colony_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own colony photos" ON public.colony_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

