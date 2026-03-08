-- ============================================================
-- BPAN Platform — Redesign Phase 3 operations schema and contracts
-- Adds shared lab operations inventory, booking, and object-link messaging.
-- ============================================================

create table if not exists public.lab_reagents (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  name text not null,
  catalog_number text,
  supplier text,
  lot_number text,
  quantity numeric not null default 0,
  unit text,
  reorder_threshold numeric,
  needs_reorder boolean not null default false,
  last_ordered_at timestamptz,
  storage_location text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lab_reagents_lab_idx on public.lab_reagents (lab_id);
create index if not exists lab_reagents_lab_reorder_idx
  on public.lab_reagents (lab_id, needs_reorder);

create table if not exists public.lab_reagent_stock_events (
  id uuid primary key default gen_random_uuid(),
  lab_reagent_id uuid not null references public.lab_reagents(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'receive',
      'consume',
      'adjust',
      'reorder_request',
      'reorder_placed',
      'reorder_received'
    )
  ),
  quantity_delta numeric not null default 0,
  unit text,
  vendor text,
  reference_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lab_reagent_stock_events_reagent_idx
  on public.lab_reagent_stock_events (lab_reagent_id);
create index if not exists lab_reagent_stock_events_reagent_created_idx
  on public.lab_reagent_stock_events (lab_reagent_id, created_at desc);

create table if not exists public.lab_equipment (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  name text not null,
  description text,
  location text,
  booking_requires_approval boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lab_equipment_lab_idx on public.lab_equipment (lab_id);
create index if not exists lab_equipment_lab_active_idx
  on public.lab_equipment (lab_id, is_active);

create table if not exists public.lab_equipment_bookings (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.lab_equipment(id) on delete cascade,
  booked_by uuid references public.profiles(id) on delete set null,
  experiment_run_id uuid references public.experiment_runs(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'in_use', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_equipment_bookings_time_window_check check (ends_at > starts_at)
);

create index if not exists lab_equipment_bookings_equipment_idx
  on public.lab_equipment_bookings (equipment_id);
create index if not exists lab_equipment_bookings_equipment_window_idx
  on public.lab_equipment_bookings (equipment_id, starts_at, ends_at);
create index if not exists lab_equipment_bookings_booked_by_idx
  on public.lab_equipment_bookings (booked_by);

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid references public.labs(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete cascade,
  subject text,
  linked_object_type text not null check (
    linked_object_type in (
      'experiment_template',
      'experiment_run',
      'protocol',
      'lab_reagent',
      'lab_reagent_stock_event',
      'lab_equipment',
      'lab_equipment_booking',
      'task'
    )
  ),
  linked_object_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_threads_context_check check (
    (
      lab_id is not null
      and owner_user_id is null
    )
    or (
      lab_id is null
      and owner_user_id is not null
    )
  )
);

create index if not exists message_threads_linked_object_idx
  on public.message_threads (linked_object_type, linked_object_id);
create index if not exists message_threads_lab_idx on public.message_threads (lab_id);
create index if not exists message_threads_owner_idx on public.message_threads (owner_user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  author_user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at);

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  linked_object_type text not null check (
    linked_object_type in (
      'experiment_template',
      'experiment_run',
      'protocol',
      'lab_reagent',
      'lab_reagent_stock_event',
      'lab_equipment',
      'lab_equipment_booking',
      'task'
    )
  ),
  linked_object_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, linked_object_type, linked_object_id)
);

create index if not exists task_links_task_idx on public.task_links (task_id);
create index if not exists task_links_linked_object_idx
  on public.task_links (linked_object_type, linked_object_id);

create or replace function public.can_view_lab_reagent(target_lab_reagent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_reagents lr
    where lr.id = target_lab_reagent_id
      and public.is_lab_member(lr.lab_id)
  );
$$;

create or replace function public.can_edit_lab_reagent(target_lab_reagent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_reagents lr
    where lr.id = target_lab_reagent_id
      and public.is_lab_member(lr.lab_id)
  );
$$;

create or replace function public.can_manage_lab_reagent(target_lab_reagent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_reagents lr
    where lr.id = target_lab_reagent_id
      and public.has_lab_role(lr.lab_id, array['manager', 'admin'])
  );
$$;

create or replace function public.can_view_lab_equipment(target_lab_equipment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_equipment le
    where le.id = target_lab_equipment_id
      and public.is_lab_member(le.lab_id)
  );
$$;

create or replace function public.can_manage_lab_equipment(target_lab_equipment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_equipment le
    where le.id = target_lab_equipment_id
      and public.has_lab_role(le.lab_id, array['manager', 'admin'])
  );
$$;

create or replace function public.can_view_lab_equipment_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_equipment_bookings leb
    join public.lab_equipment le on le.id = leb.equipment_id
    where leb.id = target_booking_id
      and public.is_lab_member(le.lab_id)
  );
