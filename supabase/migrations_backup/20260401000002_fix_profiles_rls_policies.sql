-- ============================================================================
-- FIX: Consolidate profiles RLS policies to eliminate multiple permissive
-- policies on the same table/role/action combination
-- ============================================================================
-- Root cause: Two separate SELECT policies exist for profiles:
--   1. "Users can view their own profile" → USING (auth.uid() = id)
--   2. "Admins can view all profiles"     → USING (is_admin())
-- And two UPDATE policies:
--   1. "Users can update their own profile" → USING (auth.uid() = id)
--   2. "Admins can update all profiles"     → USING (is_admin())
--
-- PostgreSQL evaluates BOTH permissive policies per row (OR logic), causing
-- double execution overhead. Supabase advisor confirms this as WARN on production.
--
-- Fix: Drop all 4 and replace with 2 consolidated policies using OR logic inline.
-- ============================================================================

-- 1. Drop existing split policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- 2. Consolidated SELECT policy: own profile OR admin
CREATE POLICY "profiles_select_policy"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (SELECT public.is_admin())
  );

-- 3. Consolidated UPDATE policy: own profile OR admin
CREATE POLICY "profiles_update_policy"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (SELECT public.is_admin())
  );
