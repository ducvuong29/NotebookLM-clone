-- ============================================================================
-- notebooks_rls_test.sql — pgTAP RLS Policy Tests for `public.notebooks`
--
-- Story 3.5.3: pgTAP RLS Testing Infrastructure
-- Tests: Owner isolation, admin bypass, INSERT/UPDATE/DELETE policies
--
-- Convention: Each file tests 1 table. Name pattern: {table}_rls_test.sql
-- Run with: supabase db test
--
-- Dependencies:
--   - 20260328020000_enable_pgtap.sql (pgTAP extension)
--   - 20260325172400_v0.2_optimized.sql (RLS policies)
--   - 20260326_admin_role.sql (is_admin() function, roles)
--   - 20260328010000_epic3_5_rls_admin_indexes.sql (admin-bypass SELECT)
-- ============================================================================

BEGIN;
SELECT plan(8);

-- ============================================================================
-- SETUP: Create test users and test data
-- ============================================================================

DO $$
DECLARE
  v_owner_id  uuid := gen_random_uuid();
  v_other_id  uuid := gen_random_uuid();
  v_admin_id  uuid := gen_random_uuid();
  v_nb_1      uuid := gen_random_uuid();
  v_nb_2      uuid := gen_random_uuid();
BEGIN
  -- Store IDs in session-level GUC variables so they survive role switches.
  -- Temp tables are NOT accessible after SET LOCAL ROLE because the
  -- 'authenticated' role does not own them.
  PERFORM set_config('test.owner_id', v_owner_id::text, true);
  PERFORM set_config('test.other_id', v_other_id::text, true);
  PERFORM set_config('test.admin_id', v_admin_id::text, true);
  PERFORM set_config('test.nb_1',     v_nb_1::text, true);
  PERFORM set_config('test.nb_2',     v_nb_2::text, true);

  -- Insert test users into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_owner_id, 'owner@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_other_id, 'other@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_admin_id, 'admin@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Insert profiles (ON CONFLICT handles trigger-created rows)
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_owner_id, 'owner@test.com', 'Test Owner', 'user'),
    (v_other_id, 'other@test.com', 'Test Other', 'user'),
    (v_admin_id, 'admin@test.com', 'Test Admin', 'admin')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert test notebooks owned by owner
  INSERT INTO public.notebooks (id, user_id, title, description)
  VALUES
    (v_nb_1, v_owner_id, 'Owner Notebook 1', 'First test notebook'),
    (v_nb_2, v_owner_id, 'Owner Notebook 2', 'Second test notebook');
END $$;

-- ============================================================================
-- NOTE ON USER CONTEXT SWITCHING
-- ============================================================================
-- We use inline SET LOCAL ROLE / RESET ROLE + set_config() for JWT claims.
-- IDs are stored in GUC variables (current_setting('test.xxx')) instead of
-- temp tables, because temp tables created by postgres are not accessible
-- after SET LOCAL ROLE authenticated (permission denied).
--
-- Pattern for each test:
--   1. RESET ROLE (ensure superuser)
--   2. set_config('request.jwt.claims', ...) — what auth.uid() reads
--   3. SET LOCAL ROLE authenticated — activates RLS
--   4. Run test assertion (use current_setting('test.xxx')::uuid for IDs)
--   5. RESET ROLE

-- ============================================================================
-- TEST 1: Owner can SELECT their own notebooks
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
  (SELECT count(*)::int FROM public.notebooks),
  2,
  'Test 1: Owner should see their own 2 notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 2: Non-owner cannot SELECT other users notebooks
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.other_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.other_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notebooks),
  0,
  'Test 2: Non-owner should see 0 notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 3: Admin can SELECT all notebooks (admin-bypass policy)
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
     current_setting('test.nb_1')::uuid,
     current_setting('test.nb_2')::uuid
   )),
  2,
  'Test 3: Admin should see all notebooks including non-owned ones'
);

RESET ROLE;

-- ============================================================================
-- TEST 4: Owner can INSERT a new notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'INSERT INTO public.notebooks (id, user_id, title) VALUES (%L, %L, %L)',
    gen_random_uuid(),
    current_setting('test.owner_id')::uuid,
    'Inserted by Owner'
  ),
  'Test 4: Owner can INSERT a notebook for themselves'
);

RESET ROLE;

-- ============================================================================
-- TEST 5: Non-owner cannot INSERT a notebook for another user
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.other_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.other_id'), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'INSERT INTO public.notebooks (id, user_id, title) VALUES (%L, %L, %L)',
    gen_random_uuid(),
    current_setting('test.owner_id')::uuid,
    'Injected by Other'
  ),
  'new row violates row-level security policy for table "notebooks"',
  'Test 5: Non-owner cannot INSERT a notebook for another user'
);

RESET ROLE;

-- ============================================================================
-- TEST 6: Owner can UPDATE their own notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'UPDATE public.notebooks SET title = %L WHERE id = %L',
    'Updated Title',
    current_setting('test.nb_1')::uuid
  ),
  'Test 6: Owner can UPDATE their own notebook'
);

RESET ROLE;

-- ============================================================================
-- TEST 7: Owner can DELETE their own notebook
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'DELETE FROM public.notebooks WHERE id = %L',
    current_setting('test.nb_2')::uuid
  ),
  'Test 7: Owner can DELETE their own notebook'
);

RESET ROLE;

-- ============================================================================
-- TEST 8: Non-owner cannot see (and therefore cannot delete) others notebooks
-- ============================================================================

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.other_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.other_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.notebooks
   WHERE id = current_setting('test.nb_1')::uuid),
  0,
  'Test 8: Non-owner cannot see others notebooks'
);

RESET ROLE;

-- ============================================================================
-- FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK;
