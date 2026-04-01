-- ============================================================================
-- STORY 5-2 Enhancement: Full-Text Search on Source Content
-- Applied: 2026-03-31
--
-- Description:
--   1. Add content_search tsvector GENERATED column on sources (title+summary+content)
--   2. Create GIN index for fast full-text search
--   3. Create search_notebook_content() RPC function:
--      - FTS on sources.content_search
--      - JOIN to notebooks for metadata
--      - ts_headline() for snippet with <mark> highlighting
--      - Groups by notebook (best matching source per notebook)
--      - RLS applies automatically (SECURITY INVOKER)
-- ============================================================================

-- 1. Add content_search tsvector column (auto-update on INSERT/UPDATE)
ALTER TABLE public.sources
ADD COLUMN IF NOT EXISTS content_search tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

-- 2. Create GIN index for full-text search  [query-missing-indexes rule]
CREATE INDEX IF NOT EXISTS idx_sources_content_search
  ON public.sources USING GIN(content_search);

-- 3. Create search RPC function
--    SECURITY INVOKER (default) — RLS on sources + notebooks applies automatically
--    get_notebook_role() handles owner/editor/viewer + public notebooks
CREATE OR REPLACE FUNCTION public.search_notebook_content(
  search_query text,
  max_results integer DEFAULT 50
)
RETURNS TABLE(
  notebook_id uuid,
  notebook_title text,
  notebook_description text,
  notebook_icon text,
  notebook_color text,
  notebook_visibility text,
  notebook_updated_at timestamptz,
  source_title text,
  source_snippet text,
  match_count bigint,
  match_rank real
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH matches AS (
    SELECT
      s.notebook_id,
      s.title AS source_title,
      ts_headline('simple', s.content,
        plainto_tsquery('simple', search_query),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15'
      ) AS source_snippet,
      ts_rank(s.content_search, plainto_tsquery('simple', search_query)) AS rank,
      ROW_NUMBER() OVER (
        PARTITION BY s.notebook_id
        ORDER BY ts_rank(s.content_search, plainto_tsquery('simple', search_query)) DESC
      ) AS rn,
      COUNT(*) OVER (PARTITION BY s.notebook_id) AS match_count
    FROM public.sources s
    WHERE s.content_search @@ plainto_tsquery('simple', search_query)
      AND s.processing_status = 'completed'
  )
  SELECT
    n.id AS notebook_id,
    n.title AS notebook_title,
    n.description AS notebook_description,
    n.icon AS notebook_icon,
    n.color AS notebook_color,
    n.visibility AS notebook_visibility,
    n.updated_at AS notebook_updated_at,
    m.source_title,
    m.source_snippet,
    m.match_count,
    m.rank AS match_rank
  FROM matches m
  JOIN public.notebooks n ON n.id = m.notebook_id
  WHERE m.rn = 1  -- Best matching source per notebook
  ORDER BY m.rank DESC
  LIMIT max_results;
$$;
