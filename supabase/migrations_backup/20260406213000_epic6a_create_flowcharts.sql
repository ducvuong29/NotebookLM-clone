-- ============================================================================
-- EPIC 6A — Flowchart Database Schema & RLS
-- Applied: 2026-04-06
--
-- Story 6.2: Flowchart Database Schema & RLS
--
-- Changes:
--   1. CREATE TABLE flowcharts (UUID PK, FKs, indexes, constraints)
--   2. Private-per-user RLS policies (same pattern as private_notes)
--   3. Enable Realtime publication
--
-- RLS Model: PRIVATE PER USER
--   Flowcharts belong to individual users within a notebook.
--   Each user creates/reads/updates/deletes only their OWN flowcharts.
--   Any notebook member (owner/editor/viewer) can operate on their own data.
--   Pattern source: 20260331000004_private_notes.sql
--
-- Supabase Best Practices Applied:
--   - Dual condition: user_id = (SELECT auth.uid()) AND notebook membership check
--   - get_notebook_role() with (SELECT auth.uid()) caching (security-rls-performance)
--   - FK indexes on notebook_id, source_id, user_id (schema-foreign-key-indexes)
--   - Composite index on (notebook_id, user_id) for per-user queries
--   - Unique constraint on (source_id, user_id) — 1 flowchart per source per user
--   - Partial index on generation_status (query-partial-indexes)
--   - DROP POLICY IF EXISTS for idempotent re-runs
--   - TO authenticated on all policies (never PUBLIC)
--   - CHECK constraint for generation_status enum validation
--
-- Dependencies:
--   - 20260325172400_v0.2_optimized.sql (base schema, update_updated_at_column)
--   - 20260329120000_epic4b_collaboration_schema_rls.sql (get_notebook_role function)
--   - 20260331000004_private_notes.sql (RLS pattern reference)
--
-- Affected tables: flowcharts (NEW)
-- ============================================================================


-- ============================================================================
-- 1. CREATE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.flowcharts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mermaid_code TEXT NOT NULL DEFAULT '',
  summary TEXT DEFAULT '',
  title TEXT DEFAULT '',
  generation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- FK Indexes (per schema-foreign-key-indexes — Postgres does NOT auto-index FKs!)
-- Impact: 10-100x faster JOINs and ON DELETE CASCADE operations
CREATE INDEX IF NOT EXISTS idx_flowcharts_notebook_id
  ON public.flowcharts(notebook_id);
CREATE INDEX IF NOT EXISTS idx_flowcharts_source_id
  ON public.flowcharts(source_id);
CREATE INDEX IF NOT EXISTS idx_flowcharts_user_id
  ON public.flowcharts(user_id);

-- Composite index: fast lookup for "my flowcharts in this notebook" queries
-- (per private_notes pattern: idx_notes_notebook_user)
CREATE INDEX IF NOT EXISTS idx_flowcharts_notebook_user
  ON public.flowcharts(notebook_id, user_id);

-- Unique constraint: 1 flowchart per source PER USER (private model)
-- Different users can each generate their own flowchart from the same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_flowcharts_source_user_unique
  ON public.flowcharts(source_id, user_id);

-- Partial index: Only index actively-generating flowcharts for status polling
-- Per: query-partial-indexes — 5-20x smaller index than full coverage
CREATE INDEX IF NOT EXISTS idx_flowcharts_generating
  ON public.flowcharts(generation_status)
  WHERE generation_status = 'generating';

-- updated_at trigger (reuse existing function from v0.2 base migration)
-- ⚠️ The function is named update_updated_at_column(), NOT handle_updated_at()
DROP TRIGGER IF EXISTS update_flowcharts_updated_at ON public.flowcharts;
CREATE TRIGGER update_flowcharts_updated_at
  BEFORE UPDATE ON public.flowcharts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2. RLS POLICIES — PRIVATE PER USER
-- ============================================================================
-- Pattern: private_notes (20260331000004_private_notes.sql)
-- Dual condition: user owns the flowchart AND user is a notebook member (any role)
-- This means owner/editor/viewer can ALL create flowcharts — but only see their OWN

ALTER TABLE public.flowcharts ENABLE ROW LEVEL SECURITY;

-- SELECT: Only the user who created the flowchart + must be notebook member
DROP POLICY IF EXISTS "Private flowchart read access" ON public.flowcharts;
CREATE POLICY "Private flowchart read access"
  ON public.flowcharts FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- INSERT: Auto-sets user_id via DEFAULT, enforce ownership + notebook membership
DROP POLICY IF EXISTS "Private flowchart write access" ON public.flowcharts;
CREATE POLICY "Private flowchart write access"
  ON public.flowcharts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- UPDATE: Only the flowchart owner + must be notebook member
DROP POLICY IF EXISTS "Private flowchart update access" ON public.flowcharts;
CREATE POLICY "Private flowchart update access"
  ON public.flowcharts FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- DELETE: Only the flowchart owner + must be notebook member
DROP POLICY IF EXISTS "Private flowchart delete access" ON public.flowcharts;
CREATE POLICY "Private flowchart delete access"
  ON public.flowcharts FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );


-- ============================================================================
-- 3. REALTIME
-- ============================================================================
-- Required for useFlowchart hook's Realtime subscription (Story 6.5+)

ALTER TABLE public.flowcharts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flowcharts;
