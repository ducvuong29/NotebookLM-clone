-- ============================================================================
-- EPIC 5.1: Activity Log Realtime Configuration
-- Applied: 2026-03-31
--
-- Expose the `activity_log` table to `supabase_realtime` publication.
-- This allows the frontend to listen for INSERT events enabling live 
-- collaboration auditing updates.
--
-- Since activity_log is append-only, default REPLICA IDENTITY (PK) is sufficient.
-- ============================================================================

-- Safely add the table to the publication without dropping existing ones
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
