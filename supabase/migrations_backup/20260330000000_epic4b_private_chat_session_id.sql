-- ============================================================================
-- EPIC 4b — Private Chat Sessions per Member
-- Applied: 2026-03-30
--
-- Story 4b.4: Private Chat Sessions per Member
--
-- Changes:
--   1. DROP existing RLS policies on n8n_chat_histories (prerequisite for ALTER)
--   2. ALTER session_id from uuid to text (metadata-only, fast)
--   3. Backward-compat UPDATE: existing rows → {notebookId}:{ownerId}
--   4. CHECK constraint: session_id LIKE '%:%' (data integrity)
--   5. Drop old uuid index, create new btree text index
--   6. Expression indexes for RLS hot path (split_part)
--   7. Recreate RLS policies for composite session_id + user isolation
--
-- Supabase Best Practices Applied:
--   - query-missing-indexes: btree text index on session_id
--   - security-rls-performance: (SELECT auth.uid()) caching, expression indexes
--   - schema-constraints: CHECK constraint on session_id format
--   - schema-data-types: uuid→text trade-off documented, expression indexes compensate
--   - lock-short-transactions: ALTER TYPE is metadata-only (fast)
--
-- Dependencies:
--   - 20260325172400_v0.2_optimized.sql (base schema, session_id uuid)
--   - 20260329120000_epic4b_collaboration_schema_rls.sql (get_notebook_role(), current RLS)
--
-- Rollback: rollbacks/20260330000000_epic4b_private_chat_session_id_rollback.sql
-- ============================================================================


-- ============================================================================
-- 1. DROP existing RLS policies on n8n_chat_histories
-- ============================================================================
-- MUST drop policies BEFORE ALTER COLUMN TYPE — Postgres does not allow
-- altering a column type if any policy references it.

DROP POLICY IF EXISTS "Chat history read access" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history write access" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history delete access" ON public.n8n_chat_histories;


-- ============================================================================
-- 2. DROP old index (references uuid type)
-- ============================================================================

DROP INDEX IF EXISTS idx_chat_histories_session_id;


-- ============================================================================
-- 3. ALTER session_id: uuid → text
-- ============================================================================
-- Metadata-only change (USING clause converts existing values to text).
-- Per lock-short-transactions: fast, no table rewrite needed for small tables.

ALTER TABLE public.n8n_chat_histories
  ALTER COLUMN session_id TYPE text USING session_id::text;


-- ============================================================================
-- 4. BACKWARD COMPATIBILITY — Migrate existing rows
-- ============================================================================
-- Existing chat history has session_id = plain UUID (notebookId only).
-- These chats belong to the notebook owner (only user who could chat before
-- collaboration was introduced).
--
-- Converts: '{notebookId}' → '{notebookId}:{ownerId}'
-- Guard: only migrates rows NOT already in composite format.

UPDATE public.n8n_chat_histories h
SET session_id = h.session_id || ':' || n.user_id::text
FROM public.notebooks n
WHERE n.id::text = h.session_id
  AND h.session_id NOT LIKE '%:%';


-- ============================================================================
-- 5. CHECK CONSTRAINT — Enforce composite format
-- ============================================================================
-- Per schema-constraints: prevents silent data corruption from wrong format.
-- Prevents migration from failing by removing orphaned chat histories.

DELETE FROM public.n8n_chat_histories
WHERE session_id NOT LIKE '%:%';

ALTER TABLE public.n8n_chat_histories
  ADD CONSTRAINT chk_session_id_format CHECK (session_id LIKE '%:%');


-- ============================================================================
-- 6. INDEXES — Create text indexes + expression indexes
-- ============================================================================

-- New btree text index for exact-match queries (queryFn, Realtime filter)
-- Per query-missing-indexes (CRITICAL): 100-1000x faster on large tables
CREATE INDEX idx_chat_histories_session_id
  ON public.n8n_chat_histories (session_id);

-- Expression index: extract notebookId for RLS notebook role check
-- Per security-rls-performance: avoids per-row split_part() evaluation
CREATE INDEX idx_chat_session_notebook
  ON public.n8n_chat_histories (( NULLIF(split_part(session_id, ':', 1), '')::uuid ));

-- Expression index: extract userId for RLS user isolation check
-- Per security-rls-performance: RLS user check uses index scan, not seq scan
CREATE INDEX idx_chat_session_user
  ON public.n8n_chat_histories (( NULLIF(split_part(session_id, ':', 2), '')::uuid ));


-- ============================================================================
-- 7. RLS POLICY REWRITE — n8n_chat_histories
-- ============================================================================
-- Recreate with composite session_id parsing + user isolation.
--
-- Pattern: split_part(session_id, ':', 1)::uuid — extracts notebookId
--          split_part(session_id, ':', 2)::uuid — extracts userId
-- Per security-rls-performance: (SELECT auth.uid()) cached per-query.
-- Per security-rls-performance: get_notebook_role() for indexed lookup.

-- SELECT: user can read their own chat in notebooks they belong to
-- Admin bypass: admin role allows reading ALL chats (no user isolation)
CREATE POLICY "Chat history read access"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IS NOT NULL
    AND (
      NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
      OR (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) = 'admin'
    )
  );

-- INSERT: owner/editor/admin can write chat, but only under their own userId
CREATE POLICY "Chat history write access"
  ON public.n8n_chat_histories FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IN ('owner', 'editor', 'admin')
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

-- DELETE: owner/admin can delete their own chat only
-- Admin bypass: admin can delete ANY chat
CREATE POLICY "Chat history delete access"
  ON public.n8n_chat_histories FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IN ('owner', 'admin')
    AND (
      NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
      OR (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) = 'admin'
    )
  );


-- ============================================================================
-- 8. ORPHAN CLEANUP TRIGGER — Delete chat history when notebook is deleted
-- ============================================================================
-- Since session_id is a composite text key (cannot use regular Foreign Key),
-- we use a trigger to cascade notebook deletions to chat histories.

CREATE OR REPLACE FUNCTION public.cleanup_notebook_chat_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.n8n_chat_histories
  WHERE session_id LIKE OLD.id::text || ':%';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_notebook_chat_history_trigger ON public.notebooks;
CREATE TRIGGER cleanup_notebook_chat_history_trigger
  AFTER DELETE ON public.notebooks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_notebook_chat_history();
