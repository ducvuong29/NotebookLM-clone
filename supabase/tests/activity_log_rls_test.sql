-- ============================================================================
-- activity_log_rls_test.sql — pgTAP RLS Policy Tests for `public.activity_log`
-- ============================================================================

BEGIN;
SELECT plan(6);

-- ============================================================================
-- SETUP: Create test users and test data
-- ============================================================================

DO $$
DECLARE
  v_owner_id      uuid := gen_random_uuid();
  v_editor_id     uuid := gen_random_uuid();
  v_non_member_id uuid := gen_random_uuid();
  v_notebook_id   uuid := gen_random_uuid();
  v_log_id        uuid := gen_random_uuid();
BEGIN
  -- Store IDs in session-level GUC variables so they survive role switches
  PERFORM set_config('test.owner_id',      v_owner_id::text, true);
  PERFORM set_config('test.editor_id',     v_editor_id::text, true);
  PERFORM set_config('test.non_member_id', v_non_member_id::text, true);
  PERFORM set_config('test.notebook_id',   v_notebook_id::text, true);
  PERFORM set_config('test.log_id',        v_log_id::text, true);

  -- Insert test users into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_owner_id, 'owner@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_editor_id, 'editor@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_non_member_id, 'non_member@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Insert profiles
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_owner_id, 'owner@test.com', 'Test Owner', 'user'),
    (v_editor_id, 'editor@test.com', 'Test Editor', 'user'),
    (v_non_member_id, 'non_member@test.com', 'Test Non Member', 'user')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert test notebook owned by owner
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES
    (v_notebook_id, v_owner_id, 'Test Notebook', 'Private notebook for testing', 'private');

  -- Add editor member
  INSERT INTO public.notebook_members (notebook_id, user_id, role)
  VALUES
    (v_notebook_id, v_editor_id, 'editor');

  -- Insert activity log (simulating Edge Function service_role insert)
  INSERT INTO public.activity_log (id, notebook_id, actor_id, action_type)
  VALUES
    (v_log_id, v_notebook_id, v_owner_id, 'note_updated');
END $$;

-- ============================================================================
-- TEST 1: Owner can SELECT activity_log for their notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.activity_log WHERE notebook_id = current_setting('test.notebook_id')::uuid),
  1,
  'Owner can see activity log for their notebook'
);

RESET ROLE;

-- ============================================================================
-- TEST 2: Editor can SELECT activity_log for their notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.editor_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.editor_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.activity_log WHERE notebook_id = current_setting('test.notebook_id')::uuid),
  1,
  'Editor can see activity log for their notebook'
);

RESET ROLE;

-- ============================================================================
-- TEST 3: Non-member CANNOT SELECT activity_log
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.non_member_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.non_member_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.activity_log WHERE notebook_id = current_setting('test.notebook_id')::uuid),
  0,
  'Non-member cannot see others activity log'
);

RESET ROLE;

-- ============================================================================
-- TEST 4: Anonymous user CANNOT SELECT activity_log
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object('role', 'anon', 'aud', 'anon')::text, true);
SET LOCAL ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.activity_log WHERE notebook_id = current_setting('test.notebook_id')::uuid),
  0,
  'Anonymous user cannot view activity log'
);

RESET ROLE;

-- ============================================================================
-- TEST 5: Owner CANNOT INSERT directly into activity_log
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'INSERT INTO public.activity_log (notebook_id, actor_id, action_type) VALUES (%L, %L, %L)',
    current_setting('test.notebook_id')::uuid,
    current_setting('test.owner_id')::uuid,
    'source_added'
  ),
  'new row violates row-level security policy for table "activity_log"',
  'INSERT into activity_log is blocked by RLS for authenticated users'
);

RESET ROLE;

-- ============================================================================
-- TEST 6: Authenticated user CANNOT UPDATE activity_log
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

-- UPDATE should gracefully fail (update 0 rows) because RLS blocks it.
UPDATE public.activity_log SET action_type = 'source_added' WHERE id = current_setting('test.log_id')::uuid;

-- Verify it was NOT updated
SELECT is(
  (SELECT action_type::text FROM public.activity_log WHERE id = current_setting('test.log_id')::uuid),
  'note_updated',
  'UPDATE on activity_log was blocked by RLS'
);

RESET ROLE;

-- ============================================================================
-- FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK;
