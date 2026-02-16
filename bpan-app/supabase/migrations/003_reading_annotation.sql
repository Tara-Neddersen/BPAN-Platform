-- ============================================================
-- BPAN Platform — Reading & Annotation tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Saved papers
create table if not exists public.saved_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  pmid text not null,
  title text not null,
  authors text[] default '{}',
  journal text,
  pub_date text,
  abstract text,
  doi text,
  pdf_url text,
  created_at timestamptz default now(),
  unique(user_id, pmid)
);

-- 2. Notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  paper_id uuid references public.saved_papers(id) on delete cascade not null,
  highlight_text text,
  content text not null,
  note_type text default 'general',
  tags text[] default '{}',
  page_number int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. RLS
alter table public.saved_papers enable row level security;
alter table public.notes enable row level security;

create policy "Users can view own saved papers"
  on public.saved_papers for select using (auth.uid() = user_id);
create policy "Users can insert own saved papers"
  on public.saved_papers for insert with check (auth.uid() = user_id);
create policy "Users can update own saved papers"
  on public.saved_papers for update using (auth.uid() = user_id);
create policy "Users can delete own saved papers"
  on public.saved_papers for delete using (auth.uid() = user_id);

create policy "Users can view own notes"
  on public.notes for select using (auth.uid() = user_id);
create policy "Users can insert own notes"
  on public.notes for insert with check (auth.uid() = user_id);
create policy "Users can update own notes"
  on public.notes for update using (auth.uid() = user_id);
create policy "Users can delete own notes"
  on public.notes for delete using (auth.uid() = user_id);

-- 4. Auto-update updated_at on notes
create or replace trigger on_note_updated
  before update on public.notes
  for each row execute function public.handle_updated_at();
