-- ============================================================
-- BPAN Platform — AI Research Advisor tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Research context — user's thesis topic, aims, key questions
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

-- 2. Advisor conversations
CREATE TABLE IF NOT EXISTS public.advisor_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text DEFAULT 'New conversation',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Advisor messages
CREATE TABLE IF NOT EXISTS public.advisor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.advisor_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  context_used jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 4. Hypotheses tracker
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

-- 5. RLS policies
ALTER TABLE public.research_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hypotheses ENABLE ROW LEVEL SECURITY;

-- Research context
CREATE POLICY "Users can view own research context"
  ON public.research_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own research context"
  ON public.research_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own research context"
  ON public.research_context FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own research context"
  ON public.research_context FOR DELETE USING (auth.uid() = user_id);

-- Conversations
CREATE POLICY "Users can view own conversations"
  ON public.advisor_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations"
  ON public.advisor_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations"
  ON public.advisor_conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations"
  ON public.advisor_conversations FOR DELETE USING (auth.uid() = user_id);

-- Messages
CREATE POLICY "Users can view own messages"
  ON public.advisor_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages"
  ON public.advisor_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Hypotheses
CREATE POLICY "Users can view own hypotheses"
  ON public.hypotheses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own hypotheses"
  ON public.hypotheses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own hypotheses"
  ON public.hypotheses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own hypotheses"
  ON public.hypotheses FOR DELETE USING (auth.uid() = user_id);

-- 6. Auto-update triggers
CREATE OR REPLACE TRIGGER on_research_context_updated
  BEFORE UPDATE ON public.research_context
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER on_conversation_updated
  BEFORE UPDATE ON public.advisor_conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER on_hypothesis_updated
  BEFORE UPDATE ON public.hypotheses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

