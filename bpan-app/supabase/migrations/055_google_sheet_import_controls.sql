alter table public.google_sheet_links
  add column if not exists import_config jsonb not null default '{}'::jsonb;

alter table public.colony_results
  add column if not exists source_sheet_link_id uuid references public.google_sheet_links(id) on delete set null;

create index if not exists idx_colony_results_source_sheet_link
  on public.colony_results(source_sheet_link_id);