$$;

create or replace function public.can_edit_lab_equipment_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_equipment_bookings leb
    join public.lab_equipment le on le.id = leb.equipment_id
    where leb.id = target_booking_id
      and (
        leb.booked_by = auth.uid()
        or public.has_lab_role(le.lab_id, array['manager', 'admin'])
      )
  );
$$;

create or replace function public.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = target_task_id
      and t.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_operations_linked_object(target_object_type text, target_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case target_object_type
    when 'experiment_template' then public.can_view_experiment_template(target_object_id)
    when 'experiment_run' then public.can_view_experiment_run(target_object_id)
    when 'protocol' then exists (
      select 1
      from public.protocols p
      where p.id = target_object_id
        and p.user_id = auth.uid()
    )
    when 'lab_reagent' then public.can_view_lab_reagent(target_object_id)
    when 'lab_reagent_stock_event' then exists (
      select 1
      from public.lab_reagent_stock_events lrse
      join public.lab_reagents lr on lr.id = lrse.lab_reagent_id
      where lrse.id = target_object_id
        and public.is_lab_member(lr.lab_id)
    )
    when 'lab_equipment' then public.can_view_lab_equipment(target_object_id)
    when 'lab_equipment_booking' then public.can_view_lab_equipment_booking(target_object_id)
    when 'task' then public.can_access_task(target_object_id)
    else false
  end;
$$;

create or replace function public.can_view_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_threads mt
    where mt.id = target_thread_id
      and (
        (mt.owner_user_id is not null and mt.owner_user_id = auth.uid())
        or (mt.lab_id is not null and public.is_lab_member(mt.lab_id))
      )
      and public.can_access_operations_linked_object(mt.linked_object_type, mt.linked_object_id)
  );
$$;

create or replace function public.can_manage_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_threads mt
    where mt.id = target_thread_id
      and (
        (mt.owner_user_id is not null and mt.owner_user_id = auth.uid())
        or (
          mt.lab_id is not null
          and (
            mt.created_by = auth.uid()
            or public.has_lab_role(mt.lab_id, array['manager', 'admin'])
          )
        )
      )
      and public.can_access_operations_linked_object(mt.linked_object_type, mt.linked_object_id)
  );
$$;

alter table public.lab_reagents enable row level security;
alter table public.lab_reagent_stock_events enable row level security;
alter table public.lab_equipment enable row level security;
alter table public.lab_equipment_bookings enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.task_links enable row level security;

create policy "Users can view lab reagents"
  on public.lab_reagents for select
  using (public.is_lab_member(lab_id));

create policy "Lab members can create lab reagents"
  on public.lab_reagents for insert
  with check (
    auth.uid() = created_by
    and public.is_lab_member(lab_id)
  );

create policy "Lab members can update lab reagents"
  on public.lab_reagents for update
  using (public.is_lab_member(lab_id))
  with check (public.is_lab_member(lab_id));

create policy "Lab managers can delete lab reagents"
  on public.lab_reagents for delete
  using (public.has_lab_role(lab_id, array['manager', 'admin']));

create policy "Users can view reagent stock events"
  on public.lab_reagent_stock_events for select
  using (public.can_view_lab_reagent(lab_reagent_id));

create policy "Lab members can create reagent stock events"
  on public.lab_reagent_stock_events for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_lab_reagent(lab_reagent_id)
  );

create policy "Lab managers can update reagent stock events"
  on public.lab_reagent_stock_events for update
  using (public.can_manage_lab_reagent(lab_reagent_id))
  with check (public.can_manage_lab_reagent(lab_reagent_id));

create policy "Lab managers can delete reagent stock events"
  on public.lab_reagent_stock_events for delete
  using (public.can_manage_lab_reagent(lab_reagent_id));

create policy "Users can view lab equipment"
  on public.lab_equipment for select
  using (public.is_lab_member(lab_id));

create policy "Lab managers can create lab equipment"
  on public.lab_equipment for insert
  with check (
    auth.uid() = created_by
    and public.has_lab_role(lab_id, array['manager', 'admin'])
  );

create policy "Lab managers can update lab equipment"
  on public.lab_equipment for update
  using (public.has_lab_role(lab_id, array['manager', 'admin']))
  with check (public.has_lab_role(lab_id, array['manager', 'admin']));

create policy "Lab managers can delete lab equipment"
  on public.lab_equipment for delete
  using (public.has_lab_role(lab_id, array['manager', 'admin']));

