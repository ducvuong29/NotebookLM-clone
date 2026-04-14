-- ============================================================================
-- Rollback: Epic 5 Activity Log
-- Drops triggers, functions, and the activity_log table
-- ============================================================================

-- Drop triggers first (before dropping table/functions)
DROP TRIGGER IF EXISTS trigger_log_source_deleted ON public.sources;

-- Drop trigger functions
DROP FUNCTION IF EXISTS public.log_source_deleted();

-- Drop the activity_log table (cascades indexes, RLS policies)
DROP TABLE IF EXISTS public.activity_log;
