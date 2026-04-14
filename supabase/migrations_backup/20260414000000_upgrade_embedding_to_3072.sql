-- ============================================================
-- Migration: Upgrade embedding dimension 1536 → 3072
-- Reason:    Switch from text-embedding-ada-002 / text-embedding-3-small (1536 dims)
--            to text-embedding-3-large (3072 dims)
-- Impact:    - All existing vectors in documents table will be DELETED
--            - All documents must be re-embedded by re-ingesting sources
-- ============================================================

-- STEP 1: Drop existing IVFFlat index (if any) before altering column type
DROP INDEX IF EXISTS public.documents_embedding_idx;

-- STEP 2: Drop the old match_documents function (signature changes)
DROP FUNCTION IF EXISTS public.match_documents(vector, integer, jsonb);

-- STEP 3: Truncate all existing vector data
-- ⚠️ WARNING: This deletes all rows from the documents table (vector store).
-- Re-ingest all sources after running this migration.
TRUNCATE TABLE public.documents;

-- STEP 4: Alter the embedding column to 3072 dimensions
ALTER TABLE public.documents
  ALTER COLUMN embedding TYPE extensions.vector(3072)
    USING embedding::text::extensions.vector(3072);

-- STEP 5: Recreate the match_documents RPC function with new dimension
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding extensions.vector(3072),
  match_count     integer  DEFAULT NULL,
  filter          jsonb    DEFAULT '{}'
)
RETURNS TABLE (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.documents.id,
    public.documents.content,
    public.documents.metadata,
    1 - (public.documents.embedding <=> query_embedding) AS similarity
  FROM public.documents
  WHERE public.documents.metadata @> filter
  ORDER BY public.documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- STEP 6: Re-grant permissions (match existing grants)
GRANT ALL ON FUNCTION public.match_documents(extensions.vector(3072), integer, jsonb)
  TO anon;
GRANT ALL ON FUNCTION public.match_documents(extensions.vector(3072), integer, jsonb)
  TO authenticated;
GRANT ALL ON FUNCTION public.match_documents(extensions.vector(3072), integer, jsonb)
  TO service_role;

-- STEP 7: Skip index creation
-- pgvector on this Supabase instance limits both IVFFlat and HNSW to 2000 dimensions.
-- text-embedding-3-large = 3072 dims → indexing not supported on this version.
-- Since the table will be empty after migration, no index is needed right now.
-- Sequential scan (exact search) will be used — acceptable for small datasets.
--
-- To add an index later (when pgvector is upgraded), run:
-- CREATE INDEX documents_embedding_idx
--   ON public.documents
--   USING hnsw (embedding extensions.vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);


-- ============================================================
-- Post-migration checklist:
-- 1. ✅ Run this SQL in Supabase SQL Editor
-- 2. ✅ Confirm: SELECT typmod FROM pg_attribute
--              JOIN pg_class ON attrelid = pg_class.oid
--              WHERE relname = 'documents' AND attname = 'embedding';
--    → Should return 3073 (= 3072 + 1 internal offset)
-- 3. ✅ Re-import all n8n workflows (updated JSONs in /n8n folder)
-- 4. ✅ Re-trigger vector ingestion for every source via n8n
--    (Upsert to Vector Store workflow will now produce 3072-dim vectors)
-- ============================================================
