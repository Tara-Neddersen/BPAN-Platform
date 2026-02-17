-- ============================================================
-- BPAN Platform — Unified AI Memory
-- Persistent memory that ALL AI agents share
-- ============================================================

-- Core memory table: stores individual facts/learnings/preferences
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- What kind of memory this is
  category text NOT NULL CHECK (category IN (
    'research_fact',        -- Key findings from papers, experiments, discussions
    'hypothesis',           -- Confirmed/rejected hypotheses & why
    'experiment_insight',   -- What worked, what didn't, methodology notes
    'preference',           -- How the user likes things done (writing style, experiment protocols)
    'meeting_decision',     -- Decisions made during advisor meetings
    'literature_pattern',   -- Recurring themes the AI noticed across papers
    'troubleshooting',      -- Solutions to problems encountered
    'goal',                 -- Short-term and long-term research goals
    'connection',           -- Links between papers, ideas, and experiments
    'important_date'        -- Deadlines, milestones, commitments
  )),
  
  content text NOT NULL,             -- The actual memory/fact (1-3 sentences)
  source text,                       -- Where this came from: "advisor_chat:uuid", "scout", "meeting:uuid", etc.
  confidence text DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high', 'confirmed')),
  
  -- Tags for retrieval
  tags text[] DEFAULT '{}',
  
  -- Auto-generated vs user-confirmed
  is_auto boolean DEFAULT true,      -- true = AI extracted this; false = user wrote/confirmed it
  is_pinned boolean DEFAULT false,   -- pinned memories always appear in context
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ai memory" ON public.ai_memory;
CREATE POLICY "Users manage own ai memory" ON public.ai_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_ai_memory_updated BEFORE UPDATE ON public.ai_memory FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Index for fast retrieval
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_category ON public.ai_memory(user_id, category);
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_pinned ON public.ai_memory(user_id, is_pinned) WHERE is_pinned = true;

