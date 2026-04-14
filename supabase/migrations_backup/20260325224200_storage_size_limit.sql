-- Migration: Storage file size limit (25MB) for sources bucket
-- Date: 2026-03-25
-- Story: 1.4 File Upload Validation & Progress

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- Server-side enforcement: restrict uploads to 25MB max on the 'sources' bucket.
-- This acts as a defense-in-depth measure alongside frontend validation.
-- Note: Supabase Storage policies use the `owner` field and metadata for checks.

-- Drop existing insert policy if it exists (to recreate with size limit)
DO $$
BEGIN
  -- Check if the policy already exists before attempting to drop
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can upload to sources bucket'
  ) THEN
    DROP POLICY "Authenticated users can upload to sources bucket" ON storage.objects;
  END IF;
END $$;

-- Create upload policy with 25MB file size restriction
CREATE POLICY "Authenticated users can upload to sources bucket with size limit"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sources'
  AND (octet_length(name) > 0)  -- Ensure non-empty path
);

-- Note: Supabase Storage handles file_size_limit at the bucket level.
-- The recommended approach is to set the file_size_limit on the bucket itself
-- rather than in RLS policies, as the metadata->>'size' is not reliably 
-- available at INSERT time in all Supabase versions.
--
-- To set bucket-level limit, run in Supabase Dashboard SQL Editor:
-- UPDATE storage.buckets SET file_size_limit = 26214400 WHERE id = 'sources';

-- Set bucket-level file size limit to 25MB (26214400 bytes)
UPDATE storage.buckets 
SET file_size_limit = 26214400 
WHERE id = 'sources';


-- ============================================================
-- DOWN MIGRATION
-- ============================================================
-- To rollback, run the following:
--
-- -- Remove the size-limited policy
-- DROP POLICY IF EXISTS "Authenticated users can upload to sources bucket with size limit" ON storage.objects;
--
-- -- Restore original policy without size limit
-- CREATE POLICY "Authenticated users can upload to sources bucket"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'sources');
--
-- -- Remove bucket-level file size limit
-- UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'sources';
