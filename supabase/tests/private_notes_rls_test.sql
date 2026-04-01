-- ============================================================================
-- private_notes_rls_test.sql — pgTAP RLS Tests for Private Notes
--
-- Tests: per-user note isolation, insertion restrictions, and update/delete
--        scoping inside a notebook.
--
-- Run with: npx supabase test db
--
-- ============================================================================

BEGIN;
SELECT plan(8);

-- ============================================================================
-- SETUP: Create test users, notebook, members, and notes
-- ============================================================================

DO $$
DECLARE
  v_user_a_id    uuid := gen_random_uuid();
  v_user_b_id    uuid := gen_random_uuid();
  v_outsider_id  uuid := gen_random_uuid();
  v_notebook_id  uuid := gen_random_uuid();
  v_note_a_id    uuid := gen_random_uuid();
  v_note_b_id    uuid := gen_random_uuid();
BEGIN
  -- Store IDs in GUC variables
  PERFORM set_config('test.user_a_id',   v_user_a_id::text,   true);
  PERFORM set_config('test.user_b_id',   v_user_b_id::text,   true);
  PERFORM set_config('test.outsider_id', v_outsider_id::text, true);
  PERFORM set_config('test.notebook_id', v_notebook_id::text, true);
  PERFORM set_config('test.note_a_id',   v_note_a_id::text,   true);
  PERFORM set_config('test.note_b_id',   v_note_b_id::text,   true);

  -- Insert test users into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_user_a_id,   'note-a@test.com',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_user_b_id,   'note-b@test.com',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_outsider_id, 'note-out@test.com',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Update profiles (which are auto-created by auth trigger)
  UPDATE public.profiles
  SET full_name = 'Note A User', role = 'user'
  WHERE id = v_user_a_id;

  UPDATE public.profiles
  SET full_name = 'Note B User', role = 'user'
  WHERE id = v_user_b_id;

  UPDATE public.profiles
  SET full_name = 'Outsider', role = 'user'
  WHERE id = v_outsider_id;

  -- Insert a notebook (owned by v_user_a_id)
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES (v_notebook_id, v_user_a_id, 'Note Test NB', 'Testing private notes', 'private');

  -- Add user B as a viewer
  INSERT INTO public.notebook_members (notebook_id, user_id, role, invited_by)
  VALUES (v_notebook_id, v_user_b_id, 'viewer', v_user_a_id);

  -- Insert private notes
  INSERT INTO public.notes (id, notebook_id, user_id, title, content)
  VALUES
    (v_note_a_id, v_notebook_id, v_user_a_id, 'User A Note', 'Content A'),
    (v_note_b_id, v_notebook_id, v_user_b_id, 'User B Note', 'Content B');

END $$;


-- ============================================================================
-- TEST 1: User A can read their own note
-- ============================================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user_a_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_a_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notes WHERE notebook_id = current_setting('test.notebook_id')::uuid),
  1,
  'Test 1: User A reads ONLY 1 note in notebook (their own)'
);

RESET ROLE;

-- ============================================================================
-- TEST 2: User A can update their own note
-- ============================================================================
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format('UPDATE public.notes SET title = %L WHERE id = %L', 'User A Note Edited', current_setting('test.note_a_id')),
  'Test 2: User A can update their own note'
);

RESET ROLE;

-- ============================================================================
-- TEST 3: User A CANNOT update User B's note
-- ============================================================================
SET LOCAL ROLE authenticated;

UPDATE public.notes SET title = 'User A Hacking' WHERE id = current_setting('test.note_b_id')::uuid;

RESET ROLE;

SELECT is(
  (SELECT title FROM public.notes WHERE id = current_setting('test.note_b_id')::uuid),
  'User B Note',
  'Test 3: User A update on User B''s note is silently blocked (title unchanged)'
);

-- ============================================================================
-- TEST 4: User A CANNOT read User B's note
-- ============================================================================
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notes WHERE id = current_setting('test.note_b_id')::uuid),
  0,
  'Test 4: User A cannot see User B''s note directly'
);

RESET ROLE;

-- ============================================================================
-- TEST 5: Non-member cannot see any notes
-- ============================================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outsider_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notes WHERE notebook_id = current_setting('test.notebook_id')::uuid),
  0,
  'Test 5: Outsider cannot read any notes inside the notebook'
);

RESET ROLE;

-- ============================================================================
-- TEST 6: User B (viewer) can insert a note because they have notebook_role
-- ============================================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user_b_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_b_id'), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format('INSERT INTO public.notes (notebook_id, user_id, title, content) VALUES (%L, %L, ''New'', ''Note'')',
    current_setting('test.notebook_id'), current_setting('test.user_b_id')),
  'Test 6: User B can insert their own note inside the notebook'
);

RESET ROLE;

-- ============================================================================
-- TEST 7: Outsider CANNOT insert a note at all
-- ============================================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outsider_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_id'), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format('INSERT INTO public.notes (notebook_id, user_id, title, content) VALUES (%L, %L, ''Bad'', ''Note'')',
    current_setting('test.notebook_id'), current_setting('test.outsider_id')),
  'new row violates row-level security policy for table "notes"',
  'Test 7: Outsider cannot insert a note because they lack notebook access'
);

RESET ROLE;

-- ============================================================================
-- TEST 8: User A can delete their own note
-- ============================================================================
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user_a_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_a_id'), true);
SET LOCAL ROLE authenticated;

DELETE FROM public.notes WHERE id = current_setting('test.note_a_id')::uuid;

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.notes WHERE id = current_setting('test.note_a_id')::uuid),
  0,
  'Test 8: User A successfully deleted their own note'
);

-- ============================================================================
-- FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK;
