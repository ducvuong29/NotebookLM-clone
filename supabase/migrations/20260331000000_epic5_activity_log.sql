-- ============================================================================
-- Epic 5: Activity Log — Create activity_log table
-- ============================================================================
-- Schema Reference: DA-5 in architecture.md
-- RLS Pattern: AS-1 — SELECT via get_notebook_role(), INSERT via service_role only
-- Index Strategy: query-composite-indexes + schema-foreign-key-indexes
-- ============================================================================

-- 1. Create the activity_log table (append-only audit trail)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'member_invited', 'member_accepted', 'member_removed',
    'role_changed', 'source_added', 'source_deleted',
    'note_updated'
  )),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create indexes
-- Composite index for cursor-based pagination queries (notebook_id = ? ORDER BY created_at DESC)
-- This also covers single-column lookups on notebook_id (leftmost prefix rule)
-- so a separate notebook_id index is REDUNDANT and NOT created [query-composite-indexes]
CREATE INDEX activity_log_notebook_created_idx ON activity_log (notebook_id, created_at DESC);

-- FK column index for actor_id (required per schema-foreign-key-indexes — PG does NOT auto-index FKs)
CREATE INDEX activity_log_actor_id_idx ON activity_log (actor_id);

-- 3. Enable Row Level Security
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
-- FORCE RLS even for table owners [security-rls-basics: prevent bypass]
ALTER TABLE activity_log FORCE ROW LEVEL SECURITY;

-- SELECT: notebook members only
-- [security-rls-performance] Wrap function in (SELECT ...) for evaluated-once caching
-- Without (SELECT ...), get_notebook_role() would be called per-row — O(N) vs O(1)
CREATE POLICY "activity_log_select_members" ON activity_log
  FOR SELECT TO authenticated USING (
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- INSERT: service_role only (Edge Functions / triggers insert via supabaseAdmin)
-- No INSERT policy for authenticated role — only service_role bypasses RLS

-- ============================================================================
-- 4. Triggers for automatic activity logging
-- ============================================================================

-- 4a. Trigger: log source_deleted events
-- [schema-constraints] SECURITY DEFINER with SET search_path = '' for safety
CREATE OR REPLACE FUNCTION public.log_source_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    OLD.notebook_id,
    COALESCE((SELECT auth.uid()), OLD.user_id),
    'source_deleted',
    jsonb_build_object('source_title', OLD.title, 'source_id', OLD.id)
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_log_source_deleted
  AFTER DELETE ON public.sources
  FOR EACH ROW
  EXECUTE FUNCTION public.log_source_deleted();

-- NOTE: member_accepted trigger NOT created — the `status` column was removed 
-- from notebook_members in migration 20260330160000_fix_sharing_security.sql.
-- Members are now added directly without an acceptance flow.
-- If invitation acceptance is re-introduced, add the trigger then.

