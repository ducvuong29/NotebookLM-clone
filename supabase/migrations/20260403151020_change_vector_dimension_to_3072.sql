-- Drop existing objects
DROP FUNCTION IF EXISTS match_documents(vector(1536), int, jsonb);
DROP TABLE IF EXISTS documents;

-- Recreate table with 3072 dimensions
CREATE TABLE documents (
    id bigint primary key generated always as identity,
    content text,
    metadata jsonb,
    embedding vector (3072)
);

-- Recreate match_documents function with 3072 dimensions
CREATE OR REPLACE FUNCTION match_documents (
    query_embedding vector (3072),
    match_count int DEFAULT null,
    filter jsonb DEFAULT '{}'
) RETURNS TABLE (
    id bigint,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
begin
    return query
    select
        id,
        content,
        metadata,
        1 - (documents.embedding <=> query_embedding) as similarity
    from documents
    where metadata @> filter
    order by documents.embedding <=> query_embedding
    limit match_count;
end;
$$;