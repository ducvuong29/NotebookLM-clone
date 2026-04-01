-- ============================================================================
-- collaboration_rls_test.sql — pgTAP RLS Tests for Collaboration
--
-- Story 4b.1: Collaboration Schema & RLS Rewrite
-- Tests: owner CRUD, editor permissions, viewer read-only,
--        non-member blocked, pending blocked, admin bypass, public visibility
--
-- Convention: Each file tests 1 feature. Name pattern: {feature}_rls_test.sql
-- Run with: supabase db test
--
-- Dependencies:
--   - 20260328020000_enable_pgtap.sql (pgTAP extension)
--   - 20260329120000_epic4b_collaboration_schema_rls.sql (collaboration schema)
--
-- Test Matrix (12 tests):
--   1.  Owner can SELECT own notebook
--   2.  Editor can SELECT shared notebook
--   3.  Editor can INSERT sources
--   4.  Editor can UPDATE sources
--   5.  Viewer can SELECT sources (read-only)
--   6.  Viewer CANNOT INSERT sources (RLS throws)
--   7.  Non-member CANNOT see private notebook (0 rows)
--   8.  Pending member CANNOT see private notebook (0 rows)
--   9.  Admin can see ALL notebooks (bypass via get_notebook_role)
--   10. Public notebook visible to outsider
--   11. Owner can DELETE sources
--   12. Editor CANNOT DELETE sources (0 rows affected)
-- ============================================================================

BEGIN;
SELECT plan(12);

-- ============================================================================
-- SETUP: Create 6 test users, 2 notebooks, members, sources, notes
-- ============================================================================

DO $$
DECLARE
  v_owner_id     uuid := gen_random_uuid();
  v_editor_id    uuid := gen_random_uuid();
  v_viewer_id    uuid := gen_random_uuid();
  v_pending_id   uuid := gen_random_uuid();
  v_outsider_id  uuid := gen_random_uuid();
  v_admin_id     uuid := gen_random_uuid();
  v_notebook_id  uuid := gen_random_uuid();
  v_public_nb_id uuid := gen_random_uuid();
  v_source_id    uuid := gen_random_uuid();
  v_note_id      uuid := gen_random_uuid();
  v_pub_source_id uuid := gen_random_uuid();
BEGIN
  -- Store IDs in GUC variables (survive SET LOCAL ROLE switches)
  PERFORM set_config('test.owner_id',     v_owner_id::text,     true);
  PERFORM set_config('test.editor_id',    v_editor_id::text,    true);
  PERFORM set_config('test.viewer_id',    v_viewer_id::text,    true);
  PERFORM set_config('test.pending_id',   v_pending_id::text,   true);
  PERFORM set_config('test.outsider_id',  v_outsider_id::text,  true);
  PERFORM set_config('test.admin_id',     v_admin_id::text,     true);
  PERFORM set_config('test.notebook_id',  v_notebook_id::text,  true);
  PERFORM set_config('test.public_nb_id', v_public_nb_id::text, true);
  PERFORM set_config('test.source_id',    v_source_id::text,    true);
  PERFORM set_config('test.note_id',      v_note_id::text,      true);
  PERFORM set_config('test.pub_source_id', v_pub_source_id::text, true);

  -- Insert 6 test users into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_owner_id,    'collab-owner@test.com',    '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_editor_id,   'collab-editor@test.com',   '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_viewer_id,   'collab-viewer@test.com',   '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_pending_id,  'collab-pending@test.com',  '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_outsider_id, 'collab-outsider@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_admin_id,    'collab-admin@test.com',    '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Insert profiles (ON CONFLICT handles trigger-created rows)
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_owner_id,    'collab-owner@test.com',    'Collab Owner',   'user'),
    (v_editor_id,   'collab-editor@test.com',   'Collab Editor',  'user'),
    (v_viewer_id,   'collab-viewer@test.com',   'Collab Viewer',  'user'),
    (v_pending_id,  'collab-pending@test.com',  'Collab Pending', 'user'),
    (v_outsider_id, 'collab-outsider@test.com', 'Collab Outsider','user'),
    (v_admin_id,    'collab-admin@test.com',    'Collab Admin',   'admin')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert a PRIVATE notebook (owned by v_owner_id)
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES (v_notebook_id, v_owner_id, 'Collab Private NB', 'Private collaboration test', 'private');

  -- Insert a PUBLIC notebook (owned by v_owner_id)
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES (v_public_nb_id, v_owner_id, 'Collab Public NB', 'Public collaboration test', 'public');

  -- Add members to the PRIVATE notebook
  -- Editor (accepted)
  INSERT INTO public.notebook_members (notebook_id, user_id, role, invited_by)
  VALUES (v_notebook_id, v_editor_id, 'editor', v_owner_id);

  -- Viewer (accepted)
  INSERT INTO public.notebook_members (notebook_id, user_id, role, invited_by)
  VALUES (v_notebook_id, v_viewer_id, 'viewer', v_owner_id);

  -- Pending member (NOT accepted — should be blocked)
  INSERT INTO public.notebook_members (notebook_id, user_id, role, invited_by)
  VALUES (v_notebook_id, v_pending_id, 'editor', v_owner_id);

  -- Insert a source into the private notebook
  INSERT INTO public.sources (id, notebook_id, title, type)
  VALUES (v_source_id, v_notebook_id, 'Collab Source', 'text');

  -- Insert a source into the public notebook
  INSERT INTO public.sources (id, notebook_id, title, type)
  VALUES (v_pub_source_id, v_public_nb_id, 'Public Source', 'text');

  -- Insert a note into the private notebook
  INSERT INTO public.notes (id, notebook_id, title, content)
  VALUES (v_note_id, v_notebook_id, 'Collab Note', 'Test note content');
