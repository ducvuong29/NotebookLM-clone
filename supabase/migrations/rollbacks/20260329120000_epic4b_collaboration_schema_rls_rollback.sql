-- ============================================================================
-- ROLLBACK: EPIC 4b — Collaboration Schema & RLS Rewrite
--
-- Reverts all changes from 20260329120000_epic4b_collaboration_schema_rls.sql
-- Restores the RLS policy state to Epic 4a (v0.2 + 3.5 admin + 4a public)
--
-- Order:
--   1. Drop all new (4b) policies on ALL tables
--   2. Recreate original policies (v0.2 + Epic 3.5 + Epic 4a)
--   3. Drop get_notebook_role() function
--   4. Drop notebook_members table (cascades trigger, indexes, constraints)
--   5. Drop ENUM types
--
-- WARNING: This rollback will delete ALL notebook_members data.
-- ============================================================================


-- ============================================================================
-- 1. DROP ALL 4b POLICIES
-- ============================================================================

-- notebook_members (new table — will be dropped, but clean up policies first)
DROP POLICY IF EXISTS "Notebook members visible to notebook participants" ON public.notebook_members;
DROP POLICY IF EXISTS "Only notebook owner can invite members" ON public.notebook_members;
DROP POLICY IF EXISTS "Owner or self can update membership" ON public.notebook_members;
DROP POLICY IF EXISTS "Only notebook owner can remove members" ON public.notebook_members;

-- notebooks
DROP POLICY IF EXISTS "Notebook read access" ON public.notebooks;
DROP POLICY IF EXISTS "Users can create their own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Notebook write access" ON public.notebooks;
DROP POLICY IF EXISTS "Notebook delete access" ON public.notebooks;

-- sources
DROP POLICY IF EXISTS "Source read access" ON public.sources;
DROP POLICY IF EXISTS "Source write access" ON public.sources;
DROP POLICY IF EXISTS "Source update access" ON public.sources;
DROP POLICY IF EXISTS "Source delete access" ON public.sources;

-- notes
DROP POLICY IF EXISTS "Note read access" ON public.notes;
DROP POLICY IF EXISTS "Note write access" ON public.notes;
DROP POLICY IF EXISTS "Note update access" ON public.notes;
DROP POLICY IF EXISTS "Note delete access" ON public.notes;

-- n8n_chat_histories
DROP POLICY IF EXISTS "Chat history read access" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history write access" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history delete access" ON public.n8n_chat_histories;

-- documents
DROP POLICY IF EXISTS "Document read access" ON public.documents;
DROP POLICY IF EXISTS "Document write access" ON public.documents;
DROP POLICY IF EXISTS "Document update access" ON public.documents;
DROP POLICY IF EXISTS "Document delete access" ON public.documents;


-- ============================================================================
-- 2. RESTORE ORIGINAL POLICIES (v0.2 + Epic 3.5 + Epic 4a)
-- ============================================================================

-- ===== NOTEBOOKS (v0.2 owner policies) =====
CREATE POLICY "Users can view their own notebooks"
    ON public.notebooks FOR SELECT
    USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create their own notebooks"
    ON public.notebooks FOR INSERT
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own notebooks"
    ON public.notebooks FOR UPDATE
    USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own notebooks"
    ON public.notebooks FOR DELETE
    USING ((select auth.uid()) = user_id);

-- (Epic 3.5 admin bypass)
CREATE POLICY "Admins can view all notebooks"
  ON public.notebooks FOR SELECT
  USING ((SELECT public.is_admin()));

-- (Epic 4a public notebooks)
CREATE POLICY "Authenticated users can view public notebooks"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (visibility = 'public');


-- ===== SOURCES (v0.2 owner policies) =====
CREATE POLICY "Users can view sources from their notebooks"
    ON public.sources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can create sources in their notebooks"
    ON public.sources FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can update sources in their notebooks"
    ON public.sources FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can delete sources from their notebooks"
    ON public.sources FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

-- (Epic 3.5 admin bypass)
CREATE POLICY "Admins can view all sources"
  ON public.sources FOR SELECT
  USING ((SELECT public.is_admin()));

-- (Epic 4a public notebook sources)
CREATE POLICY "Authenticated users can view sources of public notebooks"
  ON public.sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
      AND notebooks.visibility = 'public'
    )
  );


-- ===== NOTES (v0.2 owner policies) =====
CREATE POLICY "Users can view notes from their notebooks"
    ON public.notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can create notes in their notebooks"
    ON public.notes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can update notes in their notebooks"
    ON public.notes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Users can delete notes from their notebooks"
    ON public.notes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

-- (Epic 3.5 admin bypass)
CREATE POLICY "Admins can view all notes"
  ON public.notes FOR SELECT
  USING ((SELECT public.is_admin()));


-- ===== N8N CHAT HISTORIES (v0.2 owner policies) =====
CREATE POLICY "Users can view chat histories from their notebooks"
    ON public.n8n_chat_histories FOR SELECT
    USING (public.is_notebook_owner(session_id::uuid));

CREATE POLICY "Users can create chat histories in their notebooks"
    ON public.n8n_chat_histories FOR INSERT
    WITH CHECK (public.is_notebook_owner(session_id::uuid));

CREATE POLICY "Users can delete chat histories from their notebooks"
    ON public.n8n_chat_histories FOR DELETE
    USING (public.is_notebook_owner(session_id::uuid));

-- (Epic 3.5 admin bypass)
CREATE POLICY "Admins can view all chat histories"
  ON public.n8n_chat_histories FOR SELECT
  USING ((SELECT public.is_admin()));


-- ===== DOCUMENTS (v0.2 owner policies) =====
CREATE POLICY "Users can view documents from their notebooks"
    ON public.documents FOR SELECT
    USING (public.is_notebook_owner_for_document(metadata));

CREATE POLICY "Users can create documents in their notebooks"
    ON public.documents FOR INSERT
    WITH CHECK (public.is_notebook_owner_for_document(metadata));

CREATE POLICY "Users can update documents in their notebooks"
    ON public.documents FOR UPDATE
    USING (public.is_notebook_owner_for_document(metadata));

CREATE POLICY "Users can delete documents from their notebooks"
    ON public.documents FOR DELETE
    USING (public.is_notebook_owner_for_document(metadata));

-- (Epic 3.5 admin bypass)
CREATE POLICY "Admins can view all documents"
  ON public.documents FOR SELECT
  USING ((SELECT public.is_admin()));


-- ============================================================================
-- 3. DROP FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_notebook_role(UUID);


-- ============================================================================
-- 4. DROP TABLE (cascades trigger, indexes, constraints)
-- ============================================================================

-- Remove from Realtime publication first
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.notebook_members;

DROP TABLE IF EXISTS public.notebook_members CASCADE;


-- ============================================================================
-- 5. DROP ENUM TYPES
-- ============================================================================

DROP TYPE IF EXISTS member_role;
DROP TYPE IF EXISTS invitation_status;
