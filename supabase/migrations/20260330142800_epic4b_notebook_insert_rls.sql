-- ============================================================================
-- EPIC 4b — Fix Notebook Creation for Normal Users
-- Applied: 2026-03-30
--
-- Issue: Normal users experience an error when creating a notebook using `.insert().select().single()`.
--
-- Cause:
-- The `RETURNING` clause requires the newly inserted row to pass the `SELECT` RLS policy.
-- The existing `SELECT` policy calls `get_notebook_role(id)`, which is declared `STABLE`.
-- In PostgreSQL, a `STABLE` function cannot see data modifications made by the current statement.
-- Thus, during the `INSERT`, `get_notebook_role` queries `public.notebooks`, sees nothing,
-- and returns `NULL`. The `SELECT` policy blocks the row from returning, causing `.single()` to throw.
-- (Admins bypassed this because the admin check relies on `public.profiles`, which wasn't modified).
--
-- Fix:
-- Add an explicit `SELECT` policy for the notebook owner natively (`user_id = auth.uid()`).
-- This bypasses the function call entirely for the owner and allows the `RETURNING` clause to succeed.
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own created notebooks" ON public.notebooks;
CREATE POLICY "Users can view their own created notebooks"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );
