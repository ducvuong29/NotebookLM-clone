-- ============================================================================
-- ROLLBACK: EPIC 4a — Public Notebook RLS Policies
--
-- Reverts: 20260328114000_epic4a_public_notebook_rls.sql
--
-- This script drops the two additive SELECT policies that grant
-- authenticated users access to public notebooks and their sources.
-- After rollback, only notebook owners (and admins) can view notebooks.
--
-- Existing policies remain intact:
--   - "Users can view their own notebooks" (v0.2)
--   - "Admins can view all notebooks" (Epic 3.5)
--   - "Users can view sources from their notebooks" (v0.2)
--   - "Admins can view all sources" (Epic 3.5)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can view public notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Authenticated users can view sources of public notebooks" ON public.sources;
