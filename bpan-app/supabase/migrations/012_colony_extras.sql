-- ============================================================
-- BPAN Platform — Colony Extras: Meeting Notes + Cage Changes
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Meeting Notes — take notes during advisor / lab meetings
CREATE TABLE IF NOT EXISTS public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  attendees text[] DEFAULT '{}',       -- e.g., {'Dr. Smith', 'Lab'}
  content text NOT NULL DEFAULT '',     -- the full meeting notes
  action_items jsonb DEFAULT '[]',     -- [{text, done, due_date?}]
  ai_summary text,                      -- optional AI summary
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Cage Changes — bi-weekly cage change tracking
CREATE TABLE IF NOT EXISTS public.cage_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  scheduled_date date NOT NULL,
  completed_date date,
  is_completed boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 3. RLS
ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cage_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meeting notes" ON public.meeting_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own cage changes" ON public.cage_changes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Triggers
CREATE OR REPLACE TRIGGER on_meeting_notes_updated
  BEFORE UPDATE ON public.meeting_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

