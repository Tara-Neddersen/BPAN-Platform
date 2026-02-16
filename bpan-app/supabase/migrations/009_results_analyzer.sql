-- ============================================================
-- BPAN Platform — Results Analyzer (Phase 5)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Datasets — uploaded data (CSV, Excel, pasted)
CREATE TABLE IF NOT EXISTS public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  columns jsonb NOT NULL DEFAULT '[]',    -- [{name, type, unit}]
  data jsonb NOT NULL DEFAULT '[]',       -- array of row objects
  row_count int DEFAULT 0,
  source text DEFAULT 'csv',              -- 'csv', 'excel', 'paste'
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Analyses — saved statistical analyses on a dataset
CREATE TABLE IF NOT EXISTS public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  test_type text NOT NULL,                -- 't_test', 'anova', 'mann_whitney', 'chi_square', 'correlation', 'descriptive'
  config jsonb NOT NULL DEFAULT '{}',     -- columns selected, grouping variable, etc.
  results jsonb NOT NULL DEFAULT '{}',    -- p-value, statistic, effect size, CI, etc.
  ai_interpretation text,                 -- plain-English AI summary
  created_at timestamptz DEFAULT now()
);

-- 3. Figures — saved chart configurations
CREATE TABLE IF NOT EXISTS public.figures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE NOT NULL,
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  name text NOT NULL,
  chart_type text NOT NULL,               -- 'bar', 'scatter', 'box', 'histogram', 'line', 'violin', 'heatmap'
  config jsonb NOT NULL DEFAULT '{}',     -- Plotly layout + trace config
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. RLS
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own datasets" ON public.datasets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own datasets" ON public.datasets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own datasets" ON public.datasets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own datasets" ON public.datasets FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own analyses" ON public.analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own analyses" ON public.analyses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.analyses FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own figures" ON public.figures FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own figures" ON public.figures FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own figures" ON public.figures FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own figures" ON public.figures FOR DELETE USING (auth.uid() = user_id);

-- 5. Triggers
CREATE OR REPLACE TRIGGER on_datasets_updated
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER on_figures_updated
  BEFORE UPDATE ON public.figures
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

