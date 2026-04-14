-- Migration: Fix storage bucket MIME types to include Excel formats
-- Date: 2026-04-11
-- Issue: XLSX uploads returned HTTP 400 because 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
--        was missing from the bucket's allowed_mime_types list.
--        Also removes DOCX from allowed types since it is intentionally unsupported.

-- ============================================================
-- UP MIGRATION
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  -- Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  -- Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
  'application/vnd.ms-excel',                                             -- .xls
  -- Audio
  'audio/mpeg',   -- .mp3
  'audio/wav',    -- .wav
  'audio/mp4',    -- .mp4 / .m4a
  'audio/m4a',    -- .m4a (some browsers)
  'audio/ogg'     -- .ogg
  -- NOTE: DOCX (.docx) intentionally excluded — n8n extractFromFile has no DOCX operation.
  -- Frontend (AddSourcesDialog.tsx) already blocks .docx with a clear error message.
]
WHERE id = 'sources';

-- ============================================================
-- DOWN MIGRATION
-- ============================================================
-- To revert, restore the original allowed_mime_types:
--
-- UPDATE storage.buckets
-- SET allowed_mime_types = ARRAY[
--   'application/pdf',
--   'text/plain',
--   'text/csv',
--   'application/msword',
--   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--   'audio/mpeg',
--   'audio/wav',
--   'audio/mp4',
--   'audio/m4a'
-- ]
-- WHERE id = 'sources';
