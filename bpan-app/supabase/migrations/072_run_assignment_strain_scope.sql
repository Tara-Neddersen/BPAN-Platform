-- Allow scope_type = 'strain' on run_assignments (column strain_id added in 071).
-- Additive + idempotent: widen the two CHECK constraints to include the strain case.
alter table run_assignments drop constraint if exists run_assignments_scope_type_check;
alter table run_assignments add constraint run_assignments_scope_type_check
  check (scope_type = any (array['study','cohort','animal','strain']));

alter table run_assignments drop constraint if exists run_assignments_scope_target_check;
alter table run_assignments add constraint run_assignments_scope_target_check check (
  (scope_type='study'  and study_id is not null and cohort_id is null and animal_id is null and strain_id is null) or
  (scope_type='cohort' and study_id is null and cohort_id is not null and animal_id is null and strain_id is null) or
  (scope_type='animal' and study_id is null and cohort_id is null and animal_id is not null and strain_id is null) or
  (scope_type='strain' and study_id is null and cohort_id is null and animal_id is null and strain_id is not null)
);
