-- ============================================================================
-- ADMIN ROLE INFRASTRUCTURE — Story 3.1
-- Applied: 2026-03-26
--
-- Adds admin role support to the InsightsLM platform:
--   1. `role` column on `profiles` with CHECK constraint
--   2. `is_admin()` SQL function (SECURITY DEFINER, cached auth.uid())
--   3. Admin-level RLS policies on `profiles`
--   4. Seed initial admin user
--
-- Supabase Best Practices Applied:
--   - (SELECT auth.uid()) wrapped in scalar subquery for per-query caching (5-10x perf)
--   - SET search_path = '' on SECURITY DEFINER function (prevents injection)
--   - CHECK constraint on role column (data integrity)  
--   - Index on role column (query performance for admin panel)
--   - (SELECT public.is_admin()) in RLS policies (cached, not per-row)
--
-- DOWN migration at bottom (commented out for rollback reference)
-- ============================================================================

-- ============================================================================
-- 1. ADD ROLE COLUMN TO PROFILES
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user'
  CONSTRAINT chk_profiles_role CHECK (role IN ('user', 'admin'));

-- Index on role for admin-related queries (e.g., user listing in admin panel)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================================================
-- 2. IS_ADMIN() FUNCTION
-- ============================================================================
-- SECURITY DEFINER: runs with owner privileges, bypasses RLS
-- SET search_path = '': prevents search_path injection (security best practice)
-- STABLE: result doesn't change within a single query execution
-- (SELECT auth.uid()): wrapped in scalar subquery for per-query caching (5-10x perf)

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

-- ============================================================================
-- 3. ADMIN RLS POLICIES ON PROFILES
-- ============================================================================
-- Allow admins to view ALL profiles (needed for user management in Stories 3.2/3.3)
-- Regular users still only see their own profile (existing policy unchanged)
-- Using (SELECT public.is_admin()) for per-query caching instead of per-row evaluation

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING ((SELECT public.is_admin()));

-- Allow admins to update any profile (e.g., change user roles, disable accounts)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING ((SELECT public.is_admin()));

-- ============================================================================
-- 4. SEED INITIAL ADMIN
-- ============================================================================

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'vuongbui72440@gmail.com';

-- ============================================================================
-- DOWN MIGRATION (for rollback reference)
-- ============================================================================
-- Run these statements in order to revert all changes:
--
-- DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
-- DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
-- DROP FUNCTION IF EXISTS public.is_admin();
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_role;
-- DROP INDEX IF EXISTS idx_profiles_role;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
