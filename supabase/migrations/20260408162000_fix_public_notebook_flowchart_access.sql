-- ============================================================================
-- Fix: Allow public notebook visitors to create/access their own flowcharts
-- Applied: 2026-04-08
--
-- Problem: Non-admin users get permission denied when generating/editing
-- flowcharts in public notebooks because:
--   1. flowcharts RLS policies require get_notebook_role() IS NOT NULL
--   2. get_notebook_role() returns NULL for users who aren't owner/member
--   3. Unlike notebooks/sources tables, flowchart policies have NO public fallback
--
-- Fix: Add OR (notebook is public) fallback to SELECT, INSERT, UPDATE, DELETE policies
--   on flowcharts — matching the pattern used by chat history and notebooks/sources.
--
-- Supabase Best Practices Applied:
--   - (SELECT auth.uid()) scalar subquery caching
--   - DROP POLICY IF EXISTS before CREATE for idempotent re-runs
-- ============================================================================

-- SELECT: Only the user who created the flowchart + must be notebook member OR notebook is public
DROP POLICY IF EXISTS "Private flowchart read access" ON public.flowcharts;
CREATE POLICY "Private flowchart read access"
  ON public.flowcharts FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
        AND notebooks.visibility = 'public'
      )
    )
  );

-- INSERT: Auto-sets user_id via DEFAULT, enforce ownership + notebook membership OR notebook is public
DROP POLICY IF EXISTS "Private flowchart write access" ON public.flowcharts;
CREATE POLICY "Private flowchart write access"
  ON public.flowcharts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
        AND notebooks.visibility = 'public'
      )
    )
  );

-- UPDATE: Only the flowchart owner + must be notebook member OR notebook is public
DROP POLICY IF EXISTS "Private flowchart update access" ON public.flowcharts;
CREATE POLICY "Private flowchart update access"
  ON public.flowcharts FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
        AND notebooks.visibility = 'public'
      )
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
        AND notebooks.visibility = 'public'
      )
    )
  );

-- DELETE: Only the flowchart owner + must be notebook member OR notebook is public
DROP POLICY IF EXISTS "Private flowchart delete access" ON public.flowcharts;
CREATE POLICY "Private flowchart delete access"
  ON public.flowcharts FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
        AND notebooks.visibility = 'public'
      )
    )
  );
