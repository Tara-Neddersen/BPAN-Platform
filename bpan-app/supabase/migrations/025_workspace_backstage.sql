-- ============================================================
-- BPAN Platform — Workspace Backstage Graph + Activity Event Index
-- Durable cross-module links and normalized activity records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspace_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  link_type text NOT NULL,
  confidence numeric DEFAULT 1.0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, source_type, source_id, target_type, target_id, link_type)
);

CREATE TABLE IF NOT EXISTS public.workspace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  detail text,
  href text,
  event_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_links_user_source
  ON public.workspace_entity_links (user_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_workspace_links_user_target
  ON public.workspace_entity_links (user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_workspace_links_user_linktype
  ON public.workspace_entity_links (user_id, link_type);

CREATE INDEX IF NOT EXISTS idx_workspace_events_user_event_at
  ON public.workspace_events (user_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_events_user_entity
  ON public.workspace_events (user_id, entity_type, entity_id);

ALTER TABLE public.workspace_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workspace links"
  ON public.workspace_entity_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own workspace events"
  ON public.workspace_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER on_workspace_links_updated
  BEFORE UPDATE ON public.workspace_entity_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

