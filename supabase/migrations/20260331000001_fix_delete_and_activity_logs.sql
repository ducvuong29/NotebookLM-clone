-- ============================================================================
-- EPIC 5: Fix Source Deletion and Expand Activity Logs
-- ============================================================================

-- 1. Fix activity_log constraint to include 'source_updated'
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_action_type_check;

ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_action_type_check CHECK (action_type IN (
  'member_invited', 'member_accepted', 'member_removed',
  'role_changed', 'source_added', 'source_deleted', 'source_updated',
  'note_updated'
));

-- 2. Update RLS policies to allow editor to delete sources and documents
DROP POLICY IF EXISTS "Source delete access" ON public.sources;
CREATE POLICY "Source delete access"
  ON public.sources FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Document delete access" ON public.documents;
CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IN ('owner', 'admin', 'editor')
  );

-- 3. Fix log_source_deleted trigger function
-- OLD version referenced OLD.user_id which does not exist on sources
CREATE OR REPLACE FUNCTION public.log_source_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

-- 4. Create trigger to log source_updated
CREATE OR REPLACE FUNCTION public.log_source_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trigger_log_source_updated ON public.sources;
CREATE TRIGGER trigger_log_source_updated
  AFTER UPDATE ON public.sources
  FOR EACH ROW
  EXECUTE FUNCTION public.log_source_updated();


-- 5. Create trigger to log notebook_members activity
CREATE OR REPLACE FUNCTION public.log_member_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_email TEXT;
BEGIN
  -- Determine target user email for metadata
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT email INTO v_target_email FROM auth.users WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT email INTO v_target_email FROM auth.users WHERE id = OLD.user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
    VALUES (
      NEW.notebook_id,
      COALESCE((SELECT auth.uid()), NEW.user_id),
      'member_invited',
      jsonb_build_object('target_user_id', NEW.user_id, 'target_email', v_target_email, 'role', NEW.role)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
      VALUES (
        NEW.notebook_id,
        COALESCE((SELECT auth.uid()), NEW.user_id),
        'role_changed',
        jsonb_build_object('target_user_id', NEW.user_id, 'target_email', v_target_email, 'old_role', OLD.role, 'new_role', NEW.role)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
    VALUES (
      OLD.notebook_id,
      COALESCE((SELECT auth.uid()), OLD.user_id),
      'member_removed',
      jsonb_build_object('target_user_id', OLD.user_id, 'target_email', v_target_email, 'role', OLD.role)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_member_activity ON public.notebook_members;
CREATE TRIGGER trigger_log_member_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.notebook_members
  FOR EACH ROW
  EXECUTE FUNCTION public.log_member_activity();

-- 6. Fix Actor ID Foreign Key traps (Allow User account deletion)
ALTER TABLE public.activity_log 
  DROP CONSTRAINT IF EXISTS activity_log_actor_id_fkey,
  ADD CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.activity_log ALTER COLUMN actor_id DROP NOT NULL;
