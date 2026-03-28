-- ============================================================================
-- ROLLBACK — Epic 3.5 RLS Admin-Bypass Policies, Constraint & Index
-- Reverts: 20260328010000_epic3_5_rls_admin_indexes.sql
--
-- Run these statements in order to cleanly revert all changes.
-- Safe to run multiple times (all operations are idempotent).
-- ============================================================================

-- 1. DROP admin-bypass SELECT policies
DROP POLICY IF EXISTS "Admins can view all notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Admins can view all sources" ON public.sources;
DROP POLICY IF EXISTS "Admins can view all notes" ON public.notes;
DROP POLICY IF EXISTS "Admins can view all chat histories" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;

-- 2. DROP CHECK constraint on notebooks.visibility
ALTER TABLE public.notebooks DROP CONSTRAINT IF EXISTS chk_notebooks_visibility;

-- 3. DROP GIN index on sources.metadata
DROP INDEX IF EXISTS idx_sources_metadata;
