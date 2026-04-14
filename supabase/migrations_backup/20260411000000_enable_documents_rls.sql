-- ============================================================================
-- Fix: Enable RLS on documents table
-- Applied: 2026-04-11
--
-- Problem:
--   The documents table has RLS disabled in the live database.
--   Although policies were written correctly in multiple prior migrations
--   (v0.2, epic4b, fix_document_rls_and_sharing), none of them took effect
--   because RLS was never actually enabled on the live DB — likely due to
--   migration ordering or a manual restore that skipped ALTER TABLE.
--
-- Fix:
--   1. Enable RLS on documents (idempotent)
--   2. Drop any lingering policies from prior failed migrations
--   3. Recreate the correct 4-policy set using get_notebook_role()
--      — consistent with sources, notes, n8n_chat_histories, flowcharts
--
-- Design rationale:
--   - documents.metadata->>'notebook_id' is the FK equivalent for this table
--   - get_notebook_role() is SECURITY DEFINER, handles admin/owner/editor/viewer
--   - NO public fallback needed: documents (embeddings) are always private;
--     public notebook visitors access content via match_documents() through
--     n8n which uses service_role (bypasses RLS entirely)
--   - service_role (n8n upsert, admin-api cascade delete) bypass RLS — safe
--
-- Supabase Best Practices Applied:
--   - (SELECT public.get_notebook_role(...)) scalar subquery caching (security-rls-performance.md)
--   - DROP POLICY IF EXISTS before CREATE for idempotent re-runs
--   - TO authenticated on all policies (never PUBLIC)
--   - SECURITY DEFINER function delegates auth — no direct auth.uid() in policy
--
-- Dependencies:
--   - 20260325172400_v0.2_optimized.sql (documents table, RLS enabled)
--   - 20260329120000_epic4b_collaboration_schema_rls.sql (get_notebook_role)
--   - 20260330180000_fix_document_rls_and_sharing.sql (previous policy attempts)
--
-- Impact on other parts:
--   - n8n Upsert (service_role)     → UNAFFECTED (bypasses RLS)
--   - n8n Chat RAG (service_role)   → UNAFFECTED (bypasses RLS)
--   - match_documents() RPC         → NOW FILTERED by RLS per caller's identity
--     (SECURITY INVOKER → runs as authenticated user → policy applies)
--   - admin-api DELETE cascade      → UNAFFECTED (service_role)
--   - Frontend direct REST access   → NOW PROTECTED (was open before)
-- ============================================================================


-- 1. Enable RLS (idempotent — safe to run even if already enabled)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;


-- 2. Drop all existing policies (idempotent cleanup)
DROP POLICY IF EXISTS "Users can view documents from their notebooks"   ON public.documents;
DROP POLICY IF EXISTS "Users can create documents in their notebooks"   ON public.documents;
DROP POLICY IF EXISTS "Users can update documents in their notebooks"   ON public.documents;
DROP POLICY IF EXISTS "Users can delete documents from their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents"                   ON public.documents;
DROP POLICY IF EXISTS "Document read access"                            ON public.documents;
DROP POLICY IF EXISTS "Document write access"                           ON public.documents;
DROP POLICY IF EXISTS "Document update access"                          ON public.documents;
DROP POLICY IF EXISTS "Document delete access"                          ON public.documents;


-- 3. Recreate correct policies using get_notebook_role()
--    Pattern: consistent with sources, notes, n8n_chat_histories

-- SELECT: any notebook participant (owner, editor, viewer, admin)
CREATE POLICY "Document read access"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IS NOT NULL
  );

-- INSERT: owner, editor, or admin only
CREATE POLICY "Document write access"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor', 'admin')
  );

-- UPDATE: owner, editor, or admin only
CREATE POLICY "Document update access"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner or admin only
CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'admin')
  );


-- ============================================================================
-- VERIFICATION QUERIES (run manually after migration to confirm)
-- ============================================================================
-- 1. Check RLS is enabled:
--    SELECT rls_enabled FROM pg_tables
--    WHERE schemaname = 'public' AND tablename = 'documents';
--    → Expected: true
--
-- 2. Check all 4 policies exist:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'documents'
--    ORDER BY policyname;
--    → Expected: 4 rows (read, write, update, delete)
--
-- 3. Test as authenticated user (should only see own notebook docs):
--    SET LOCAL role TO authenticated;
--    SET LOCAL request.jwt.claims TO '{"sub":"<user-uuid>","role":"authenticated"}';
--    SELECT COUNT(*) FROM documents; -- should return subset, not all 80
