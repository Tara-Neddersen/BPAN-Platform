create table if not exists public.quartzy_inventory_links (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  lab_reagent_id uuid not null references public.lab_reagents(id) on delete cascade,
  quartzy_item_id text not null,
  quartzy_lab_id text,
  quartzy_lab_name text,
  quartzy_type_name text,
  quartzy_vendor text,
  quartzy_catalog_number text,
  quartzy_quantity numeric,
  item_kind text not null default 'other' check (item_kind in ('reagent', 'equipment', 'other')),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_id, quartzy_item_id),
  unique (lab_reagent_id)
);

create index if not exists quartzy_inventory_links_lab_idx
  on public.quartzy_inventory_links (lab_id, item_kind);

create index if not exists quartzy_inventory_links_item_idx
  on public.quartzy_inventory_links (quartzy_item_id);

alter table public.quartzy_inventory_links enable row level security;

drop policy if exists "Lab members can view quartzy inventory links" on public.quartzy_inventory_links;
create policy "Lab members can view quartzy inventory links"
  on public.quartzy_inventory_links for select
  using (public.is_lab_member(lab_id));

drop policy if exists "Lab managers can manage quartzy inventory links" on public.quartzy_inventory_links;
create policy "Lab managers can manage quartzy inventory links"
  on public.quartzy_inventory_links for all
  using (public.has_lab_role(lab_id, array['manager', 'admin']))
  with check (public.has_lab_role(lab_id, array['manager', 'admin']));

drop trigger if exists on_quartzy_inventory_links_updated on public.quartzy_inventory_links;
create trigger on_quartzy_inventory_links_updated
  before update on public.quartzy_inventory_links
  for each row execute function public.handle_updated_at();
