-- ============================================================================
-- Fix: Allow public notebook visitors to chat
-- Applied: 2026-04-02
--
-- Problem: Non-admin users cannot chat in public notebooks because:
--   1. n8n_chat_histories RLS policies require get_notebook_role() IS NOT NULL
--   2. get_notebook_role() returns NULL for users who aren't owner/member
--   3. Unlike notebooks/sources tables, chat policies have NO public fallback
--
-- Fix: Add OR (notebook is public) fallback to SELECT and DELETE policies
--   on n8n_chat_histories — matching the pattern used by notebooks/sources.
--   INSERT policy is NOT changed because n8n writes via service_role (bypasses RLS).
--
-- Supabase Best Practices Applied:
--   - (SELECT auth.uid()) scalar subquery caching
--   - DROP POLICY IF EXISTS before CREATE for idempotent re-runs
--   - Expression indexes (idx_chat_session_notebook) already exist for
--     NULLIF(split_part(session_id, ':', 1), '')::uuid lookups
--
-- Dependencies:
--   - 20260330000000_epic4b_private_chat_session_id.sql (composite session_id)
--   - 20260330160000_fix_sharing_security.sql (current RLS state)
-- ============================================================================


-- ============================================================================
-- 1. UPDATE SELECT POLICY — Allow reading own chat in public notebooks
-- ============================================================================
-- Before: get_notebook_role() IS NOT NULL AND user_id match
-- After:  (get_notebook_role() IS NOT NULL OR notebook is public) AND user_id match
--
-- The user_id match (split_part = auth.uid()) ALWAYS applies — users can only
-- read their own chat, even in public notebooks. No cross-user data leakage.

DROP POLICY IF EXISTS "Chat history read access" ON public.n8n_chat_histories;
CREATE POLICY "Chat history read access"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = NULLIF(split_part(session_id, ':', 1), '')::uuid
        AND notebooks.visibility = 'public'
      )
    )
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );


-- ============================================================================
-- 2. UPDATE DELETE POLICY — Allow users to clear own chat in public notebooks
-- ============================================================================
-- Before: get_notebook_role() = 'owner' AND user_id match
-- After:  (get_notebook_role() IN ('owner') OR notebook is public) AND user_id match
--
-- This allows public visitors to delete their own chat history (the "Xóa chat"
-- button). They can ONLY delete their own messages (user_id match enforced).

DROP POLICY IF EXISTS "Chat history delete access" ON public.n8n_chat_histories;
CREATE POLICY "Chat history delete access"
  ON public.n8n_chat_histories FOR DELETE
  TO authenticated
  USING (
    (
      (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) = 'owner'
      OR (
        NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.notebooks
          WHERE notebooks.id = NULLIF(split_part(session_id, ':', 1), '')::uuid
          AND notebooks.visibility = 'public'
        )
      )
    )
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );


-- ============================================================================
-- NOTE: INSERT policy is NOT changed
-- ============================================================================
-- The chat message INSERT flow is:
--   User → Edge Function (send-chat-message) → n8n webhook → n8n writes to DB
-- n8n uses its own connection (service_role) which bypasses RLS entirely.
-- The Edge Function already has its own authorization check (updated separately).
-- Therefore, RLS INSERT policy on n8n_chat_histories is irrelevant for this fix.
