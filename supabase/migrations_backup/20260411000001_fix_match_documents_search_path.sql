-- ============================================================================
-- Fix: Set immutable search_path on match_documents function
-- Applied: 2026-04-11
--
-- Problem:
--   Supabase Security Advisor flags match_documents as having a mutable
--   search_path (function_search_path_mutable). A mutable search_path allows
--   a malicious user to shadow objects (tables, operators) by creating
--   identically-named objects in a schema that appears earlier in the path.
--
-- Previous attempt (20260406214500) was reverted because:
--   SET search_path = ''  →  "42883: operator does not exist: vector <=> vector"
--   The <=> cosine distance operator is registered in the `extensions` schema
--   (where pgvector lives in Supabase), so an empty search_path cannot resolve it.
--
-- Fix:
--   SET search_path = public, extensions
--   - `public`     → resolves public.documents table
--   - `extensions` → resolves vector type and <=> operator from pgvector
--
-- Additional improvements vs v0.2 base:
--   - LANGUAGE sql (simpler, planner-visible, no overhead of PL/pgSQL block)
--   - SECURITY INVOKER (explicit; was already the default — ensures RLS applies
--     when called by an authenticated user via PostgREST/rpc endpoint)
--   - STABLE volatility marker (result doesn't change within single statement —
--     allows query planner to optimize repeated calls)
--   - Fully-qualified parameter type: extensions.vector(1536)
--   - Fully-qualified table reference inside body: public.documents
--
-- Embedding model: OpenAI text-embedding-ada-002 → 1536 dimensions
--   (n8n node: @n8n/n8n-nodes-langchain.embeddingsOpenAi, options: {})
--
-- Dependencies:
--   - 20260325172400_v0.2_optimized.sql (match_documents original definition)
--   - 20260406214500_fix_match_documents_search_path.sql (previous reverted attempt)
--   - 20260411000000_enable_documents_rls.sql (RLS now active on documents)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding extensions.vector(1536),
  match_count     integer DEFAULT NULL,
  filter          jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    public.documents.id,
    public.documents.content,
    public.documents.metadata,
    1 - (public.documents.embedding <=> query_embedding) AS similarity
  FROM public.documents
  WHERE public.documents.metadata @> filter
  ORDER BY public.documents.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================================================
-- 1. Confirm search_path is pinned:
--    SELECT proname, proconfig
--    FROM pg_proc
--    WHERE proname = 'match_documents' AND pronamespace = 'public'::regnamespace;
--    → proconfig should contain: search_path=public,extensions
--
-- 2. Confirm Supabase Security Advisor no longer flags this function:
--    (Re-run advisor after migration — may take a few minutes to refresh)
--
-- 3. Smoke-test via PostgREST (replace values as needed):
--    POST /rest/v1/rpc/match_documents
--    { "query_embedding": [...1536 floats...], "match_count": 5, "filter": {"notebook_id": "<uuid>"} }
--    → Should return rows with id, content, metadata, similarity
