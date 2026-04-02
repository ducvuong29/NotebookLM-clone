-- ============================================================================
-- Fix: Rewrite all source triggers — correct actor + complete metadata
-- ============================================================================
-- Problem:
--   Migration 20260402000003 replaced auth.uid() with uploaded_by column,
--   which only worked for INSERT and broke DELETE/UPDATE actor attribution.
--
-- Solution:
--   Revert to auth.uid() for actor resolution. auth.uid() DOES work inside
--   SECURITY DEFINER functions in Supabase because it reads from session-level
--   GUC (request.jwt.claims) set by PostgREST — SECURITY DEFINER only changes
--   the effective role, NOT the session settings.
--
--   Keep SECURITY DEFINER because:
--   1. Consistent with the rest of the project
--   2. Bypasses RLS on activity_log (no INSERT policy needed)
--   3. auth.uid() still works correctly
--
-- Also fixes:
--   - Add 'source_updated' to activity_log action_type CHECK constraint
--   - Add source_title to all trigger metadata
-- ============================================================================

-- Step 0: Add 'source_updated' to the CHECK constraint (was missing)
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_action_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_action_type_check
  CHECK (action_type IN (
    'member_invited', 'member_accepted', 'member_removed',
    'role_changed', 'source_added', 'source_deleted', 'source_updated',
    'note_updated'
  ));


-- ============================================================================
-- 1. log_source_added — AFTER INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_source_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guard: skip if parent notebook was cascade-deleted
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = NEW.notebook_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    NEW.notebook_id,
    COALESCE(
      (SELECT auth.uid()),
      (SELECT user_id FROM public.notebooks WHERE id = NEW.notebook_id)
    ),
    'source_added',
    jsonb_build_object(
      'source_title', NEW.title,
      'source_id', NEW.id,
      'source_type', NEW.type
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_source_added ON public.sources;
CREATE TRIGGER trigger_log_source_added
  AFTER INSERT ON public.sources
  FOR EACH ROW
  EXECUTE FUNCTION public.log_source_added();


-- ============================================================================
-- 2. log_source_deleted — AFTER DELETE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_source_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guard: skip if parent notebook was cascade-deleted
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = OLD.notebook_id) THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    OLD.notebook_id,
    COALESCE(
      (SELECT auth.uid()),
      (SELECT user_id FROM public.notebooks WHERE id = OLD.notebook_id)
    ),
    'source_deleted',
    jsonb_build_object(
      'source_title', OLD.title,
      'source_id', OLD.id,
      'source_type', OLD.type
    )
  );
  RETURN OLD;
END;
$$;


-- ============================================================================
-- 3. log_source_updated — AFTER UPDATE (title change only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_source_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guard: skip if parent notebook was cascade-deleted
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = NEW.notebook_id) THEN
    RETURN NEW;
  END IF;

  -- Only log if title changed
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
    VALUES (
      NEW.notebook_id,
      COALESCE(
        (SELECT auth.uid()),
        (SELECT user_id FROM public.notebooks WHERE id = NEW.notebook_id)
      ),
      'source_updated',
      jsonb_build_object(
        'old_title', OLD.title,
        'new_title', NEW.title,
        'source_id', NEW.id,
        'source_type', NEW.type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
