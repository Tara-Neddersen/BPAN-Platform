alter table public.protocols
  add column if not exists figure_links jsonb not null default '[]'::jsonb;
