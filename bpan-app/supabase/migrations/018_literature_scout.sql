-- ============================================================
-- BPAN Platform — AI Literature Scout
-- Auto-discovers papers, AI reads them, presents findings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scout_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pmid text NOT NULL,
  title text NOT NULL,
  authors text[] DEFAULT '{}',
  journal text,
  pub_date text,
  abstract text,
  doi text,
  -- AI-generated analysis
  ai_summary text,                    -- 2-3 sentence summary of what they found
  ai_relevance text,                  -- why this matters for the user's research
  ai_ideas text,                      -- brainstorm: what the user could do based on this
  relevance_score int DEFAULT 50,     -- 0-100 how relevant AI thinks this is
  -- User action
  status text DEFAULT 'new' CHECK (status IN ('new', 'saved', 'skipped', 'starred')),
  user_notes text,                    -- user can add their own notes
  -- Search context
  matched_keyword text,               -- which watchlist keyword found this
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.scout_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own scout findings" ON public.scout_findings;
CREATE POLICY "Users manage own scout findings" ON public.scout_findings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_scout_findings_updated BEFORE UPDATE ON public.scout_findings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Track last scout run per keyword
CREATE TABLE IF NOT EXISTS public.scout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  keyword text NOT NULL,
  papers_found int DEFAULT 0,
  papers_analyzed int DEFAULT 0,
  last_run_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.scout_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own scout runs" ON public.scout_runs;
CREATE POLICY "Users manage own scout runs" ON public.scout_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

