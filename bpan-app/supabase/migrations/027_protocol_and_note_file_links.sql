alter table public.protocols
  add column if not exists file_links jsonb not null default '[]'::jsonb;

alter table public.notes
  add column if not exists file_links jsonb not null default '[]'::jsonb;

