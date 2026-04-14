-- ============================================================================
-- FIX: Add input validation to search_notebook_content RPC
-- ============================================================================
-- Risk: Authenticated users could submit huge search_query (1MB+) or
--       max_results=999999 to cause resource exhaustion (DoS).
--
-- Frontend always sends max_results=50 with debounce, but the raw
-- RPC endpoint is accessible to any authenticated user directly.
--
-- Changes:
--   1. Switch from LANGUAGE sql to LANGUAGE plpgsql for validation logic
--   2. Add guard: search_query must be 1-500 chars
--   3. Add cap: max_results capped at 50 (LEAST())
--   4. Add guard: empty/blank query returns empty immediately
-- ============================================================================

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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER   -- RLS on sources + notebooks applies automatically
SET search_path = ''
AS $$
DECLARE
  v_query text;
  v_limit integer;
BEGIN
  -- 1. Sanitize and validate search_query
  v_query := trim(search_query);

  -- Guard: empty query → return nothing (no DB work)
  IF v_query = '' OR v_query IS NULL THEN
    RETURN;
  END IF;

  -- Guard: query too long → reject (prevents plainto_tsquery CPU abuse)
  IF length(v_query) > 500 THEN
    RAISE EXCEPTION 'Search query too long (max 500 characters)';
  END IF;

  -- 2. Cap max_results to prevent runaway LIMIT
  v_limit := LEAST(COALESCE(max_results, 50), 50);
  IF v_limit < 1 THEN v_limit := 50; END IF;

  -- 3. Execute the search
  RETURN QUERY
  WITH matches AS (
    SELECT
      s.notebook_id,
      s.title AS source_title,
      ts_headline('simple', s.content,
        plainto_tsquery('simple', v_query),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15'
      ) AS source_snippet,
      ts_rank(s.content_search, plainto_tsquery('simple', v_query)) AS rank,
      ROW_NUMBER() OVER (
        PARTITION BY s.notebook_id
        ORDER BY ts_rank(s.content_search, plainto_tsquery('simple', v_query)) DESC
      ) AS rn,
      COUNT(*) OVER (PARTITION BY s.notebook_id) AS match_count
    FROM public.sources s
    WHERE s.content_search @@ plainto_tsquery('simple', v_query)
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
  LIMIT v_limit;
END;
$$;
