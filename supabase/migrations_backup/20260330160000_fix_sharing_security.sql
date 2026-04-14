-- ============================================================================
-- EPIC 4 — Collaboration Sharing Security Hardening
-- Applied: 2026-03-30
--
-- Description:
--   1. Delete all pending/declined notebook members (we only allow direct add).
--   2. Drop status column and invitation_status ENUM.
--   3. Replace get_notebook_role() to remove admin bypass and status check.
--   4. Update RLS policies on notebooks, sources, notes, n8n_chat_histories, 
--      documents, notebook_members to remove 'admin' bypass.
--   5. Update Storage policies (sources and audio buckets) to use get_notebook_role() 
--      for shared notebook access.
-- ============================================================================

-- 1. CLEANUP DATA
DELETE FROM public.notebook_members WHERE status IN ('pending', 'declined');

-- 2. DROP STATUS COLUMN & ENUM
-- Drop policies depending on status first
DROP POLICY IF EXISTS "Pending members can view notebook details" ON public.notebooks;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.notebook_members;

-- Drop partial index
DROP INDEX IF EXISTS notebook_members_pending_idx;

-- Drop status column
ALTER TABLE public.notebook_members DROP COLUMN IF EXISTS status;

-- Drop ENUM
DROP TYPE IF EXISTS invitation_status;

-- 3. REPLACE GET_NOTEBOOK_ROLE
CREATE OR REPLACE FUNCTION public.get_notebook_role(p_notebook_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    -- Owner check
    WHEN (SELECT user_id FROM public.notebooks WHERE id = p_notebook_id) = (SELECT auth.uid())
    THEN 'owner'
    -- Member check (row exists = has access)
    ELSE (
      SELECT role::text FROM public.notebook_members
      WHERE notebook_id = p_notebook_id
      AND user_id = (SELECT auth.uid())
    )
  END
$$;

-- 4. REWRITE RLS POLICIES FOR TABLES
-- Notebook Members
DROP POLICY IF EXISTS "Notebook members visible to notebook participants" ON public.notebook_members;
CREATE POLICY "Notebook members visible to notebook participants"
  ON public.notebook_members FOR SELECT
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IS NOT NULL);

DROP POLICY IF EXISTS "Only notebook owner can invite members" ON public.notebook_members;
CREATE POLICY "Only notebook owner can invite members"
  ON public.notebook_members FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role(notebook_id)) = 'owner');

DROP POLICY IF EXISTS "Owner or admin can update membership" ON public.notebook_members;
CREATE POLICY "Owner can update membership"
  ON public.notebook_members FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) = 'owner');

DROP POLICY IF EXISTS "Only notebook owner can remove members" ON public.notebook_members;
CREATE POLICY "Only notebook owner can remove members"
  ON public.notebook_members FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) = 'owner');

-- Notebooks
DROP POLICY IF EXISTS "Notebook read access" ON public.notebooks;
CREATE POLICY "Notebook read access"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(id)) IS NOT NULL
    OR visibility = 'public'
  );

DROP POLICY IF EXISTS "Users can create their own notebooks" ON public.notebooks;
CREATE POLICY "Users can create their own notebooks"
  ON public.notebooks FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Notebook write access" ON public.notebooks;
CREATE POLICY "Notebook write access"
  ON public.notebooks FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(id)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Notebook delete access" ON public.notebooks;
CREATE POLICY "Notebook delete access"
  ON public.notebooks FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(id)) = 'owner');

-- Sources
DROP POLICY IF EXISTS "Source read access" ON public.sources;
CREATE POLICY "Source read access"
  ON public.sources FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
      AND notebooks.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS "Source write access" ON public.sources;
CREATE POLICY "Source write access"
  ON public.sources FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Source update access" ON public.sources;
CREATE POLICY "Source update access"
  ON public.sources FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Source delete access" ON public.sources;
CREATE POLICY "Source delete access"
  ON public.sources FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) = 'owner');

-- Notes
DROP POLICY IF EXISTS "Note read access" ON public.notes;
CREATE POLICY "Note read access"
  ON public.notes FOR SELECT
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IS NOT NULL);

DROP POLICY IF EXISTS "Note write access" ON public.notes;
CREATE POLICY "Note write access"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Note update access" ON public.notes;
CREATE POLICY "Note update access"
  ON public.notes FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Note delete access" ON public.notes;
CREATE POLICY "Note delete access"
  ON public.notes FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) = 'owner');

-- Documents
DROP POLICY IF EXISTS "Document read access" ON public.documents;
CREATE POLICY "Document read access"
  ON public.documents FOR SELECT
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IS NOT NULL);

DROP POLICY IF EXISTS "Document write access" ON public.documents;
CREATE POLICY "Document write access"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Document update access" ON public.documents;
CREATE POLICY "Document update access"
  ON public.documents FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Document delete access" ON public.documents;
CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) = 'owner');

-- Chat Histories
DROP POLICY IF EXISTS "Chat history read access" ON public.n8n_chat_histories;
CREATE POLICY "Chat history read access"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IS NOT NULL
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Chat history write access" ON public.n8n_chat_histories;
CREATE POLICY "Chat history write access"
  ON public.n8n_chat_histories FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IN ('owner', 'editor')
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Chat history delete access" ON public.n8n_chat_histories;
CREATE POLICY "Chat history delete access"
  ON public.n8n_chat_histories FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) = 'owner'
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

-- 5. STORAGE POLICIES
DROP POLICY IF EXISTS "Users can view their own source files" ON storage.objects;
CREATE POLICY "Members can view source files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sources' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can upload source files to their notebooks" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to sources bucket with size limit" ON storage.objects;
-- Provide write access for owner and editor
CREATE POLICY "Members can upload source files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sources' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IN ('owner', 'editor')
  );

DROP POLICY IF EXISTS "Users can update their own source files" ON storage.objects;
CREATE POLICY "Members can update source files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sources' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IN ('owner', 'editor')
  );

DROP POLICY IF EXISTS "Users can delete their own source files" ON storage.objects;
CREATE POLICY "Owners can delete source files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sources' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) = 'owner'
  );

DROP POLICY IF EXISTS "Users can view their own audio files" ON storage.objects;
CREATE POLICY "Members can view audio files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audio' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can delete their own audio files" ON storage.objects;
CREATE POLICY "Owners can delete audio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio' AND
    (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) = 'owner'
  );
