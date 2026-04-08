-- ============================================================================
-- Hotfix: Set search_path on match_documents function
-- Resolves Supabase security advisor warning: function_search_path_mutable
-- ============================================================================

CREATE OR REPLACE FUNCTION match_documents (
    query_embedding extensions.vector(1536),
    match_count int DEFAULT null,
    filter jsonb DEFAULT '{}'
) RETURNS TABLE (
    id bigint,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
begin
    return query
    select
        id,
        content,
        metadata,
        1 - (public.documents.embedding <=> query_embedding) as similarity
    from public.documents
    where metadata @> filter
    order by public.documents.embedding <=> query_embedding
    limit match_count;
end;
$$;
