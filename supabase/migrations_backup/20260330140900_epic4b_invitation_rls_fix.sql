-- ============================================================================
-- EPIC 4b — Fix Pending Invitation RLS Bug
-- Applied: 2026-03-30
--
-- Issue: Invited users (status='pending') have `get_notebook_role()` returning NULL.
-- As a result, they couldn't SELECT their own row from `notebook_members` or the
-- notebook details from `notebooks`, which caused the Invitation Banner to be blank.
--
-- Fix: Add explicit SELECT policies.
-- ============================================================================

-- 1. Grant users permission to view their own records in notebook_members
-- This allows `useInvitations` to fetch pending invites for the current user.
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.notebook_members;
CREATE POLICY "Users can view their own memberships"
  ON public.notebook_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- 2. Grant users who have a pending invitation permission to view the notebook metadata
-- This allows the Invitation Banner to show the notebook's title and icon.
DROP POLICY IF EXISTS "Pending members can view notebook details" ON public.notebooks;
CREATE POLICY "Pending members can view notebook details"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notebook_members 
      WHERE notebook_id = notebooks.id 
      AND user_id = auth.uid() 
      AND status = 'pending'
    )
  );
