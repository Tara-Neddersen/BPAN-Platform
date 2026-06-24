-- Run assignment by whole strain (dynamic membership: all cohorts/animals of the strain).
-- Additive + idempotent. scope_type gains 'strain' at the app layer; this adds the column.
alter table run_assignments
  add column if not exists strain_id uuid references strains(id) on delete cascade;
create index if not exists idx_run_assignments_strain_id on run_assignments(strain_id);
