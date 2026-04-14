-- ============================================================================
-- FIX: Correct SET search_path in get_admin_users function
-- ============================================================================
-- Bug: get_admin_users was using SET search_path = public instead of SET search_path = ''
-- Risk: Privilege escalation — a SECURITY DEFINER function with unqualified search_path
--       can be exploited via schema shadowing attacks.
-- Fix: Replace with SET search_path = '' and fully qualify all table references.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_admin_users(
  page_num INT DEFAULT 1,
  page_size INT DEFAULT 25,
  search_query TEXT DEFAULT ''
)
RETURNS TABLE (
  id UUID,
  email VARCHAR,
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  is_disabled BOOLEAN,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''  -- FIX: was 'public', must be empty for SECURITY DEFINER safety
AS $$
DECLARE
  v_role TEXT;
  v_offset INT;
  v_search TEXT;
BEGIN
  -- 1. Security: Only admin role can call this function
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied. You do not have admin privileges.';
  END IF;

  -- 2. Calculate offset & filter (Pagination & Filter)
  v_offset := (page_num - 1) * page_size;
  IF v_offset < 0 THEN v_offset := 0; END IF;
  
  v_search := '%' || trim(search_query) || '%';
  IF trim(search_query) = '' THEN
    v_search := NULL;
  END IF;

  -- 3. Return results (Join auth.users and public.profiles)
  RETURN QUERY
  SELECT 
    u.id, 
    u.email::VARCHAR as email, 
    COALESCE(p.full_name, (u.raw_user_meta_data->>'full_name')::TEXT) as full_name, 
    p.role, 
    u.created_at, 
    u.last_sign_in_at, 
    (u.banned_until IS NOT NULL) as is_disabled,
    count(*) OVER() as total_count
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE 
    v_search IS NULL OR 
    u.email ILIKE v_search OR 
    COALESCE(p.full_name, (u.raw_user_meta_data->>'full_name')::TEXT) ILIKE v_search
  ORDER BY u.created_at DESC
  LIMIT page_size
  OFFSET v_offset;
END;
$$;

-- Re-grant execute permission (CREATE OR REPLACE resets it)
GRANT EXECUTE ON FUNCTION get_admin_users TO authenticated;
