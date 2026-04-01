-- ============================================================================
-- n8n_chat_histories_private_test.sql — pgTAP RLS Tests for Private Chat
--
-- Story 4b.4: Private Chat Sessions per Member
-- Tests: per-user chat isolation, admin bypass, non-member blocked,
--        owner delete scoping, insert restrictions
--
-- Convention: Each file tests 1 feature. Name pattern: {feature}_rls_test.sql
-- Run with: supabase db test
--
-- Dependencies:
--   - 20260328020000_enable_pgtap.sql (pgTAP extension)
--   - 20260329120000_epic4b_collaboration_schema_rls.sql (collaboration schema)
--   - 20260330000000_epic4b_private_chat_session_id.sql (composite session_id)
--
-- Test Matrix (7 tests):
--   1.  User A can read their own chat in notebook X
--   2.  User A CANNOT read User B's chat in same notebook X
--   3.  User with no notebook role CANNOT read any chat in notebook X
--   4.  Admin CAN read all chats in any notebook
--   5.  Owner can only delete their own chat (not other members' chats)
--   6.  Non-member cannot insert chat rows
--   7.  Viewer CANNOT insert chat rows
-- ============================================================================

BEGIN;
SELECT plan(7);

-- ============================================================================
-- SETUP: Create test users, notebook, members, chat histories
-- ============================================================================

DO $$
DECLARE
  v_owner_id     uuid := gen_random_uuid();
  v_editor_id    uuid := gen_random_uuid();
  v_viewer_id    uuid := gen_random_uuid();
  v_outsider_id  uuid := gen_random_uuid();
  v_admin_id     uuid := gen_random_uuid();
  v_notebook_id  uuid := gen_random_uuid();
BEGIN
  -- Store IDs in GUC variables
  PERFORM set_config('test.owner_id',    v_owner_id::text,    true);
  PERFORM set_config('test.editor_id',   v_editor_id::text,   true);
  PERFORM set_config('test.viewer_id',   v_viewer_id::text,   true);
  PERFORM set_config('test.outsider_id', v_outsider_id::text, true);
  PERFORM set_config('test.admin_id',    v_admin_id::text,    true);
  PERFORM set_config('test.notebook_id', v_notebook_id::text, true);

  -- Insert test users into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_owner_id,    'chat-owner@test.com',    '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_editor_id,   'chat-editor@test.com',   '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_viewer_id,   'chat-viewer@test.com',   '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_outsider_id, 'chat-outsider@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_admin_id,    'chat-admin@test.com',    '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Insert profiles
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_owner_id,    'chat-owner@test.com',    'Chat Owner',   'user'),
    (v_editor_id,   'chat-editor@test.com',   'Chat Editor',  'user'),
    (v_viewer_id,   'chat-viewer@test.com',   'Chat Viewer',  'user'),
    (v_outsider_id, 'chat-outsider@test.com', 'Chat Outsider','user'),
    (v_admin_id,    'chat-admin@test.com',    'Chat Admin',   'admin')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert a notebook (owned by v_owner_id)
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES (v_notebook_id, v_owner_id, 'Chat Test NB', 'Private chat isolation test', 'private');

  -- Add members
  INSERT INTO public.notebook_members (notebook_id, user_id, role, invited_by)
  VALUES
    (v_notebook_id, v_editor_id, 'editor', v_owner_id),
    (v_notebook_id, v_viewer_id, 'viewer', v_owner_id);

  -- Insert chat history rows with COMPOSITE session_id format
  -- Owner's chat: {notebookId}:{ownerId}
  INSERT INTO public.n8n_chat_histories (session_id, message)
  VALUES
    (v_notebook_id::text || ':' || v_owner_id::text,
     '{"type":"human","content":"Owner question 1"}'::jsonb),
    (v_notebook_id::text || ':' || v_owner_id::text,
     '{"type":"ai","content":"AI response to owner"}'::jsonb);

  -- Editor's chat: {notebookId}:{editorId}
  INSERT INTO public.n8n_chat_histories (session_id, message)
  VALUES
    (v_notebook_id::text || ':' || v_editor_id::text,
     '{"type":"human","content":"Editor question 1"}'::jsonb),
    (v_notebook_id::text || ':' || v_editor_id::text,
     '{"type":"ai","content":"AI response to editor"}'::jsonb);
END $$;


-- ============================================================================
-- TEST 1: User A (owner) can read their own chat
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.n8n_chat_histories
   WHERE session_id = current_setting('test.notebook_id') || ':' || current_setting('test.owner_id')),
  2,
  'Test 1: Owner can read their own chat (2 messages)'
);

RESET ROLE;


-- ============================================================================
-- TEST 2: User A (owner) CANNOT read User B's (editor) chat in same notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.n8n_chat_histories
   WHERE session_id = current_setting('test.notebook_id') || ':' || current_setting('test.editor_id')),
  0,
  'Test 2: Owner CANNOT read editor''s chat in same notebook (isolation enforced)'
);

RESET ROLE;


-- ============================================================================
-- TEST 3: Non-member (outsider) CANNOT read any chat
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.outsider_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.n8n_chat_histories
   WHERE session_id LIKE current_setting('test.notebook_id') || ':%'),
  0,
  'Test 3: Non-member cannot read any chat in notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 4: Admin CAN read all chats in any notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.admin_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.admin_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.n8n_chat_histories
   WHERE session_id LIKE current_setting('test.notebook_id') || ':%'),
  4,
  'Test 4: Admin can read ALL chats in notebook (4 messages across 2 users)'
);

RESET ROLE;


-- ============================================================================
-- TEST 5: Owner can only delete their own chat, not editor's
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

-- Attempt to delete editor's chat (RLS should silently block — 0 rows affected)
DELETE FROM public.n8n_chat_histories
WHERE session_id = current_setting('test.notebook_id') || ':' || current_setting('test.editor_id');

RESET ROLE;

-- Verify editor's chat still exists (as superuser)
SELECT is(
  (SELECT count(*)::int FROM public.n8n_chat_histories
   WHERE session_id = current_setting('test.notebook_id') || ':' || current_setting('test.editor_id')),
  2,
  'Test 5: Owner DELETE on editor''s chat has no effect (editor chat still has 2 messages)'
);


-- ============================================================================
-- TEST 6: Non-member CANNOT insert chat rows
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.outsider_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_id'), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'INSERT INTO public.n8n_chat_histories (session_id, message) VALUES (%L, %L::jsonb)',
    current_setting('test.notebook_id') || ':' || current_setting('test.outsider_id'),
    '{"type":"human","content":"Injected by outsider"}'
  ),
  'new row violates row-level security policy for table "n8n_chat_histories"',
  'Test 6: Non-member cannot insert chat rows'
);

RESET ROLE;


-- ============================================================================
-- TEST 7: Viewer CANNOT insert chat rows (read-only)
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.viewer_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.viewer_id'), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'INSERT INTO public.n8n_chat_histories (session_id, message) VALUES (%L, %L::jsonb)',
    current_setting('test.notebook_id') || ':' || current_setting('test.viewer_id'),
    '{"type":"human","content":"Injected by viewer"}'
  ),
  'new row violates row-level security policy for table "n8n_chat_histories"',
  'Test 7: Viewer cannot insert chat rows (read-only role)'
);

RESET ROLE;


-- ============================================================================
-- FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK;
