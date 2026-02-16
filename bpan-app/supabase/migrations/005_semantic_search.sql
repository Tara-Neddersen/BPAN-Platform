-- ============================================================
-- BPAN Platform — Semantic Search (pgvector embeddings)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to notes (3072 dims = Gemini gemini-embedding-001)
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- 3. Create a function for semantic similarity search
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(3072),
  match_user_id uuid,
  match_count int DEFAULT 20,
  match_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  paper_id uuid,
  highlight_text text,
  content text,
  note_type text,
  tags text[],
  page_number int,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.user_id,
    n.paper_id,
    n.highlight_text,
    n.content,
    n.note_type,
    n.tags,
    n.page_number,
    n.created_at,
    n.updated_at,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.notes n
  WHERE n.user_id = match_user_id
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
