-- ============================================================
-- BPAN Platform — Google Drive Integration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Google Drive OAuth tokens — one row per user
CREATE TABLE IF NOT EXISTS public.google_drive_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  google_email text,                  -- which Google account they connected
  root_folder_id text,                -- BPAN Platform folder ID on their Drive
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.google_drive_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drive tokens" ON public.google_drive_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Trigger
CREATE OR REPLACE TRIGGER on_drive_tokens_updated
  BEFORE UPDATE ON public.google_drive_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

