-- ============================================================================
-- EPIC 3.5 — RLS Admin-Bypass Policies, Visibility Constraint & Index Optimization
-- Applied: 2026-03-28
--
-- Story 3.5.1: RLS Performance Fix & Database Index Optimization
--
-- Changes:
--   1. CHECK constraint on notebooks.visibility ('public', 'private')
--   2. Admin-bypass SELECT policies on: notebooks, sources, notes,
--      n8n_chat_histories, documents
--   3. GIN index on sources.metadata (jsonb_path_ops)
--
-- Supabase Best Practices Applied:
--   - (SELECT public.is_admin()) wrapped in scalar subquery for per-query
--     caching instead of per-row evaluation (5-10x perf)
--     [Ref: security-rls-performance.md]
--   - Idempotent constraint creation via DO block since Postgres does NOT
--     support ADD CONSTRAINT IF NOT EXISTS
--     [Ref: schema-constraints.md]
--   - GIN index with jsonb_path_ops for @> containment queries
--     [Ref: query-index-types.md]
--   - DROP POLICY IF EXISTS before CREATE POLICY for idempotent re-runs
--
-- Dependencies:
--   - 20260325172400_v0.2_optimized.sql (tables, RLS enabled, owner policies)
--   - 20260326_admin_role.sql (is_admin() function, admin policies on profiles)
--   - 20260326195500_add_notebook_visibility.sql (visibility column)
--
-- Rollback: 20260328010000_epic3_5_rls_admin_indexes_rollback.sql
-- Affected tables: notebooks, sources, notes, n8n_chat_histories, documents
--
-- EXPLAIN ANALYZE Notes (before/after):
--   Before: Admin queries on notebooks/sources/notes blocked by RLS
--           (service_role bypass required). No GIN on sources.metadata.
--   After:  Admin SELECT policies allow direct admin queries via
--           is_admin() cached check. GIN index on sources.metadata
--           enables fast @> containment queries for Epic 4a/4b.
-- ============================================================================

-- ============================================================================
-- 1. CHECK CONSTRAINT ON notebooks.visibility
-- ============================================================================
-- Using idempotent DO block because Postgres does not support
-- ADD CONSTRAINT IF NOT EXISTS (would cause syntax error on re-run)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_notebooks_visibility'
    AND conrelid = 'public.notebooks'::regclass
  ) THEN
    ALTER TABLE public.notebooks
      ADD CONSTRAINT chk_notebooks_visibility
      CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

-- ============================================================================
-- 2. ADMIN-BYPASS SELECT POLICIES
-- ============================================================================
-- Pattern: exact replica of "Admins can view all profiles" from
-- 20260326_admin_role.sql (lines 62-65)
--
-- (SELECT public.is_admin()) is wrapped in a scalar subquery so is_admin()
-- is evaluated ONCE per query, not per row (5-10x faster on large tables).
--
-- These are ADDITIVE policies — existing owner-level policies are NOT
-- modified. PostgreSQL RLS uses OR logic between policies for the same
-- operation: a row is visible if ANY policy returns true.
-- ============================================================================

-- ----- NOTEBOOKS -----
DROP POLICY IF EXISTS "Admins can view all notebooks" ON public.notebooks;
CREATE POLICY "Admins can view all notebooks"
  ON public.notebooks FOR SELECT
  USING ((SELECT public.is_admin()));

-- ----- SOURCES -----
DROP POLICY IF EXISTS "Admins can view all sources" ON public.sources;
CREATE POLICY "Admins can view all sources"
  ON public.sources FOR SELECT
  USING ((SELECT public.is_admin()));

-- ----- NOTES -----
DROP POLICY IF EXISTS "Admins can view all notes" ON public.notes;
CREATE POLICY "Admins can view all notes"
  ON public.notes FOR SELECT
  USING ((SELECT public.is_admin()));

-- ----- N8N CHAT HISTORIES -----
DROP POLICY IF EXISTS "Admins can view all chat histories" ON public.n8n_chat_histories;
CREATE POLICY "Admins can view all chat histories"
  ON public.n8n_chat_histories FOR SELECT
  USING ((SELECT public.is_admin()));

-- ----- DOCUMENTS -----
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
CREATE POLICY "Admins can view all documents"
  ON public.documents FOR SELECT
  USING ((SELECT public.is_admin()));

-- ============================================================================
-- 3. GIN INDEX ON sources.metadata
-- ============================================================================
-- jsonb_path_ops is ~60% smaller than default jsonb_ops and optimized for
-- @> containment queries. Needed for Epic 4a/4b metadata-based filtering.
-- documents.metadata already has this index (v0.2_optimized.sql line 131-132).

CREATE INDEX IF NOT EXISTS idx_sources_metadata
  ON public.sources USING gin (metadata jsonb_path_ops);
