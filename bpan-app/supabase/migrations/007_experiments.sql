-- ============================================================
-- BPAN Platform — Experiment Planner & Calendar tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Protocol templates — reusable experiment procedures
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

-- 2. Experiments
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

-- 3. Experiment timepoints — individual milestones/checkpoints
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

-- 4. Reagents / resources
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

-- 5. RLS policies
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_timepoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reagents ENABLE ROW LEVEL SECURITY;

-- Protocols
CREATE POLICY "Users can view own protocols"
  ON public.protocols FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own protocols"
  ON public.protocols FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own protocols"
  ON public.protocols FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own protocols"
  ON public.protocols FOR DELETE USING (auth.uid() = user_id);

-- Experiments
CREATE POLICY "Users can view own experiments"
  ON public.experiments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own experiments"
  ON public.experiments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own experiments"
  ON public.experiments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own experiments"
  ON public.experiments FOR DELETE USING (auth.uid() = user_id);

-- Timepoints
CREATE POLICY "Users can view own timepoints"
  ON public.experiment_timepoints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own timepoints"
  ON public.experiment_timepoints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own timepoints"
  ON public.experiment_timepoints FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own timepoints"
  ON public.experiment_timepoints FOR DELETE USING (auth.uid() = user_id);

-- Reagents
CREATE POLICY "Users can view own reagents"
  ON public.reagents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reagents"
  ON public.reagents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reagents"
  ON public.reagents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reagents"
  ON public.reagents FOR DELETE USING (auth.uid() = user_id);

-- 6. Auto-update triggers
CREATE OR REPLACE TRIGGER on_protocol_updated
  BEFORE UPDATE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER on_experiment_updated
  BEFORE UPDATE ON public.experiments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER on_reagent_updated
  BEFORE UPDATE ON public.reagents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

