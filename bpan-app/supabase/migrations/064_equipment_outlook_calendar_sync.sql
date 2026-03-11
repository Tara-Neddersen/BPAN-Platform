alter table public.lab_equipment
  add column if not exists outlook_calendar_id text,
  add column if not exists outlook_calendar_name text,
  add column if not exists outlook_sync_owner_user_id uuid references public.profiles(id) on delete set null;

create index if not exists lab_equipment_outlook_owner_idx
  on public.lab_equipment (outlook_sync_owner_user_id)
  where outlook_sync_owner_user_id is not null;

create table if not exists public.lab_equipment_outlook_event_map (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.lab_equipment(id) on delete cascade,
  booking_id uuid unique references public.lab_equipment_bookings(id) on delete cascade,
  outlook_sync_owner_user_id uuid not null references public.profiles(id) on delete cascade,
  outlook_calendar_id text not null,
  outlook_event_id text not null,
  source text not null default 'bpan' check (source in ('bpan', 'outlook')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlook_sync_owner_user_id, outlook_calendar_id, outlook_event_id)
);

create index if not exists lab_equipment_outlook_event_map_equipment_idx
  on public.lab_equipment_outlook_event_map (equipment_id);

create index if not exists lab_equipment_outlook_event_map_booking_idx
  on public.lab_equipment_outlook_event_map (booking_id)
  where booking_id is not null;

alter table public.lab_equipment_outlook_event_map enable row level security;

drop policy if exists "Users can view equipment outlook event maps" on public.lab_equipment_outlook_event_map;
create policy "Users can view equipment outlook event maps"
  on public.lab_equipment_outlook_event_map for select
  using (public.can_view_lab_equipment(equipment_id));

drop policy if exists "Lab managers can manage equipment outlook event maps" on public.lab_equipment_outlook_event_map;
create policy "Lab managers can manage equipment outlook event maps"
  on public.lab_equipment_outlook_event_map for all
  using (public.can_manage_lab_equipment(equipment_id))
  with check (public.can_manage_lab_equipment(equipment_id));

drop trigger if exists on_lab_equipment_outlook_event_map_updated on public.lab_equipment_outlook_event_map;
create trigger on_lab_equipment_outlook_event_map_updated
  before update on public.lab_equipment_outlook_event_map
  for each row execute function public.handle_updated_at();
