-- ============================================================
-- BPAN Platform — ALL MIGRATIONS (safe re-run version)
-- Uses DROP POLICY IF EXISTS before CREATE to avoid conflicts
-- Paste this ENTIRE script into Supabase SQL Editor and click Run
-- ============================================================

-- ======================== 001_initial ========================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own watchlists" ON public.watchlists;
CREATE POLICY "Users can view own watchlists"
  ON public.watchlists FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own watchlists" ON public.watchlists;
CREATE POLICY "Users can insert own watchlists"
  ON public.watchlists FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own watchlists" ON public.watchlists;
CREATE POLICY "Users can update own watchlists"
  ON public.watchlists FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own watchlists" ON public.watchlists;
CREATE POLICY "Users can delete own watchlists"
  ON public.watchlists FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_watchlist_updated ON public.watchlists;
CREATE TRIGGER on_watchlist_updated
  BEFORE UPDATE ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 002_digest ========================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_hour int DEFAULT 8,
  ADD COLUMN IF NOT EXISTS last_digest_at timestamptz;

-- ======================== 003_reading_annotation ========================

CREATE TABLE IF NOT EXISTS public.saved_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pmid text NOT NULL,
  title text NOT NULL,
  authors text[] DEFAULT '{}',
  journal text,
  pub_date text,
  abstract text,
  doi text,
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, pmid)
);

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  paper_id uuid REFERENCES public.saved_papers(id) ON DELETE CASCADE NOT NULL,
  highlight_text text,
  content text NOT NULL,
  note_type text DEFAULT 'general',
  tags text[] DEFAULT '{}',
  page_number int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.saved_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own saved papers" ON public.saved_papers;
CREATE POLICY "Users can view own saved papers"
  ON public.saved_papers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own saved papers" ON public.saved_papers;
CREATE POLICY "Users can insert own saved papers"
  ON public.saved_papers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own saved papers" ON public.saved_papers;
CREATE POLICY "Users can update own saved papers"
  ON public.saved_papers FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own saved papers" ON public.saved_papers;
CREATE POLICY "Users can delete own saved papers"
  ON public.saved_papers FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own notes" ON public.notes;
CREATE POLICY "Users can view own notes"
  ON public.notes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_note_updated ON public.notes;
CREATE TRIGGER on_note_updated
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 004_pdf_storage ========================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('paper-pdfs', 'paper-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own PDFs" ON storage.objects;
CREATE POLICY "Users can upload their own PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'paper-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can read their own PDFs" ON storage.objects;
CREATE POLICY "Users can read their own PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'paper-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own PDFs" ON storage.objects;
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'paper-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

ALTER TABLE saved_papers ADD COLUMN IF NOT EXISTS pdf_url text;

-- ======================== 005_semantic_search ========================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS embedding vector(3072);

CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(3072),
  match_user_id uuid,
  match_count int DEFAULT 20,
  match_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  paper_id uuid,
  highlight_text text,
  content text,
  note_type text,
  tags text[],
  page_number int,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.user_id,
    n.paper_id,
    n.highlight_text,
    n.content,
    n.note_type,
    n.tags,
    n.page_number,
    n.created_at,
    n.updated_at,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.notes n
  WHERE n.user_id = match_user_id
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ======================== 006_advisor ========================

CREATE TABLE IF NOT EXISTS public.research_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  thesis_title text,
  thesis_summary text,
  aims text[] DEFAULT '{}',
  key_questions text[] DEFAULT '{}',
  model_systems text[] DEFAULT '{}',
  key_techniques text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisor_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text DEFAULT 'New conversation',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.advisor_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  context_used jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'supported', 'refuted', 'revised')),
  evidence_for text[] DEFAULT '{}',
  evidence_against text[] DEFAULT '{}',
  related_paper_ids uuid[] DEFAULT '{}',
  aim text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.research_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hypotheses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own research context" ON public.research_context;
CREATE POLICY "Users can view own research context"
  ON public.research_context FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own research context" ON public.research_context;
