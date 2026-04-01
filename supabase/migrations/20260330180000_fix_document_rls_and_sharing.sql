-- ============================================================================
-- EPIC 4 — RLS Cleanup for Documents & Sharing
-- Description:
--   1. Drop lingering old RLS policies on documents to prevent conflicts.
--   2. Enforce the correct 'Document read access' based on get_notebook_role.
-- ============================================================================

-- Tidy up all old policies on documents table
DROP POLICY IF EXISTS "Users can view documents from their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Users can create documents in their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Users can update documents in their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Users can delete documents from their notebooks" ON public.documents;

-- Drop new policies just in case to recreate them cleanly
DROP POLICY IF EXISTS "Document read access" ON public.documents;
DROP POLICY IF EXISTS "Document write access" ON public.documents;
DROP POLICY IF EXISTS "Document update access" ON public.documents;
DROP POLICY IF EXISTS "Document delete access" ON public.documents;

-- Recreate clean policies using get_notebook_role (which supports Owner, Editor, Viewer)
CREATE POLICY "Document read access"
  ON public.documents FOR SELECT
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IS NOT NULL);

CREATE POLICY "Document write access"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor'));

CREATE POLICY "Document update access"
  ON public.documents FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor'));

CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) = 'owner');
