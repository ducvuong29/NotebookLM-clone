-- ============================================================================
-- ENABLE pgTAP EXTENSION — Story 3.5.3
-- Applied: 2026-03-28
--
-- pgTAP is a PostgreSQL unit testing framework required by `supabase db test`.
-- This extension is a prerequisite for all RLS tests in supabase/tests/.
--
-- Dependencies: None (pgTAP is bundled with Supabase Postgres images)
-- Rollback: DROP EXTENSION IF EXISTS pgtap;
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
