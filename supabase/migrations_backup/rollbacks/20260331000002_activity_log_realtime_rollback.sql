-- Rollback for Epic 5.1: Activity Log Realtime Configuration
-- Removes activity_log from the supabase_realtime publication.

ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_log;
