-- /supabase/migrations/xxxx_epic4b_search_users_rpc.sql
-- Function to search users by email or full name for invitation auto-suggest

CREATE OR REPLACE FUNCTION search_users(search_query text, limit_count int DEFAULT 5)
RETURNS TABLE (
  id uuid,
  email varchar,
  full_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id, 
    email, 
    full_name, 
    avatar_url
  FROM profiles
  WHERE 
    email ILIKE '%' || search_query || '%'
    OR full_name ILIKE '%' || search_query || '%'
  LIMIT limit_count;
$$;

-- Ensure only authenticated users can search for other users
REVOKE EXECUTE ON FUNCTION search_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users(text, int) TO service_role;
