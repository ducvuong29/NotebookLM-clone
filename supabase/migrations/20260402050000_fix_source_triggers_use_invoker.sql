-- ============================================================================
-- Fix: Rewrite all source triggers to use SECURITY INVOKER + auth.uid()
-- ============================================================================
-- Problem:
--   Previous triggers used SECURITY DEFINER, which causes auth.uid() to return
--   NULL inside trigger context. This made the COALESCE fallback always resolve
--   to the notebook owner, resulting in incorrect actor attribution in activity_log.
--
-- Solution:
--   Remove SECURITY DEFINER from all source trigger functions. The default
--   SECURITY INVOKER allows auth.uid() to correctly read the JWT claims set by
--   PostgREST at the session level, returning the actual authenticated user.
--
-- Affected triggers:
--   1. log_source_added   — AFTER INSERT on sources
--   2. log_source_deleted — AFTER DELETE on sources
--   3. log_source_updated — AFTER UPDATE on sources
-- ============================================================================

-- 1. log_source_added
-- Actor = the user who INSERT-ed the source row (via Supabase client with JWT)

CREATE OR REPLACE FUNCTION public.log_source_added()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Guard: skip if parent notebook no longer exists (cascade scenario)
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = NEW.notebook_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    NEW.notebook_id,
    COALESCE(
      auth.uid(),
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


-- 2. log_source_deleted
-- Actor = the user who DELETE-d the source row

CREATE OR REPLACE FUNCTION public.log_source_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Guard: if the parent notebook no longer exists, the source is being deleted
  -- as part of a notebook cascade delete. Skip logging to avoid FK violation.
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = OLD.notebook_id) THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    OLD.notebook_id,
    COALESCE(
      auth.uid(),
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


-- 3. log_source_updated
-- Actor = the user who UPDATE-d the source row

CREATE OR REPLACE FUNCTION public.log_source_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
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
      COALESCE(
        auth.uid(),
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