CREATE POLICY "Users can insert own research context"
  ON public.research_context FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own research context" ON public.research_context;
CREATE POLICY "Users can update own research context"
  ON public.research_context FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own research context" ON public.research_context;
CREATE POLICY "Users can delete own research context"
  ON public.research_context FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own conversations" ON public.advisor_conversations;
CREATE POLICY "Users can view own conversations"
  ON public.advisor_conversations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own conversations" ON public.advisor_conversations;
CREATE POLICY "Users can insert own conversations"
  ON public.advisor_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own conversations" ON public.advisor_conversations;
CREATE POLICY "Users can update own conversations"
  ON public.advisor_conversations FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.advisor_conversations;
CREATE POLICY "Users can delete own conversations"
  ON public.advisor_conversations FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own messages" ON public.advisor_messages;
CREATE POLICY "Users can view own messages"
  ON public.advisor_messages FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own messages" ON public.advisor_messages;
CREATE POLICY "Users can insert own messages"
  ON public.advisor_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own hypotheses" ON public.hypotheses;
CREATE POLICY "Users can view own hypotheses"
  ON public.hypotheses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own hypotheses" ON public.hypotheses;
CREATE POLICY "Users can insert own hypotheses"
  ON public.hypotheses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own hypotheses" ON public.hypotheses;
CREATE POLICY "Users can update own hypotheses"
  ON public.hypotheses FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own hypotheses" ON public.hypotheses;
CREATE POLICY "Users can delete own hypotheses"
  ON public.hypotheses FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_research_context_updated ON public.research_context;
CREATE TRIGGER on_research_context_updated
  BEFORE UPDATE ON public.research_context
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_conversation_updated ON public.advisor_conversations;
CREATE TRIGGER on_conversation_updated
  BEFORE UPDATE ON public.advisor_conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_hypothesis_updated ON public.hypotheses;
CREATE TRIGGER on_hypothesis_updated
  BEFORE UPDATE ON public.hypotheses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 007_experiments ========================

