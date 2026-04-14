-- ============================================================================
-- EPIC 4a — Public Notebook RLS Policies
-- Applied: 2026-03-28
--
-- Story 4a.2: Public Notebook RLS Policies & pgTAP Tests
--
-- Changes:
--   1. New SELECT policy on notebooks: authenticated users can view
--      notebooks with visibility = 'public'
--   2. New SELECT policy on sources: authenticated users can view
--      sources belonging to public notebooks (read-only)
--
-- Design Rationale:
--   These are ADDITIVE policies. PostgreSQL RLS uses OR logic between
--   policies for the same operation on the same role: a row is visible
--   if ANY SELECT policy returns true.
--
--   Existing policies remain untouched:
--     - "Users can view their own notebooks" (v0.2) — owner access
--     - "Admins can view all notebooks" (Epic 3.5) — admin bypass
--     - "Users can view sources from their notebooks" (v0.2) — owner access
--     - "Admins can view all sources" (Epic 3.5) — admin bypass
--
--   INSERT/UPDATE/DELETE policies are NOT changed; only the notebook
--   owner (and admin for some ops) can mutate data.
--
-- Supabase Best Practices Applied:
--   - No per-row function calls — pure column check on indexed column
--     [Ref: security-rls-performance.md]
--   - DROP POLICY IF EXISTS before CREATE for idempotent re-runs
--   - Policies target 'authenticated' role explicitly
--
-- Dependencies:
--   - 20260328033206_epic4a_visibility_tsvector.sql (visibility column)
--   - 20260325172400_v0.2_optimized.sql (tables, RLS enabled)
--
-- Rollback: rollbacks/20260328114000_epic4a_public_notebook_rls_rollback.sql
-- Affected tables: notebooks, sources
-- ============================================================================

-- ============================================================================
-- 1. PUBLIC NOTEBOOKS — SELECT POLICY
-- ============================================================================
-- Any authenticated user can see notebooks with visibility = 'public'.
-- This is a pure column equality check — no function calls, no subqueries —
-- so there is zero per-row overhead. The planner pushes the constant check
-- into the index scan when combined with other filters.

DROP POLICY IF EXISTS "Authenticated users can view public notebooks" ON public.notebooks;
CREATE POLICY "Authenticated users can view public notebooks"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (visibility = 'public');

-- ============================================================================
-- 2. PUBLIC NOTEBOOK SOURCES — SELECT POLICY
-- ============================================================================
-- Any authenticated user can see sources that belong to a public notebook.
-- Uses a correlated EXISTS subquery which is well-optimized by PostgreSQL
-- when idx_sources_notebook_id and the notebooks PK index exist (they do).
--
-- NOTE: This policy grants read-only access. INSERT/UPDATE/DELETE policies
-- on sources still require notebook ownership — unchanged from v0.2.

DROP POLICY IF EXISTS "Authenticated users can view sources of public notebooks" ON public.sources;
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
