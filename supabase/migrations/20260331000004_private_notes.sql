-- ============================================================================
-- EPIC 5.5 — Private Notes
-- Add user_id to notes to make them private for each user
-- ============================================================================

-- 1. Add user_id column (initially nullable)
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill existing notes by setting the user_id to the owner of the notebook
UPDATE public.notes n
SET user_id = nb.user_id
FROM public.notebooks nb
WHERE n.notebook_id = nb.id
  AND n.user_id IS NULL;

-- 3. Set NOT NULL and DEFAULT constraints
ALTER TABLE public.notes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.notes ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 4. Add index for faster queries since notes will be filtered by notebook_id and user_id together
CREATE INDEX IF NOT EXISTS idx_notes_notebook_user ON public.notes(notebook_id, user_id);

-- 5. Drop previous RLS policies for notes
DROP POLICY IF EXISTS "Note read access" ON public.notes;
DROP POLICY IF EXISTS "Note write access" ON public.notes;
DROP POLICY IF EXISTS "Note update access" ON public.notes;
DROP POLICY IF EXISTS "Note delete access" ON public.notes;
DROP POLICY IF EXISTS "Users can view notes from their notebooks" ON public.notes;
DROP POLICY IF EXISTS "Users can create notes in their notebooks" ON public.notes;
DROP POLICY IF EXISTS "Users can update notes in their notebooks" ON public.notes;
DROP POLICY IF EXISTS "Users can delete notes from their notebooks" ON public.notes;

-- 6. Replace with private notes policies
-- Users can only read, update, or delete their own notes
-- (user_id = auth.uid()) AND they must have access to the notebook

-- SELECT: Only the specific user who created the note
CREATE POLICY "Private note read access"
  ON public.notes FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) AND
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- INSERT: Automatically sets user_id via default, but we enforce it
CREATE POLICY "Private note write access"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- UPDATE: Only owner of the note
CREATE POLICY "Private note update access"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) AND
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- DELETE: Only owner of the note
CREATE POLICY "Private note delete access"
  ON public.notes FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) AND
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );
