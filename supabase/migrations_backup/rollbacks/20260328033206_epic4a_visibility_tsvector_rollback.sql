-- Epic 4a: Rollback Visibility and Search Vector Migration

-- 1. Drop GIN index for search_vector
DROP INDEX IF EXISTS public.notebooks_search_idx;

-- 2. Drop search_vector column
ALTER TABLE public.notebooks
DROP COLUMN IF EXISTS search_vector;

-- 3. Drop visibility check constraint
ALTER TABLE public.notebooks
DROP CONSTRAINT IF EXISTS notebooks_visibility_check;

-- NOTE: we could also drop the visibility column if we want a complete reversion,
-- but doing so might destroy user-set visibility states if they have been using the platform.
-- The AC specifies dropping the new columns, so we drop it.
ALTER TABLE public.notebooks
DROP COLUMN IF EXISTS visibility;