CREATE TABLE IF NOT EXISTS public.protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  steps jsonb DEFAULT '[]',
  version int DEFAULT 1,
  parent_id uuid REFERENCES public.protocols(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  protocol_id uuid REFERENCES public.protocols(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  depends_on uuid[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  notes text,
  aim text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiment_timepoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reagents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  catalog_number text,
  supplier text,
  lot_number text,
  quantity numeric,
  unit text,
  expiration_date date,
  storage_location text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_timepoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reagents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own protocols" ON public.protocols;
CREATE POLICY "Users can view own protocols"
  ON public.protocols FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own protocols" ON public.protocols;
CREATE POLICY "Users can insert own protocols"
  ON public.protocols FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own protocols" ON public.protocols;
CREATE POLICY "Users can update own protocols"
  ON public.protocols FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own protocols" ON public.protocols;
CREATE POLICY "Users can delete own protocols"
  ON public.protocols FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own experiments" ON public.experiments;
CREATE POLICY "Users can view own experiments"
  ON public.experiments FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own experiments" ON public.experiments;
CREATE POLICY "Users can insert own experiments"
  ON public.experiments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own experiments" ON public.experiments;
CREATE POLICY "Users can update own experiments"
  ON public.experiments FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own experiments" ON public.experiments;
CREATE POLICY "Users can delete own experiments"
  ON public.experiments FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own timepoints" ON public.experiment_timepoints;
CREATE POLICY "Users can view own timepoints"
  ON public.experiment_timepoints FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own timepoints" ON public.experiment_timepoints;
CREATE POLICY "Users can insert own timepoints"
  ON public.experiment_timepoints FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own timepoints" ON public.experiment_timepoints;
CREATE POLICY "Users can update own timepoints"
  ON public.experiment_timepoints FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own timepoints" ON public.experiment_timepoints;
CREATE POLICY "Users can delete own timepoints"
  ON public.experiment_timepoints FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own reagents" ON public.reagents;
CREATE POLICY "Users can view own reagents"
  ON public.reagents FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own reagents" ON public.reagents;
CREATE POLICY "Users can insert own reagents"
  ON public.reagents FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own reagents" ON public.reagents;
CREATE POLICY "Users can update own reagents"
  ON public.reagents FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own reagents" ON public.reagents;
CREATE POLICY "Users can delete own reagents"
  ON public.reagents FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_protocol_updated ON public.protocols;
CREATE TRIGGER on_protocol_updated
  BEFORE UPDATE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_experiment_updated ON public.experiments;
CREATE TRIGGER on_experiment_updated
  BEFORE UPDATE ON public.experiments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_reagent_updated ON public.reagents;
CREATE TRIGGER on_reagent_updated
  BEFORE UPDATE ON public.reagents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 008_research_ideas ========================

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

ALTER TABLE public.research_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ideas" ON public.research_ideas;
CREATE POLICY "Users can view own ideas"
  ON public.research_ideas FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ideas" ON public.research_ideas;
CREATE POLICY "Users can insert own ideas"
  ON public.research_ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ideas" ON public.research_ideas;
CREATE POLICY "Users can update own ideas"
  ON public.research_ideas FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ideas" ON public.research_ideas;
CREATE POLICY "Users can delete own ideas"
  ON public.research_ideas FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own idea entries" ON public.idea_entries;
CREATE POLICY "Users can view own idea entries"
  ON public.idea_entries FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own idea entries" ON public.idea_entries;
CREATE POLICY "Users can insert own idea entries"
  ON public.idea_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own idea entries" ON public.idea_entries;
CREATE POLICY "Users can update own idea entries"
  ON public.idea_entries FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own idea entries" ON public.idea_entries;
CREATE POLICY "Users can delete own idea entries"
  ON public.idea_entries FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_idea_updated ON public.research_ideas;
CREATE TRIGGER on_idea_updated
  BEFORE UPDATE ON public.research_ideas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 009_results_analyzer ========================

CREATE TABLE IF NOT EXISTS public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  columns jsonb NOT NULL DEFAULT '[]',
  data jsonb NOT NULL DEFAULT '[]',
  row_count int DEFAULT 0,
  source text DEFAULT 'csv',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  test_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  results jsonb NOT NULL DEFAULT '{}',
  ai_interpretation text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.figures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE NOT NULL,
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  name text NOT NULL,
  chart_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own datasets" ON public.datasets;
CREATE POLICY "Users can view own datasets" ON public.datasets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own datasets" ON public.datasets;
CREATE POLICY "Users can insert own datasets" ON public.datasets FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own datasets" ON public.datasets;
CREATE POLICY "Users can update own datasets" ON public.datasets FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own datasets" ON public.datasets;
CREATE POLICY "Users can delete own datasets" ON public.datasets FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own analyses" ON public.analyses;
CREATE POLICY "Users can view own analyses" ON public.analyses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own analyses" ON public.analyses;
CREATE POLICY "Users can insert own analyses" ON public.analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own analyses" ON public.analyses;
CREATE POLICY "Users can update own analyses" ON public.analyses FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own analyses" ON public.analyses;
CREATE POLICY "Users can delete own analyses" ON public.analyses FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own figures" ON public.figures;
CREATE POLICY "Users can view own figures" ON public.figures FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own figures" ON public.figures;
CREATE POLICY "Users can insert own figures" ON public.figures FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own figures" ON public.figures;
CREATE POLICY "Users can update own figures" ON public.figures FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own figures" ON public.figures;
CREATE POLICY "Users can delete own figures" ON public.figures FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_datasets_updated ON public.datasets;
CREATE TRIGGER on_datasets_updated
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_figures_updated ON public.figures;
CREATE TRIGGER on_figures_updated
  BEFORE UPDATE ON public.figures
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 010_sharing ========================

CREATE TABLE IF NOT EXISTS public.shared_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  content jsonb NOT NULL DEFAULT '{}',
  includes text[] DEFAULT '{}',
  expires_at timestamptz,
  view_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shared_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own snapshots" ON public.shared_snapshots;
CREATE POLICY "Users can view own snapshots"
  ON public.shared_snapshots FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own snapshots" ON public.shared_snapshots;
CREATE POLICY "Users can insert own snapshots"
  ON public.shared_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own snapshots" ON public.shared_snapshots;
CREATE POLICY "Users can delete own snapshots"
  ON public.shared_snapshots FOR DELETE USING (auth.uid() = user_id);

-- ======================== 011_colony ========================

CREATE TABLE IF NOT EXISTS public.breeder_cages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  strain text,
  location text,
  breeding_start date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  breeder_cage_id uuid REFERENCES public.breeder_cages(id) ON DELETE SET NULL,
  name text NOT NULL,
  birth_date date NOT NULL,
  litter_size int,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  identifier text NOT NULL,
  sex text NOT NULL CHECK (sex IN ('male', 'female')),
  genotype text NOT NULL CHECK (genotype IN ('hemi', 'wt', 'het')),
  ear_tag text,
  birth_date date NOT NULL,
  cage_number text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'sacrificed', 'transferred', 'deceased')),
  eeg_implanted boolean DEFAULT false,
  eeg_implant_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.colony_timepoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  age_days int NOT NULL,
  experiments text[] DEFAULT '{}',
  handling_days_before int DEFAULT 3,
  duration_days int DEFAULT 21,
  includes_eeg_implant boolean DEFAULT false,
  eeg_recovery_days int DEFAULT 14,
  eeg_recording_days int DEFAULT 3,
  sort_order int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.animal_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid REFERENCES public.animals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  experiment_type text NOT NULL,
  timepoint_age_days int,
  scheduled_date date,
  completed_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'skipped')),
  results_drive_url text,
  results_notes text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisor_portal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  advisor_name text NOT NULL,
  advisor_email text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  can_see text[] DEFAULT '{experiments,animals,results,timeline}',
  last_viewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.breeder_cages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colony_timepoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_portal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own breeder cages" ON public.breeder_cages;
