-- ============================================================================
-- ROLLBACK: EPIC 4b — Private Chat Sessions per Member
--
-- Reverts: 20260330000000_epic4b_private_chat_session_id.sql
--
-- WARNING: Rolling back text→uuid requires data cleanup.
-- Composite session_id values (e.g., '{notebookId}:{userId}') CANNOT be cast
-- directly to uuid. This rollback strips the ':{userId}' suffix first.
--
-- DATA LOSS: Per-user chat isolation is lost — all chats revert to notebook-level
-- session_id. This is acceptable for rollback since the feature is being undone.
-- ============================================================================

-- 1. Drop trigger and function
DROP TRIGGER IF EXISTS cleanup_notebook_chat_history_trigger ON public.notebooks;
DROP FUNCTION IF EXISTS public.cleanup_notebook_chat_history();

-- 2. Drop new RLS policies
DROP POLICY IF EXISTS "Chat history read access" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history write access" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history delete access" ON public.n8n_chat_histories;

-- 2. Drop expression indexes
DROP INDEX IF EXISTS idx_chat_session_notebook;
DROP INDEX IF EXISTS idx_chat_session_user;

-- 3. Drop CHECK constraint
ALTER TABLE public.n8n_chat_histories DROP CONSTRAINT IF EXISTS chk_session_id_format;

-- 4. Strip userId from composite session_id (revert to plain notebookId)
UPDATE public.n8n_chat_histories
SET session_id = split_part(session_id, ':', 1)
WHERE session_id LIKE '%:%';

-- 5. Drop text index
DROP INDEX IF EXISTS idx_chat_histories_session_id;

-- 6. Revert column type to uuid
ALTER TABLE public.n8n_chat_histories
  ALTER COLUMN session_id TYPE uuid USING session_id::uuid;

-- 7. Recreate original uuid index
CREATE INDEX idx_chat_histories_session_id
  ON public.n8n_chat_histories (session_id);

-- 8. Restore original RLS policies (from epic4b collaboration migration)
CREATE POLICY "Chat history read access"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(session_id::uuid)) IS NOT NULL
  );

CREATE POLICY "Chat history write access"
  ON public.n8n_chat_histories FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(session_id::uuid)) IN ('owner', 'editor', 'admin')
  );

CREATE POLICY "Chat history delete access"
  ON public.n8n_chat_histories FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(session_id::uuid)) IN ('owner', 'admin')
  );
