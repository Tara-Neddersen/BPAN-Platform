-- 021: Create storage bucket for cage images (nesting, marble burying)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('cage-images', 'cage-images', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: authenticated users can upload to their own folder
CREATE POLICY "Users upload own cage images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cage-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. RLS: users can read their own images
CREATE POLICY "Users read own cage images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cage-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. RLS: users can delete their own images
CREATE POLICY "Users delete own cage images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cage-images' AND (storage.foldername(name))[1] = auth.uid()::text);

