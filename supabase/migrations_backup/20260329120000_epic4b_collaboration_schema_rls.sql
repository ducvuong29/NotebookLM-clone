-- ============================================================================
-- EPIC 4b — Collaboration Schema & RLS Rewrite
-- Applied: 2026-03-29
--
-- Story 4b.1: Collaboration Schema & RLS Rewrite
--
-- Changes:
--   1. CREATE TYPE member_role, invitation_status (ENUMs)
--   2. CREATE TABLE notebook_members (UUID PK, FKs, indexes)
--   3. CREATE FUNCTION get_notebook_role() (SECURITY DEFINER)
--   4. REWRITE all RLS policies on: notebooks, sources, notes,
--      n8n_chat_histories, documents to delegate to get_notebook_role()
--   5. NEW RLS policies on notebook_members
--
-- Supabase Best Practices Applied:
--   - (SELECT auth.uid()) caching pattern in get_notebook_role()
--   - SECURITY DEFINER + SET search_path = '' (security)
--   - FK indexes on notebook_members (schema-foreign-key-indexes.md)
--   - Partial index for pending invitations (query-partial-indexes.md)
--   - Idempotent ENUM creation via DO block
--   - DROP POLICY IF EXISTS before CREATE for idempotent re-runs
--   - TO authenticated on all policies (never PUBLIC)
--
-- Dependencies:
--   - 20260325172400_v0.2_optimized.sql (base schema)
--   - 20260326_admin_role.sql (is_admin(), profiles.role)
--   - 20260328010000_epic3_5_rls_admin_indexes.sql (admin policies)
--   - 20260328114000_epic4a_public_notebook_rls.sql (public policies)
--
-- Rollback: rollbacks/20260329120000_epic4b_collaboration_schema_rls_rollback.sql
-- Affected tables: notebook_members (NEW), notebooks, sources, notes,
--                  n8n_chat_histories, documents
-- ============================================================================


-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================
-- Idempotent creation via DO block (Postgres does not support
-- CREATE TYPE IF NOT EXISTS)

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


-- ============================================================================
-- 2. NOTEBOOK_MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notebook_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'viewer',
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (notebook_id, user_id)
);

-- FK indexes (per schema-foreign-key-indexes.md — Postgres does NOT auto-index FKs)
CREATE INDEX IF NOT EXISTS notebook_members_notebook_id_idx
  ON public.notebook_members (notebook_id);
CREATE INDEX IF NOT EXISTS notebook_members_user_id_idx
  ON public.notebook_members (user_id);

-- Partial index for fast "pending invitations" lookup (per query-partial-indexes.md)
CREATE INDEX IF NOT EXISTS notebook_members_pending_idx
  ON public.notebook_members (user_id)
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.notebook_members ENABLE ROW LEVEL SECURITY;

-- Enable REPLICA IDENTITY FULL for Realtime (required for useRealtimeInvitations in 4b.3)
ALTER TABLE public.notebook_members REPLICA IDENTITY FULL;

-- Add to Realtime publication (preserves existing tables)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notebook_members;

-- Add updated_at trigger (reuse existing function from v0.2)
DROP TRIGGER IF EXISTS update_notebook_members_updated_at ON public.notebook_members;
CREATE TRIGGER update_notebook_members_updated_at
  BEFORE UPDATE ON public.notebook_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 3. GET_NOTEBOOK_ROLE() HELPER FUNCTION
-- ============================================================================
-- SECURITY DEFINER: Runs with owner privileges, bypasses RLS on
--   notebook_members to avoid infinite recursion.
-- SET search_path = '': Prevents search_path injection (security best practice).
-- STABLE: Result doesn't change within a single query execution.
-- (SELECT auth.uid()): Wrapped in scalar subquery for per-query caching.
--
-- Returns:
--   'admin'   — if caller is admin (profiles.role = 'admin')
--   'owner'   — if caller owns the notebook
--   'editor'  — if caller is accepted member with editor role
--   'viewer'  — if caller is accepted member with viewer role
--   NULL      — if caller has no relation to the notebook
--
-- NOTE: Admin check uses profiles.role directly (not is_admin()) to avoid
-- circular dependency between SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.get_notebook_role(p_notebook_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    -- Admin check first (profiles.role = 'admin')
    WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
    ) THEN 'admin'
    -- Owner check (notebooks.user_id)
    WHEN (SELECT user_id FROM public.notebooks WHERE id = p_notebook_id) = (SELECT auth.uid())
    THEN 'owner'
    -- Member check (accepted members only)
    ELSE (
      SELECT role::text FROM public.notebook_members
      WHERE notebook_id = p_notebook_id
      AND user_id = (SELECT auth.uid())
      AND status = 'accepted'
    )
  END
$$;


-- ============================================================================
-- 4. RLS POLICIES — notebook_members (NEW TABLE)
-- ============================================================================

-- SELECT: Any notebook participant can see members
DROP POLICY IF EXISTS "Notebook members visible to notebook participants" ON public.notebook_members;
CREATE POLICY "Notebook members visible to notebook participants"
  ON public.notebook_members FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- INSERT: Only owner/admin can invite members
DROP POLICY IF EXISTS "Only notebook owner can invite members" ON public.notebook_members;
CREATE POLICY "Only notebook owner can invite members"
  ON public.notebook_members FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin')
  );

