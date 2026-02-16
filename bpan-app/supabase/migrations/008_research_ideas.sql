-- ============================================================
-- BPAN Platform — Research Ideas Board
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Research ideas — each idea is a thread to explore
CREATE TABLE IF NOT EXISTS public.research_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  source text DEFAULT 'manual',
  status text DEFAULT 'exploring' CHECK (status IN ('exploring', 'promising', 'dead_end', 'incorporated')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  tags text[] DEFAULT '{}',
  linked_paper_ids uuid[] DEFAULT '{}',
  linked_note_ids uuid[] DEFAULT '{}',
  linked_hypothesis_id uuid REFERENCES public.hypotheses(id) ON DELETE SET NULL,
  aim text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Idea entries — log of findings, thoughts, and observations
CREATE TABLE IF NOT EXISTS public.idea_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid REFERENCES public.research_ideas(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  entry_type text DEFAULT 'finding' CHECK (entry_type IN ('finding', 'question', 'thought', 'contradiction', 'next_step')),
  source_paper_id uuid REFERENCES public.saved_papers(id) ON DELETE SET NULL,
  source_note_id uuid REFERENCES public.notes(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. RLS policies
ALTER TABLE public.research_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ideas"
  ON public.research_ideas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ideas"
  ON public.research_ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ideas"
  ON public.research_ideas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ideas"
  ON public.research_ideas FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own idea entries"
  ON public.idea_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own idea entries"
  ON public.idea_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own idea entries"
  ON public.idea_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own idea entries"
  ON public.idea_entries FOR DELETE USING (auth.uid() = user_id);

-- 4. Auto-update trigger
CREATE OR REPLACE TRIGGER on_idea_updated
  BEFORE UPDATE ON public.research_ideas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

