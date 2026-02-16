-- ============================================================
-- BPAN Platform — Digest columns on profiles
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

alter table public.profiles
  add column if not exists digest_enabled boolean default true,
  add column if not exists digest_hour int default 8,
  add column if not exists last_digest_at timestamptz;