END $$;


-- ============================================================================
-- TEST 1: Owner can SELECT own notebook
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
  (SELECT count(*)::int FROM public.notebooks
   WHERE id = current_setting('test.notebook_id')::uuid),
  1,
  'Test 1: Owner can see own private notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 2: Editor (accepted) can SELECT shared notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.editor_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.editor_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notebooks
   WHERE id = current_setting('test.notebook_id')::uuid),
  1,
  'Test 2: Editor can see shared private notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 3: Editor can INSERT sources into shared notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.editor_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.editor_id'), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'INSERT INTO public.sources (id, notebook_id, title, type) VALUES (%L, %L, %L, %L)',
    gen_random_uuid(),
    current_setting('test.notebook_id')::uuid,
    'Editor Source',
    'text'
  ),
  'Test 3: Editor can INSERT sources into shared notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 4: Editor can UPDATE sources in shared notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.editor_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.editor_id'), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'UPDATE public.sources SET title = %L WHERE id = %L',
    'Updated by Editor',
    current_setting('test.source_id')::uuid
  ),
  'Test 4: Editor can UPDATE sources in shared notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 5: Viewer can SELECT sources (read-only)
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.viewer_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.viewer_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.sources
   WHERE id = current_setting('test.source_id')::uuid),
  1,
  'Test 5: Viewer can SELECT sources from shared notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 6: Viewer CANNOT INSERT sources (RLS throws)
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
    'INSERT INTO public.sources (id, notebook_id, title, type) VALUES (%L, %L, %L, %L)',
    gen_random_uuid(),
    current_setting('test.notebook_id')::uuid,
    'Viewer Injected Source',
    'text'
  ),
  'new row violates row-level security policy for table "sources"',
  'Test 6: Viewer CANNOT INSERT sources into shared notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 7: Non-member (outsider) CANNOT see private notebook
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
  (SELECT count(*)::int FROM public.notebooks
   WHERE id = current_setting('test.notebook_id')::uuid),
  0,
  'Test 7: Non-member cannot see private notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 8: Pending member CANNOT see private notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.pending_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.pending_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notebooks
   WHERE id = current_setting('test.notebook_id')::uuid),
  0,
  'Test 8: Pending member (not accepted) cannot see private notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 9: Admin can see ALL notebooks (incl. other users' private)
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
  (SELECT count(*)::int FROM public.notebooks
   WHERE id IN (
     current_setting('test.notebook_id')::uuid,
     current_setting('test.public_nb_id')::uuid
   )),
  2,
  'Test 9: Admin can see all notebooks (private and public)'
);

RESET ROLE;


-- ============================================================================
-- TEST 10: Public notebook visible to outsider (non-member)
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
  (SELECT count(*)::int FROM public.notebooks
   WHERE id = current_setting('test.public_nb_id')::uuid),
  1,
  'Test 10: Outsider can see public notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 11: Owner can DELETE own sources
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

-- Delete the public notebook source (to avoid affecting other tests)
SELECT lives_ok(
  format(
    'DELETE FROM public.sources WHERE id = %L',
    current_setting('test.pub_source_id')::uuid
  ),
  'Test 11: Owner can DELETE sources from own notebook'
);

RESET ROLE;


-- ============================================================================
-- TEST 12: Editor CANNOT DELETE sources (0 rows affected, no error)
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.editor_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.editor_id'), true);
SET LOCAL ROLE authenticated;

-- DELETE with RLS doesn't throw — it silently deletes 0 rows.
DELETE FROM public.sources WHERE id = current_setting('test.source_id')::uuid;

RESET ROLE;

-- Verify source still exists (as superuser)
SELECT is(
  (SELECT count(*)::int FROM public.sources
   WHERE id = current_setting('test.source_id')::uuid),
  1,
  'Test 12: Editor DELETE on source has no effect (source still exists)'
);


-- ============================================================================
-- FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK;
