-- Create a storage bucket for paper PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('paper-pdfs', 'paper-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload PDFs to their own folder
CREATE POLICY "Users can upload their own PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'paper-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own PDFs
CREATE POLICY "Users can read their own PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'paper-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own PDFs
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'paper-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add pdf_url column to saved_papers to track uploaded PDFs
ALTER TABLE saved_papers ADD COLUMN IF NOT EXISTS pdf_url text;