CREATE POLICY "Users manage own breeder cages" ON public.breeder_cages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cohorts" ON public.cohorts;
CREATE POLICY "Users manage own cohorts" ON public.cohorts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own animals" ON public.animals;
CREATE POLICY "Users manage own animals" ON public.animals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own timepoints" ON public.colony_timepoints;
CREATE POLICY "Users manage own timepoints" ON public.colony_timepoints FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own animal experiments" ON public.animal_experiments;
CREATE POLICY "Users manage own animal experiments" ON public.animal_experiments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own advisor portal" ON public.advisor_portal;
CREATE POLICY "Users manage own advisor portal" ON public.advisor_portal FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_breeder_cages_updated ON public.breeder_cages;
CREATE TRIGGER on_breeder_cages_updated BEFORE UPDATE ON public.breeder_cages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_cohorts_updated ON public.cohorts;
CREATE TRIGGER on_cohorts_updated BEFORE UPDATE ON public.cohorts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_animals_updated ON public.animals;
CREATE TRIGGER on_animals_updated BEFORE UPDATE ON public.animals FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_colony_timepoints_updated ON public.colony_timepoints;
CREATE TRIGGER on_colony_timepoints_updated BEFORE UPDATE ON public.colony_timepoints FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_animal_experiments_updated ON public.animal_experiments;
CREATE TRIGGER on_animal_experiments_updated BEFORE UPDATE ON public.animal_experiments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 012_colony_extras ========================

CREATE TABLE IF NOT EXISTS public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  attendees text[] DEFAULT '{}',
  content text NOT NULL DEFAULT '',
  action_items jsonb DEFAULT '[]',
  ai_summary text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cage_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  scheduled_date date NOT NULL,
  completed_date date,
  is_completed boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cage_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own meeting notes" ON public.meeting_notes;
