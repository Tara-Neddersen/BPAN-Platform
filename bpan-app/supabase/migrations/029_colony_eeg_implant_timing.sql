alter table public.colony_timepoints
  add column if not exists eeg_implant_timing text not null default 'after';

