-- ============================================================================
-- Fix: log_source_deleted trigger causes FK violation on notebook deletion
-- ============================================================================
-- Root Cause:
--   When a notebook is deleted, PostgreSQL cascade-deletes child rows (sources)
--   and fires AFTER DELETE triggers on those rows. The log_source_deleted trigger
--   then tries to INSERT into activity_log with notebook_id — but the parent
--   notebook row is already logically deleted at this point, causing:
--     ERROR: insert or update on table "activity_log" violates foreign key constraint
--            "activity_log_notebook_id_fkey"
--
-- Fix:
--   Guard the trigger: if the notebook no longer exists (cascade scenario),
--   skip the activity log INSERT and return early.
--
-- Same guard applied to log_source_updated for consistency.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_source_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guard: if the parent notebook no longer exists, the source is being deleted
  -- as part of a notebook cascade delete. Skip logging to avoid FK violation
  -- on activity_log.notebook_id → notebooks.id.
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = OLD.notebook_id) THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    OLD.notebook_id,
    COALESCE((SELECT auth.uid()), (SELECT user_id FROM public.notebooks WHERE id = OLD.notebook_id)),
    'source_deleted',
    jsonb_build_object('source_title', OLD.title, 'source_id', OLD.id)
  );
  RETURN OLD;
END;
$$;

-- Apply the same guard to log_source_updated for consistency
CREATE OR REPLACE FUNCTION public.log_source_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guard: skip if parent notebook no longer exists
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = NEW.notebook_id) THEN
    RETURN NEW;
  END IF;

  -- Only log if title changed
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
    VALUES (
      NEW.notebook_id,
      COALESCE((SELECT auth.uid()), (SELECT user_id FROM public.notebooks WHERE id = NEW.notebook_id)),
      'source_updated',
      jsonb_build_object('old_title', OLD.title, 'new_title', NEW.title, 'source_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;
