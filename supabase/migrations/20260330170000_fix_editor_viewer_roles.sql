-- ============================================================================
-- EPIC 4 — Editor and Viewer Role Adjustments
-- Applied: 2026-03-30
--
-- Description:
--   1. Allow viewers to chat (Chat History Insert access).
--   2. Allow editors to delete sources (Sources Delete access).
--   3. Allow editors to delete notes, documents, and related storage.
-- ============================================================================

-- Chat Histories
DROP POLICY IF EXISTS "Chat history write access" ON public.n8n_chat_histories;
CREATE POLICY "Chat history write access"
  ON public.n8n_chat_histories FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Viewers, editors, and owners can chat.
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IS NOT NULL
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

-- Sources
DROP POLICY IF EXISTS "Source delete access" ON public.sources;
CREATE POLICY "Source delete access"
  ON public.sources FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor'));

-- Notes
DROP POLICY IF EXISTS "Note delete access" ON public.notes;
CREATE POLICY "Note delete access"
  ON public.notes FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor'));

-- Documents
DROP POLICY IF EXISTS "Document delete access" ON public.documents;
CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor'));

-- Storage
DROP POLICY IF EXISTS "Owners can delete source files" ON storage.objects;
CREATE POLICY "Members can delete source files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sources' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IN ('owner', 'editor')
  );

DROP POLICY IF EXISTS "Owners can delete audio files" ON storage.objects;
CREATE POLICY "Members can delete audio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IN ('owner', 'editor')
  );
