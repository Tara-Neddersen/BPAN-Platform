-- ============================================================
-- BPAN Platform — Unified Tasks / To-Do System
-- Aggregates meeting action items, experiment deadlines,
-- cage changes, and custom tasks into one place.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  due_date date,
  due_time time,                          -- optional time of day
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  -- Source linking: where did this task come from?
  source_type text CHECK (source_type IN ('manual', 'meeting_action', 'experiment', 'cage_change', 'animal_care', 'reminder')),
  source_id text,                         -- ID of the meeting / experiment / etc
  source_label text,                      -- human-readable "Meeting: Weekly check-in" etc
  -- Recurrence
  is_recurring boolean DEFAULT false,
  recurrence_rule text,                   -- e.g. 'every_2_weeks', 'daily', 'weekly'
  -- Metadata
  tags text[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