-- UPDATE: Owner/admin can update any. (Invitee updates are handled via Edge Function)
DROP POLICY IF EXISTS "Owner or self can update membership" ON public.notebook_members;
DROP POLICY IF EXISTS "Owner or admin can update membership" ON public.notebook_members;
CREATE POLICY "Owner or admin can update membership"
  ON public.notebook_members FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin')
  );

-- DELETE: Only owner/admin can remove members
DROP POLICY IF EXISTS "Only notebook owner can remove members" ON public.notebook_members;
CREATE POLICY "Only notebook owner can remove members"
  ON public.notebook_members FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin')
  );


-- ============================================================================
-- 5. RLS POLICY REWRITE — notebooks
-- ============================================================================
-- Drop ALL existing policies (v0.2 + Epic 3.5 + Epic 4a), then recreate
-- with unified get_notebook_role() delegation.

DROP POLICY IF EXISTS "Users can view their own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Admins can view all notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Authenticated users can view public notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Users can create their own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Users can update their own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Users can delete their own notebooks" ON public.notebooks;

-- SELECT: owner, accepted members, admin, OR public visibility
CREATE POLICY "Notebook read access"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(id)) IS NOT NULL
    OR visibility = 'public'
  );

-- INSERT: authenticated users can create their own notebooks
CREATE POLICY "Users can create their own notebooks"
  ON public.notebooks FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- UPDATE: owner, editor, or admin
CREATE POLICY "Notebook write access"
  ON public.notebooks FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(id)) IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner or admin only
CREATE POLICY "Notebook delete access"
  ON public.notebooks FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(id)) IN ('owner', 'admin')
  );


-- ============================================================================
-- 6. RLS POLICY REWRITE — sources
-- ============================================================================

DROP POLICY IF EXISTS "Users can view sources from their notebooks" ON public.sources;
DROP POLICY IF EXISTS "Admins can view all sources" ON public.sources;
DROP POLICY IF EXISTS "Authenticated users can view sources of public notebooks" ON public.sources;
DROP POLICY IF EXISTS "Users can create sources in their notebooks" ON public.sources;
DROP POLICY IF EXISTS "Users can update sources in their notebooks" ON public.sources;
DROP POLICY IF EXISTS "Users can delete sources from their notebooks" ON public.sources;

-- SELECT: any notebook participant or public notebook
CREATE POLICY "Source read access"
  ON public.sources FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
      AND notebooks.visibility = 'public'
    )
  );

-- INSERT: owner or editor
CREATE POLICY "Source write access"
  ON public.sources FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin')
  );

-- UPDATE: owner or editor
CREATE POLICY "Source update access"
  ON public.sources FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner or admin only
CREATE POLICY "Source delete access"
  ON public.sources FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin')
  );


-- ============================================================================
-- 7. RLS POLICY REWRITE — notes
-- ============================================================================

DROP POLICY IF EXISTS "Users can view notes from their notebooks" ON public.notes;
DROP POLICY IF EXISTS "Admins can view all notes" ON public.notes;
DROP POLICY IF EXISTS "Users can create notes in their notebooks" ON public.notes;
DROP POLICY IF EXISTS "Users can update notes in their notebooks" ON public.notes;
DROP POLICY IF EXISTS "Users can delete notes from their notebooks" ON public.notes;

-- SELECT: any notebook participant
CREATE POLICY "Note read access"
  ON public.notes FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- INSERT: owner or editor
CREATE POLICY "Note write access"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin')
  );

-- UPDATE: owner or editor
CREATE POLICY "Note update access"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner or admin only
CREATE POLICY "Note delete access"
  ON public.notes FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin')
  );


-- ============================================================================
-- 8. RLS POLICY REWRITE — n8n_chat_histories
-- ============================================================================
-- NOTE: session_id is currently UUID (notebook ID). The {notebookId}:{userId}
-- composite format is a FUTURE story change. This migration uses session_id::uuid.

DROP POLICY IF EXISTS "Users can view chat histories from their notebooks" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Admins can view all chat histories" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Users can create chat histories in their notebooks" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Users can delete chat histories from their notebooks" ON public.n8n_chat_histories;

-- SELECT: any notebook participant
CREATE POLICY "Chat history read access"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(session_id::uuid)) IS NOT NULL
  );

-- INSERT: owner or editor
CREATE POLICY "Chat history write access"
  ON public.n8n_chat_histories FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(session_id::uuid)) IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner or admin only
CREATE POLICY "Chat history delete access"
  ON public.n8n_chat_histories FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(session_id::uuid)) IN ('owner', 'admin')
  );


-- ============================================================================
-- 9. RLS POLICY REWRITE — documents
-- ============================================================================
-- Documents identify their notebook via metadata->>'notebook_id'

DROP POLICY IF EXISTS "Users can view documents from their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can create documents in their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Users can update documents in their notebooks" ON public.documents;
DROP POLICY IF EXISTS "Users can delete documents from their notebooks" ON public.documents;

-- SELECT: any notebook participant
CREATE POLICY "Document read access"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IS NOT NULL
  );

-- INSERT: owner or editor
CREATE POLICY "Document write access"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor', 'admin')
  );

-- UPDATE: owner or editor
CREATE POLICY "Document update access"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner or admin only
CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'admin')
  );