CREATE POLICY "Users manage own meeting notes" ON public.meeting_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cage changes" ON public.cage_changes;
CREATE POLICY "Users manage own cage changes" ON public.cage_changes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_meeting_notes_updated ON public.meeting_notes;
CREATE TRIGGER on_meeting_notes_updated
  BEFORE UPDATE ON public.meeting_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ======================== 013_colony_photos ========================

CREATE TABLE IF NOT EXISTS public.colony_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  caption text,
  animal_id uuid REFERENCES public.animals(id) ON DELETE SET NULL,
  experiment_type text,
  taken_date date,
  sort_order int DEFAULT 0,
  show_in_portal boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.colony_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own colony photos" ON public.colony_photos;
CREATE POLICY "Users manage own colony photos" ON public.colony_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ======================== 014_google_drive ========================

CREATE TABLE IF NOT EXISTS public.google_drive_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  google_email text,
  root_folder_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.google_drive_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own drive tokens" ON public.google_drive_tokens;
CREATE POLICY "Users manage own drive tokens" ON public.google_drive_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_drive_tokens_updated ON public.google_drive_tokens;
CREATE TRIGGER on_drive_tokens_updated
  BEFORE UPDATE ON public.google_drive_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 015: Housing Cages (where animals currently live)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.housing_cages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cage_label text NOT NULL,
  location text,
  max_occupancy int DEFAULT 5,
  cage_type text DEFAULT 'standard',
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.housing_cages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own housing cages" ON public.housing_cages;
CREATE POLICY "Users manage own housing cages" ON public.housing_cages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_housing_cages_updated BEFORE UPDATE ON public.housing_cages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'animals' AND column_name = 'housing_cage_id') THEN
    ALTER TABLE public.animals ADD COLUMN housing_cage_id uuid REFERENCES public.housing_cages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 016: Unified Tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  due_date date,
  due_time time,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  source_type text CHECK (source_type IN ('manual', 'meeting_action', 'experiment', 'cage_change', 'animal_care', 'reminder')),
  source_id text,
  source_label text,
  is_recurring boolean DEFAULT false,
  recurrence_rule text,
  tags text[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own tasks" ON public.tasks;
CREATE POLICY "Users manage own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 017: Grace Period for experiment timepoints
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colony_timepoints' AND column_name = 'grace_period_days') THEN
    ALTER TABLE public.colony_timepoints ADD COLUMN grace_period_days int DEFAULT 30;
  END IF;
END $$;

-- ============================================================
-- 018: AI Literature Scout
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
  ai_summary text,
  ai_relevance text,
  ai_ideas text,
  relevance_score int DEFAULT 50,
  status text DEFAULT 'new' CHECK (status IN ('new', 'saved', 'skipped', 'starred')),
  user_notes text,
  matched_keyword text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.scout_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own scout findings" ON public.scout_findings;
CREATE POLICY "Users manage own scout findings" ON public.scout_findings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_scout_findings_updated BEFORE UPDATE ON public.scout_findings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

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

-- ============================================================
-- 019: AI Memory (Unified memory for all AI agents)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL CHECK (category IN (
    'research_fact', 'hypothesis', 'experiment_insight', 'preference',
    'meeting_decision', 'literature_pattern', 'troubleshooting',
    'goal', 'connection', 'important_date'
  )),
  content text NOT NULL,
  source text,
  confidence text DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high', 'confirmed')),
  tags text[] DEFAULT '{}',
  is_auto boolean DEFAULT true,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ai memory" ON public.ai_memory;
CREATE POLICY "Users manage own ai memory" ON public.ai_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE TRIGGER on_ai_memory_updated BEFORE UPDATE ON public.ai_memory FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_category ON public.ai_memory(user_id, category);
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_pinned ON public.ai_memory(user_id, is_pinned) WHERE is_pinned = true;

-- ============================================================
-- DONE! All tables created successfully.
-- ============================================================
