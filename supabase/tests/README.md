# pgTAP RLS Tests

Database-level Row-Level Security (RLS) policy tests using the [pgTAP](https://pgtap.org/) framework.

## Overview

These tests validate that RLS policies correctly enforce data isolation between users. Each test file covers one table's RLS policies and runs entirely within a transaction that is rolled back — leaving no test data behind.

## Directory Structure

```
supabase/tests/
├── README.md                     # This file
└── notebooks_rls_test.sql        # RLS tests for public.notebooks
```

### Naming Convention

| Pattern | Example | Scope |
|---------|---------|-------|
| `{table}_rls_test.sql` | `notebooks_rls_test.sql` | All RLS policies for one table |

Future test files should follow this convention:
- `sources_rls_test.sql` — Sources table RLS (Epic 4a)
- `notebook_members_rls_test.sql` — Notebook members RLS (Epic 4b)
- `activity_log_rls_test.sql` — Activity log RLS (Epic 5)

## Running Tests

### Local Development

```bash
# Run ALL tests in supabase/tests/
supabase db test

# Run with verbose output
supabase db test --debug
```

### CI/CD Pipeline

```bash
# Recommended CI command (non-interactive, exits with proper code)
supabase db test
```

The command returns exit code `0` on success, non-zero on failure — compatible with all CI systems (GitHub Actions, GitLab CI, etc.).

### Prerequisites

1. **Supabase CLI** installed (`npm i -g supabase` or `brew install supabase/tap/supabase`)
2. **Local Supabase** running (`supabase start`)
3. **pgTAP extension** enabled (migration: `20260328020000_enable_pgtap.sql`)

## How to Add New RLS Tests

### Step 1: Create a New Test File

Create `supabase/tests/{table}_rls_test.sql` following this template:

```sql
BEGIN;
SELECT plan(N);  -- Replace N with your assertion count

-- ============================================================
-- SETUP: Create test users and test data
-- ============================================================
DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
BEGIN
  -- IMPORTANT: Store IDs in GUC variables, NOT temp tables!
  -- Temp tables created by postgres are inaccessible after SET LOCAL ROLE.
  PERFORM set_config('test.user_a', v_user_a::text, true);
  PERFORM set_config('test.user_b', v_user_b::text, true);
  PERFORM set_config('test.admin',  v_admin::text, true);

  -- Insert into auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  VALUES
    (v_user_a, 'usera@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_user_b, 'userb@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now()),
    (v_admin,  'admin@test.com', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', crypt('password', gen_salt('bf')), now(), now());

  -- Insert profiles (with roles)
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_user_a, 'usera@test.com', 'User A', 'user'),
    (v_user_b, 'userb@test.com', 'User B', 'user'),
    (v_admin,  'admin@test.com', 'Admin',  'admin')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert test data for the table under test
  -- INSERT INTO public.{table} ...
END $$;

-- ============================================================
-- TESTS (use inline role switching)
-- ============================================================
-- Pattern for each test:
--   1. set_config('request.jwt.claims', ...) + set_config('request.jwt.claim.sub', ...)
--   2. SET LOCAL ROLE authenticated  (activates RLS)
--   3. Run assertion
--   4. RESET ROLE (back to superuser)

-- Switch to user A
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.user_a'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.{table}),
  2,
  'User A sees their 2 records'
);

RESET ROLE;

-- Switch to user B
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.user_b'),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.{table}),
  0,
  'User B sees 0 records (not their own)'
);

RESET ROLE;

-- ============================================================
-- CLEANUP
-- ============================================================
SELECT * FROM finish();
ROLLBACK;  -- CRITICAL: Always rollback to keep DB clean
```

### Step 2: Run and Verify

```bash
supabase db test
```

### Key Patterns

| Pattern | Purpose | Example |
|---------|---------|---------|
| `set_config('test.xxx', id::text, true)` | Store test IDs across role switches | `current_setting('test.user_a')::uuid` to retrieve |
| `set_config('request.jwt.claims', ...)` | Simulate authenticated user | Must include `sub`, `role`, `aud` |
| `SET LOCAL ROLE authenticated` | Switch to authenticated role | Required for RLS to activate |
| `RESET ROLE` | Switch back to superuser | Required before next user switch |
| `gen_random_uuid()` | Generate unique test IDs | Never hardcode UUIDs |
| `ROLLBACK` at end | Clean up all test data | **Never skip this** |

### ⚠️ Critical: Do NOT Use Temp Tables for Test IDs

Temp tables created by the `postgres` superuser cannot be accessed after `SET LOCAL ROLE authenticated` (permission denied). Always use **GUC session variables** (`set_config`/`current_setting`) to store test IDs that need to survive role switches.

### pgTAP Assertion Functions

| Function | Use When |
|----------|----------|
| `is(got, expected, description)` | Comparing scalar values (counts, IDs) |
| `isnt(got, expected, description)` | Verifying values differ |
| `lives_ok(sql, description)` | Operation should succeed |
| `throws_ok(sql, message, description)` | Operation should raise error |
| `results_eq(sql, expected_array, desc)` | Comparing result sets |
| `ok(boolean, description)` | General boolean assertion |

## Anti-Patterns

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| Use temp tables for cross-role IDs | Use `set_config('test.xxx', ...)` GUC variables |
| Use helper functions for role switching | Use inline `SET LOCAL ROLE` / `RESET ROLE` |
| Hardcode UUIDs | Use `gen_random_uuid()` |
| Skip `ROLLBACK` | Always end with `ROLLBACK` |
| Test app logic (React hooks) | Test SQL-level policies only |
| Commit test data | Wrap in `BEGIN...ROLLBACK` |
| Test multiple tables in one file | One file per table |

## Troubleshooting

### "relation pgtap does not exist"

The pgTAP extension is not enabled. Run:

```sql
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
```

Or apply migration `20260328020000_enable_pgtap.sql`.

### "permission denied for table test_ids"

You are using temp tables to store test IDs — these are NOT accessible after `SET LOCAL ROLE authenticated`. Switch to GUC variables:
```sql
-- Store:  PERFORM set_config('test.my_id', v_id::text, true);
-- Read:   current_setting('test.my_id')::uuid
```

### Tests pass locally but fail in CI

Ensure `supabase start` has been run and migrations are applied before `supabase db test`.
