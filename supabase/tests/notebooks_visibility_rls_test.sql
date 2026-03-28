-- ============================================================================
-- notebooks_visibility_rls_test.sql — pgTAP RLS Policy Tests for Visibility
--
-- Story 4a.2: Public Notebook RLS Policies & pgTAP Tests
-- Tests: public notebooks visibility, private notebook restriction,
--        public notebook source read access, admin sees all
--
-- Convention: Each file tests 1 table/feature. Name pattern: {table}_{feature}_rls_test.sql
-- Run with: supabase db test
--
-- Dependencies:
--   - 20260328020000_enable_pgtap.sql (pgTAP extension)
--   - 20260325172400_v0.2_optimized.sql (base RLS policies)
--   - 20260326_admin_role.sql (is_admin(), admin role)
--   - 20260328010000_epic3_5_rls_admin_indexes.sql (admin-bypass SELECT)
--   - 20260328033206_epic4a_visibility_tsvector.sql (visibility column)
--   - 20260328114000_epic4a_public_notebook_rls.sql (public notebook policies)
-- ============================================================================

BEGIN;
SELECT plan(8);

-- ============================================================================
-- SETUP: Create test users, notebooks (public + private), and sources
-- ============================================================================

DO $$
DECLARE
  v_owner_id     uuid := gen_random_uuid();
  v_other_id     uuid := gen_random_uuid();
  v_admin_id     uuid := gen_random_uuid();
  v_nb_private   uuid := gen_random_uuid();
  v_nb_public    uuid := gen_random_uuid();
  v_src_private  uuid := gen_random_uuid();
  v_src_public   uuid := gen_random_uuid();
BEGIN
  -- Store IDs in GUC variables (survive SET LOCAL ROLE switches)
  PERFORM set_config('test.owner_id',    v_owner_id::text,    true);
  PERFORM set_config('test.other_id',    v_other_id::text,    true);
  PERFORM set_config('test.admin_id',    v_admin_id::text,    true);
  PERFORM set_config('test.nb_private',  v_nb_private::text,  true);
  PERFORM set_config('test.nb_public',   v_nb_public::text,   true);
  PERFORM set_config('test.src_private', v_src_private::text, true);
  PERFORM set_config('test.src_public',  v_src_public::text,  true);

  -- Insert test users into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_owner_id, 'vis-owner@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_other_id, 'vis-other@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_admin_id, 'vis-admin@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Insert profiles (ON CONFLICT handles trigger-created rows)
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_owner_id, 'vis-owner@test.com', 'Vis Owner', 'user'),
    (v_other_id, 'vis-other@test.com', 'Vis Other', 'user'),
    (v_admin_id, 'vis-admin@test.com', 'Vis Admin', 'admin')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert a PRIVATE notebook (default visibility)
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES (v_nb_private, v_owner_id, 'Private NB', 'Private notebook', 'private');

  -- Insert a PUBLIC notebook
  INSERT INTO public.notebooks (id, user_id, title, description, visibility)
  VALUES (v_nb_public, v_owner_id, 'Public NB', 'Public notebook', 'public');

  -- Insert sources into each notebook
  INSERT INTO public.sources (id, notebook_id, title, type)
  VALUES
    (v_src_private, v_nb_private, 'Private Source', 'text'),
    (v_src_public,  v_nb_public,  'Public Source',  'text');
END $$;

-- ============================================================================
-- NOTE ON USER CONTEXT SWITCHING
-- ============================================================================
-- Pattern for each test:
--   1. RESET ROLE (ensure superuser)
--   2. set_config('request.jwt.claims', ...) — what auth.uid() reads
--   3. SET LOCAL ROLE authenticated — activates RLS
--   4. Run test assertion (use current_setting('test.xxx')::uuid for IDs)
--   5. RESET ROLE

-- ============================================================================
-- TEST 1: Owner can see their own private and public notebooks
-- ============================================================================
-- (AC 1 + existing behavior: owner always sees own notebooks)

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
   WHERE id IN (
     current_setting('test.nb_private')::uuid,
     current_setting('test.nb_public')::uuid
   )),
  2,
  'Test 1 (owner-sees-own): Owner sees both their private and public notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 2: Non-owner CAN see public notebooks
-- ============================================================================
-- (AC 1: public notebooks appear in any authenticated user SELECT results)

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
   WHERE id = current_setting('test.nb_public')::uuid),
  1,
  'Test 2 (user-sees-public): Non-owner can see public notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 3: Non-owner CANNOT see private notebooks
-- ============================================================================
-- (AC 3: private notebooks do NOT appear for non-owner users)

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
   WHERE id = current_setting('test.nb_private')::uuid),
  0,
  'Test 3 (user-blocked-private): Non-owner cannot see private notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 4: Admin can see ALL notebooks (both public and private)
-- ============================================================================
-- (AC 5: admin-sees-all — existing admin bypass policy)

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
     current_setting('test.nb_private')::uuid,
     current_setting('test.nb_public')::uuid
   )),
  2,
  'Test 4 (admin-sees-all): Admin can see both private and public notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 5: Non-owner CAN see sources of public notebooks (read-only)
-- ============================================================================
-- (AC 2: public notebook sources are accessible via RLS)

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.other_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.other_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.sources
   WHERE id = current_setting('test.src_public')::uuid),
  1,
  'Test 5: Non-owner can see sources of public notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 6: Non-owner CANNOT see sources of private notebooks
-- ============================================================================
-- (Verify private notebook sources remain restricted)

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.other_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.other_id'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.sources
   WHERE id = current_setting('test.src_private')::uuid),
  0,
  'Test 6: Non-owner cannot see sources of private notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 7: Non-owner CANNOT INSERT sources into public notebooks
-- ============================================================================
-- (Verify mutation policies remain owner-only)

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
    'INSERT INTO public.sources (id, notebook_id, title, type) VALUES (%L, %L, %L, %L)',
    gen_random_uuid(),
    current_setting('test.nb_public')::uuid,
    'Injected Source',
    'text'
  ),
  'new row violates row-level security policy for table "sources"',
  'Test 7: Non-owner cannot INSERT sources into public notebooks'
);

RESET ROLE;

-- ============================================================================
-- TEST 8: Non-owner CANNOT DELETE sources from public notebooks
-- ============================================================================
-- (Verify DELETE policy remains owner-only — RLS silently filters, 0 rows affected)

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.other_id'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.other_id'), true);
SET LOCAL ROLE authenticated;

-- DELETE with RLS doesn't throw — it just silently deletes 0 rows.
-- Verify the source still exists after the attempt.
DELETE FROM public.sources WHERE id = current_setting('test.src_public')::uuid;

RESET ROLE;

-- Verify source still exists (as superuser)
SELECT is(
  (SELECT count(*)::int FROM public.sources
   WHERE id = current_setting('test.src_public')::uuid),
  1,
  'Test 8: Non-owner DELETE on public notebook source has no effect (source still exists)'
);

-- ============================================================================
-- FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK;
