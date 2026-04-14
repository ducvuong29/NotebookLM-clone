-- ============================================================
-- Migration: Add HNSW index via halfvec cast for 3072-dim embeddings
--
-- Problem:  pgvector limits IVFFlat and HNSW to 2000 dimensions on native vectors.
-- Solution: Cast float32 vector → halfvec(3072) for indexing.
--           halfvec stores each dimension as 16-bit float (half precision),
--           effectively halving memory usage and bypassing the dim limit.
--           The source column remains full-precision vector(3072).
--
-- Requires: pgvector >= 0.7.0 (Supabase supports this since early 2024)
-- ============================================================

CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON public.documents
  USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- Verify index was created:
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'documents';
-- ============================================================
