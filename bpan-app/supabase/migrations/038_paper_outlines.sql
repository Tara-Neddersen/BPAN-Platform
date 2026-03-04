CREATE TABLE IF NOT EXISTS public.paper_outlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  framing text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.paper_outlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own paper outlines" ON public.paper_outlines;
CREATE POLICY "Users manage own paper outlines"
  ON public.paper_outlines
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_paper_outlines_updated ON public.paper_outlines;
CREATE TRIGGER on_paper_outlines_updated
  BEFORE UPDATE ON public.paper_outlines
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