create policy "Users can view equipment bookings"
  on public.lab_equipment_bookings for select
  using (
    exists (
      select 1
      from public.lab_equipment le
      where le.id = equipment_id
        and public.is_lab_member(le.lab_id)
    )
  );

create policy "Lab members can create equipment bookings"
  on public.lab_equipment_bookings for insert
  with check (
    booked_by is not null
    and booked_by = auth.uid()
    and exists (
      select 1
      from public.lab_equipment le
      where le.id = equipment_id
        and public.is_lab_member(le.lab_id)
    )
    and (experiment_run_id is null or public.can_view_experiment_run(experiment_run_id))
    and (task_id is null or public.can_access_task(task_id))
  );

create policy "Booking owners and lab managers can update equipment bookings"
  on public.lab_equipment_bookings for update
  using (public.can_edit_lab_equipment_booking(id))
  with check (
    (
      (
        booked_by is not null
        and booked_by = auth.uid()
        and exists (
          select 1
          from public.lab_equipment le
          where le.id = equipment_id
            and public.is_lab_member(le.lab_id)
        )
      )
      or exists (
        select 1
        from public.lab_equipment le
        where le.id = equipment_id
          and public.has_lab_role(le.lab_id, array['manager', 'admin'])
      )
    )
    and (experiment_run_id is null or public.can_view_experiment_run(experiment_run_id))
    and (task_id is null or public.can_access_task(task_id))
  );

create policy "Booking owners and lab managers can delete equipment bookings"
  on public.lab_equipment_bookings for delete
  using (public.can_edit_lab_equipment_booking(id));

create policy "Users can view accessible message threads"
  on public.message_threads for select
  using (public.can_view_message_thread(id));

create policy "Users can create accessible message threads"
  on public.message_threads for insert
  with check (
    auth.uid() = created_by
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
    and (
      (owner_user_id = auth.uid() and lab_id is null)
      or (owner_user_id is null and lab_id is not null and public.is_lab_member(lab_id))
    )
  );

create policy "Users can update manageable message threads"
  on public.message_threads for update
  using (public.can_manage_message_thread(id))
  with check (
    public.can_access_operations_linked_object(linked_object_type, linked_object_id)
    and (
      (owner_user_id = auth.uid() and lab_id is null)
      or (
        owner_user_id is null
        and lab_id is not null
        and (
          created_by = auth.uid()
          or public.has_lab_role(lab_id, array['manager', 'admin'])
        )
      )
    )
  );

create policy "Users can delete manageable message threads"
  on public.message_threads for delete
  using (public.can_manage_message_thread(id));

create policy "Users can view messages in accessible threads"
  on public.messages for select
  using (public.can_view_message_thread(thread_id));

create policy "Users can create messages in accessible threads"
  on public.messages for insert
  with check (
    author_user_id = auth.uid()
    and public.can_view_message_thread(thread_id)
  );

create policy "Authors can update own messages in accessible threads"
  on public.messages for update
  using (
    author_user_id = auth.uid()
    and public.can_view_message_thread(thread_id)
  )
  with check (
    author_user_id = auth.uid()
    and public.can_view_message_thread(thread_id)
  );

create policy "Authors can delete own messages in accessible threads"
  on public.messages for delete
  using (
    author_user_id = auth.uid()
    and public.can_view_message_thread(thread_id)
  );

create policy "Users can view accessible task links"
  on public.task_links for select
  using (
    public.can_access_task(task_id)
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
  );

create policy "Users can create accessible task links"
  on public.task_links for insert
  with check (
    auth.uid() = created_by
    and public.can_access_task(task_id)
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
  );

create policy "Users can update accessible task links"
  on public.task_links for update
  using (
    public.can_access_task(task_id)
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
  )
  with check (
    public.can_access_task(task_id)
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
  );

create policy "Users can delete accessible task links"
  on public.task_links for delete
  using (
    public.can_access_task(task_id)
    and public.can_access_operations_linked_object(linked_object_type, linked_object_id)
  );

create or replace trigger on_lab_reagents_updated
  before update on public.lab_reagents
  for each row execute function public.handle_updated_at();

create or replace trigger on_lab_equipment_updated
  before update on public.lab_equipment
  for each row execute function public.handle_updated_at();

create or replace trigger on_lab_equipment_bookings_updated
  before update on public.lab_equipment_bookings
  for each row execute function public.handle_updated_at();

create or replace trigger on_message_threads_updated
  before update on public.message_threads
  for each row execute function public.handle_updated_at();

create or replace trigger on_messages_updated
  before update on public.messages
  for each row execute function public.handle_updated_at();
