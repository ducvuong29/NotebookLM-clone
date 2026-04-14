-- ============================================================================
-- EPIC 5 FIX: Remove duplicate member activity logging trigger
-- ============================================================================
-- We previously added `trigger_log_member_activity` to log when a member
-- was invited, removed, or their role changed.
-- However, as these actions are primarily executed server-side via
-- the `collaboration-api` Edge Function (which ALSO explicitly logs these actions),
-- having the database trigger caused duplicate entries in `activity_log`.
-- Even worse, because edge functions with service_role lack an `auth.uid()`,
-- the database trigger fell back to attributing the actor to the target_user.
-- 
-- Fix: We drop the trigger and the function so ONLY the Edge Function tracks
-- member collaborations, which has the precise `callerId`.

DROP TRIGGER IF EXISTS trigger_log_member_activity ON public.notebook_members;
DROP FUNCTION IF EXISTS public.log_member_activity;
