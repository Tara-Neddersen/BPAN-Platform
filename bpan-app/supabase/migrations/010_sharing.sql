-- ============================================================
-- BPAN Platform — Project Sharing (Phase 6)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Shared snapshots — read-only snapshots shared via link
CREATE TABLE IF NOT EXISTS public.shared_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  content jsonb NOT NULL DEFAULT '{}',   -- snapshot of selected data
  includes text[] DEFAULT '{}',          -- what's included: notes, papers, experiments, results, ideas
  expires_at timestamptz,
  view_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2. RLS — owner can manage, anyone with token can view via API
ALTER TABLE public.shared_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON public.shared_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots"
  ON public.shared_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own snapshots"
  ON public.shared_snapshots FOR DELETE USING (auth.uid() = user_id);

