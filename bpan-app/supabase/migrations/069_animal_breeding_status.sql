-- Add "breeding" as a valid animal status.
--
-- Context: sometimes experimental animals get permanently repurposed for
-- breeding. We want the platform to reflect that they are no longer
-- experimental subjects (so they should drop out of "active" lists, batch
-- experiment scheduling, etc.) while their historical results stay visible
-- in run-scoped analyses — the analysis layer filters by run assignment,
-- not by current status, so no data loss occurs.
--
-- The existing CHECK constraint on animals.status only allows
--   ('active', 'sacrificed', 'transferred', 'deceased').
-- We extend it with 'breeding'. Existing rows are unaffected.

ALTER TABLE public.animals
  DROP CONSTRAINT IF EXISTS animals_status_check;

ALTER TABLE public.animals
  ADD CONSTRAINT animals_status_check
  CHECK (status IN ('active', 'sacrificed', 'transferred', 'deceased', 'breeding'));
