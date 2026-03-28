-- Epic 4a: Add Visibility and Search Vector to Notebooks

-- 1. Ensure visibility column exists
ALTER TABLE public.notebooks 
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

-- Drop the constraint if it exists to be idempotent
ALTER TABLE public.notebooks
DROP CONSTRAINT IF EXISTS notebooks_visibility_check;

-- Add the check constraint
ALTER TABLE public.notebooks
ADD CONSTRAINT notebooks_visibility_check CHECK (visibility IN ('public', 'private'));

-- 2. Add search_vector column
ALTER TABLE public.notebooks
ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) STORED;

-- 3. Create GIN index for search_vector
CREATE INDEX IF NOT EXISTS notebooks_search_idx ON public.notebooks USING GIN(search_vector);
