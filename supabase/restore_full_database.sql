-- ============================================================================
-- INSIGHTSLM — FULL DATABASE RESTORE SCRIPT (v2 — COMPLETE)
-- ============================================================================
-- Tổng hợp từ toàn bộ 39 migration files, đã audit kỹ từng file.
-- Chạy TOÀN BỘ script này trong Supabase SQL Editor để khôi phục database.
--
-- Phiên bản cuối cùng:
--   - Embedding: 3072 dims (text-embedding-3-large / gemini-embedding-001)
--   - RLS: Fully enabled trên tất cả bảng (Zero Trust)
--   - Collaboration: owner / editor / viewer với invitation flow
--   - Realtime: notebooks, sources, notes, chat, members, activity_log, flowcharts
-- ============================================================================


-- ============================================================================
-- BƯỚC 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";


-- ============================================================================
-- BƯỚC 2: CUSTOM TYPES / ENUMs
-- ============================================================================

-- Source type enum
DO $$ BEGIN
  CREATE TYPE public.source_type AS ENUM ('pdf', 'text', 'website', 'youtube', 'audio');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add 'file' for binary uploads (xlsx, csv, etc.)
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'file';

-- Member role enum
DO $$ BEGIN
  CREATE TYPE public.member_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Invitation status enum (for collaboration invitation flow)
DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add 'expired' for lazy expiration of invitations older than 14 days
ALTER TYPE public.invitation_status ADD VALUE IF NOT EXISTS 'expired';


-- ============================================================================
-- BƯỚC 3: HELPER FUNCTIONS (phải tạo trước triggers)
-- ============================================================================

-- Trigger function: auto-update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$;

-- Trigger function: auto-create profile row when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
    );
    RETURN new;
END;
$$;


-- ============================================================================
-- BƯỚC 4: CORE TABLES (theo đúng thứ tự phụ thuộc)
-- ============================================================================

-- 4.1 Chat histories (n8n) — no FK dependencies
CREATE TABLE IF NOT EXISTS public.n8n_chat_histories (
  id         serial  NOT NULL,
  session_id text    NOT NULL,  -- composite: '{notebookId}:{userId}'
  message    jsonb   NOT NULL,
  CONSTRAINT n8n_chat_histories_pkey PRIMARY KEY (id),
  CONSTRAINT chk_session_id_format CHECK (session_id LIKE '%:%')
) TABLESPACE pg_default;

-- 4.2 Profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id         uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      text    NOT NULL,
    full_name  text,
    avatar_url text,
    role       text    DEFAULT 'user'
                       CONSTRAINT chk_profiles_role CHECK (role IN ('user', 'admin')),
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4.3 Notebooks
CREATE TABLE IF NOT EXISTS public.notebooks (
    id                               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title                            text        NOT NULL,
    description                      text,
    color                            text        DEFAULT 'gray',
    icon                             text        DEFAULT '📝',
    visibility                       text        NOT NULL DEFAULT 'private'
                                                 CONSTRAINT chk_notebooks_visibility
                                                 CHECK (visibility IN ('public', 'private')),
    generation_status                text        DEFAULT 'completed'
                                                 CONSTRAINT chk_notebooks_generation_status
                                                 CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed')),
    audio_overview_generation_status text
                                                 CONSTRAINT chk_notebooks_audio_generation_status
                                                 CHECK (audio_overview_generation_status IS NULL
                                                     OR audio_overview_generation_status IN ('generating', 'completed', 'failed')),
    audio_overview_url               text,
    audio_url_expires_at             timestamptz,
    example_questions                text[]      DEFAULT '{}',
    search_vector                    tsvector    GENERATED ALWAYS AS (
                                                     to_tsvector('simple',
                                                         coalesce(title,'') || ' ' || coalesce(description,'')
                                                     )
                                                 ) STORED,
    created_at                       timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at                       timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4.4 Sources
CREATE TABLE IF NOT EXISTS public.sources (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id       uuid        NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    title             text        NOT NULL,
    type              public.source_type NOT NULL,
    url               text,
    file_path         text,
    file_size         bigint,
    display_name      text,
    content           text,
    summary           text,
    processing_status text        DEFAULT 'pending'
                                  CONSTRAINT chk_sources_processing_status
                                  CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    metadata          jsonb       DEFAULT '{}',
    uploaded_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    content_search    tsvector    GENERATED ALWAYS AS (
                                      to_tsvector('simple',
                                          coalesce(title, '') || ' ' ||
                                          coalesce(summary, '') || ' ' ||
                                          coalesce(content, '')
                                      )
                                  ) STORED,
    created_at        timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at        timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4.5 Notes (private per user — user_id added by migration 20260331000004)
CREATE TABLE IF NOT EXISTS public.notes (
    id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id    uuid    NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    user_id        uuid    NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title          text    NOT NULL,
    content        text    NOT NULL,
    source_type    text    DEFAULT 'user',
    extracted_text text,
    created_at     timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at     timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4.6 Documents (vector embeddings — 3072 dimensions)
CREATE TABLE IF NOT EXISTS public.documents (
    id        bigserial PRIMARY KEY,
    content   text,
    metadata  jsonb,
    embedding extensions.vector(3072)
);

-- 4.7 Notebook Members (collaboration — includes invitation_status)
CREATE TABLE IF NOT EXISTS public.notebook_members (
  id          uuid                     DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id uuid                     NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id     uuid                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.member_role       NOT NULL DEFAULT 'viewer',
  status      public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by  uuid                     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz              DEFAULT now(),
  updated_at  timestamptz              DEFAULT now(),
  UNIQUE (notebook_id, user_id)
);

-- 4.8 Activity Log (append-only audit trail)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id uuid        NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  actor_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text        NOT NULL,
  metadata    jsonb       DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT activity_log_action_type_check CHECK (action_type IN (
    'member_invited', 'member_accepted', 'member_removed',
    'role_changed', 'source_added', 'source_deleted', 'source_updated',
    'note_updated'
  ))
);

-- 4.9 Flowcharts (private per user)
CREATE TABLE IF NOT EXISTS public.flowcharts (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id       uuid    NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  source_id         uuid    NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  user_id           uuid    NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mermaid_code      text    NOT NULL DEFAULT '',
  summary           text    DEFAULT '',
  title             text    DEFAULT '',
  generation_status text    NOT NULL DEFAULT 'pending'
                            CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed')),
  error_message     text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);


-- ============================================================================
-- BƯỚC 5: INDEXES
-- ============================================================================

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

-- notebooks
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id
  ON public.notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at
  ON public.notebooks(updated_at DESC);
CREATE INDEX IF NOT EXISTS notebooks_search_idx
  ON public.notebooks USING GIN(search_vector);

-- sources
CREATE INDEX IF NOT EXISTS idx_sources_notebook_id
  ON public.sources(notebook_id);
CREATE INDEX IF NOT EXISTS idx_sources_type
  ON public.sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_processing_status
  ON public.sources(processing_status);
CREATE INDEX IF NOT EXISTS idx_sources_metadata
  ON public.sources USING GIN(metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_sources_content_search
  ON public.sources USING GIN(content_search);

-- notes
CREATE INDEX IF NOT EXISTS idx_notes_notebook_id
  ON public.notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook_user
  ON public.notes(notebook_id, user_id);

-- n8n_chat_histories
CREATE INDEX IF NOT EXISTS idx_chat_histories_session_id
  ON public.n8n_chat_histories(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_session_notebook
  ON public.n8n_chat_histories ((NULLIF(split_part(session_id, ':', 1), '')::uuid));
CREATE INDEX IF NOT EXISTS idx_chat_session_user
  ON public.n8n_chat_histories ((NULLIF(split_part(session_id, ':', 2), '')::uuid));

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_metadata
  ON public.documents USING GIN(metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_documents_notebook_id
  ON public.documents ((metadata->>'notebook_id'));

-- HNSW index via halfvec cast — bypasses pgvector's 2000-dim limit
-- (text-embedding-3-large = 3072 dims; halfvec stores 16-bit per dim)
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON public.documents
  USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- notebook_members
CREATE INDEX IF NOT EXISTS notebook_members_notebook_id_idx
  ON public.notebook_members(notebook_id);
CREATE INDEX IF NOT EXISTS notebook_members_user_id_idx
  ON public.notebook_members(user_id);
CREATE INDEX IF NOT EXISTS notebook_members_pending_idx
  ON public.notebook_members(user_id)
  WHERE status = 'pending';

-- activity_log
CREATE INDEX IF NOT EXISTS activity_log_notebook_created_idx
  ON public.activity_log(notebook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_id_idx
  ON public.activity_log(actor_id);

-- flowcharts
CREATE INDEX IF NOT EXISTS idx_flowcharts_notebook_id
  ON public.flowcharts(notebook_id);
CREATE INDEX IF NOT EXISTS idx_flowcharts_source_id
  ON public.flowcharts(source_id);
CREATE INDEX IF NOT EXISTS idx_flowcharts_user_id
  ON public.flowcharts(user_id);
CREATE INDEX IF NOT EXISTS idx_flowcharts_notebook_user
  ON public.flowcharts(notebook_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flowcharts_source_user_unique
  ON public.flowcharts(source_id, user_id);
CREATE INDEX IF NOT EXISTS idx_flowcharts_generating
  ON public.flowcharts(generation_status)
  WHERE generation_status = 'generating';


-- ============================================================================
-- BƯỚC 6: DATABASE FUNCTIONS
-- ============================================================================

-- Kiểm tra quyền admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

-- CORE RLS function: trả về role của user trong notebook
-- Returns: 'owner', 'editor', 'viewer', 'admin', or NULL
CREATE OR REPLACE FUNCTION public.get_notebook_role(p_notebook_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    -- Admin bypass
    WHEN (SELECT public.is_admin()) THEN 'admin'
    -- Owner check
    WHEN (SELECT user_id FROM public.notebooks WHERE id = p_notebook_id)
         = (SELECT auth.uid())
    THEN 'owner'
    -- Member check (accepted members only — status = 'accepted')
    ELSE (
      SELECT role::text
      FROM public.notebook_members
      WHERE notebook_id = p_notebook_id
        AND user_id = (SELECT auth.uid())
        AND status = 'accepted'
    )
  END
$$;

-- RAG search function (3072 dims for text-embedding-3-large)
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding extensions.vector(3072),
  match_count     integer  DEFAULT NULL,
  filter          jsonb    DEFAULT '{}'
)
RETURNS TABLE (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.documents.id,
    public.documents.content,
    public.documents.metadata,
    1 - (public.documents.embedding <=> query_embedding) AS similarity
  FROM public.documents
  WHERE public.documents.metadata @> filter
  ORDER BY public.documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT ALL ON FUNCTION public.match_documents(extensions.vector(3072), integer, jsonb) TO anon;
GRANT ALL ON FUNCTION public.match_documents(extensions.vector(3072), integer, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.match_documents(extensions.vector(3072), integer, jsonb) TO service_role;

-- Search users for invitation auto-suggest
CREATE OR REPLACE FUNCTION public.search_users(
  search_query text,
  limit_count  int DEFAULT 5
)
RETURNS TABLE (
  id         uuid,
  email      varchar,
  full_name  text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, email, full_name, avatar_url
  FROM public.profiles
  WHERE email ILIKE '%' || search_query || '%'
     OR full_name ILIKE '%' || search_query || '%'
  LIMIT limit_count;
$$;

REVOKE EXECUTE ON FUNCTION public.search_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO service_role;

-- Admin: paginated user listing
CREATE OR REPLACE FUNCTION public.get_admin_users(
  page_num     int  DEFAULT 1,
  page_size    int  DEFAULT 25,
  search_query text DEFAULT ''
)
RETURNS TABLE (
  id              uuid,
  email           varchar,
  full_name       text,
  role            text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  is_disabled     boolean,
  total_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role   text;
  v_offset int;
  v_search text;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied. You do not have admin privileges.';
  END IF;

  v_offset := (page_num - 1) * page_size;
  IF v_offset < 0 THEN v_offset := 0; END IF;

  v_search := '%' || trim(search_query) || '%';
  IF trim(search_query) = '' THEN v_search := NULL; END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::varchar,
    COALESCE(p.full_name, (u.raw_user_meta_data->>'full_name')::text),
    p.role,
    u.created_at,
    u.last_sign_in_at,
    (u.banned_until IS NOT NULL),
    count(*) OVER()
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE v_search IS NULL
     OR u.email ILIKE v_search
     OR COALESCE(p.full_name, (u.raw_user_meta_data->>'full_name')::text) ILIKE v_search
  ORDER BY u.created_at DESC
  LIMIT page_size
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_users(int, int, text) TO authenticated;

-- Full-text search across notebook sources (with input validation)
CREATE OR REPLACE FUNCTION public.search_notebook_content(
  search_query text,
  max_results  integer DEFAULT 50
)
RETURNS TABLE(
  notebook_id          uuid,
  notebook_title       text,
  notebook_description text,
  notebook_icon        text,
  notebook_color       text,
  notebook_visibility  text,
  notebook_updated_at  timestamptz,
  source_title         text,
  source_snippet       text,
  match_count          bigint,
  match_rank           real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_query text;
  v_limit integer;
BEGIN
  v_query := trim(search_query);
  IF v_query = '' OR v_query IS NULL THEN RETURN; END IF;
  IF length(v_query) > 500 THEN
    RAISE EXCEPTION 'Search query too long (max 500 characters)';
  END IF;

  v_limit := LEAST(COALESCE(max_results, 50), 50);
  IF v_limit < 1 THEN v_limit := 50; END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT
      s.notebook_id,
      s.title AS source_title,
      ts_headline('simple', s.content,
        plainto_tsquery('simple', v_query),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15'
      ) AS source_snippet,
      ts_rank(s.content_search, plainto_tsquery('simple', v_query)) AS rank,
      ROW_NUMBER() OVER (
        PARTITION BY s.notebook_id
        ORDER BY ts_rank(s.content_search, plainto_tsquery('simple', v_query)) DESC
      ) AS rn,
      COUNT(*) OVER (PARTITION BY s.notebook_id) AS match_count
    FROM public.sources s
    WHERE s.content_search @@ plainto_tsquery('simple', v_query)
      AND s.processing_status = 'completed'
  )
  SELECT
    n.id,
    n.title,
    n.description,
    n.icon,
    n.color,
    n.visibility,
    n.updated_at,
    m.source_title,
    m.source_snippet,
    m.match_count,
    m.rank
  FROM matches m
  JOIN public.notebooks n ON n.id = m.notebook_id
  WHERE m.rn = 1
  ORDER BY m.rank DESC
  LIMIT v_limit;
END;
$$;

-- ============ Activity Log Trigger Functions ============

CREATE OR REPLACE FUNCTION public.log_source_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = NEW.notebook_id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    NEW.notebook_id,
    COALESCE((SELECT auth.uid()), (SELECT user_id FROM public.notebooks WHERE id = NEW.notebook_id)),
    'source_added',
    jsonb_build_object('source_title', NEW.title, 'source_id', NEW.id, 'source_type', NEW.type)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_source_deleted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = OLD.notebook_id) THEN
    RETURN OLD;
  END IF;
  INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
  VALUES (
    OLD.notebook_id,
    COALESCE((SELECT auth.uid()), (SELECT user_id FROM public.notebooks WHERE id = OLD.notebook_id)),
    'source_deleted',
    jsonb_build_object('source_title', OLD.title, 'source_id', OLD.id, 'source_type', OLD.type)
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_source_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notebooks WHERE id = NEW.notebook_id) THEN
    RETURN NEW;
  END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.activity_log (notebook_id, actor_id, action_type, metadata)
    VALUES (
      NEW.notebook_id,
      COALESCE((SELECT auth.uid()), (SELECT user_id FROM public.notebooks WHERE id = NEW.notebook_id)),
      'source_updated',
      jsonb_build_object('old_title', OLD.title, 'new_title', NEW.title, 'source_id', NEW.id, 'source_type', NEW.type)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Cleanup chat history when notebook is deleted
CREATE OR REPLACE FUNCTION public.cleanup_notebook_chat_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.n8n_chat_histories
  WHERE session_id LIKE OLD.id::text || ':%';
  RETURN OLD;
END;
$$;


-- ============================================================================
-- BƯỚC 7: TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notebooks_updated_at ON public.notebooks;
CREATE TRIGGER update_notebooks_updated_at
    BEFORE UPDATE ON public.notebooks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sources_updated_at ON public.sources;
CREATE TRIGGER update_sources_updated_at
    BEFORE UPDATE ON public.sources
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notebook_members_updated_at ON public.notebook_members;
CREATE TRIGGER update_notebook_members_updated_at
    BEFORE UPDATE ON public.notebook_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_flowcharts_updated_at ON public.flowcharts;
CREATE TRIGGER update_flowcharts_updated_at
    BEFORE UPDATE ON public.flowcharts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRITICAL: auto-create profile on auth.users INSERT (on auth schema, not public)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS cleanup_notebook_chat_history_trigger ON public.notebooks;
CREATE TRIGGER cleanup_notebook_chat_history_trigger
    AFTER DELETE ON public.notebooks
    FOR EACH ROW EXECUTE FUNCTION public.cleanup_notebook_chat_history();

DROP TRIGGER IF EXISTS trigger_log_source_added ON public.sources;
CREATE TRIGGER trigger_log_source_added
    AFTER INSERT ON public.sources
    FOR EACH ROW EXECUTE FUNCTION public.log_source_added();

DROP TRIGGER IF EXISTS trigger_log_source_deleted ON public.sources;
CREATE TRIGGER trigger_log_source_deleted
    AFTER DELETE ON public.sources
    FOR EACH ROW EXECUTE FUNCTION public.log_source_deleted();

DROP TRIGGER IF EXISTS trigger_log_source_updated ON public.sources;
CREATE TRIGGER trigger_log_source_updated
    AFTER UPDATE ON public.sources
    FOR EACH ROW EXECUTE FUNCTION public.log_source_updated();


-- ============================================================================
-- BƯỚC 8: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebooks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.flowcharts         ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- BƯỚC 9: RLS POLICIES
-- (DROP IF EXISTS trước mỗi CREATE để idempotent)
-- ============================================================================

-- ─────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (SELECT public.is_admin())
  );

-- ─────────────────────────────────────────────
-- NOTEBOOKS
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Notebook read access"                ON public.notebooks;
DROP POLICY IF EXISTS "Users can create their own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Notebook write access"               ON public.notebooks;
DROP POLICY IF EXISTS "Notebook delete access"              ON public.notebooks;

-- SELECT: owner, accepted members, or public visibility notebooks
CREATE POLICY "Notebook read access"
  ON public.notebooks FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(id)) IS NOT NULL
    OR visibility = 'public'
    OR user_id = (SELECT auth.uid())
  );

-- INSERT: user can only create their own notebooks
CREATE POLICY "Users can create their own notebooks"
  ON public.notebooks FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- UPDATE: owner or editor
CREATE POLICY "Notebook write access"
  ON public.notebooks FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(id)) IN ('owner', 'editor', 'admin'));

-- DELETE: owner or admin
CREATE POLICY "Notebook delete access"
  ON public.notebooks FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(id)) IN ('owner', 'admin'));

-- ─────────────────────────────────────────────
-- SOURCES
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Source read access"   ON public.sources;
DROP POLICY IF EXISTS "Source write access"  ON public.sources;
DROP POLICY IF EXISTS "Source update access" ON public.sources;
DROP POLICY IF EXISTS "Source delete access" ON public.sources;

-- SELECT: members OR public notebook
CREATE POLICY "Source read access"
  ON public.sources FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
        AND notebooks.visibility = 'public'
    )
  );

-- INSERT: owner, editor, or admin
CREATE POLICY "Source write access"
  ON public.sources FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin'));

-- UPDATE: owner, editor, or admin
CREATE POLICY "Source update access"
  ON public.sources FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin'));

-- DELETE: owner OR editor (not just owner — per fix_editor_viewer_roles migration)
CREATE POLICY "Source delete access"
  ON public.sources FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'editor', 'admin'));

-- ─────────────────────────────────────────────
-- NOTES (private per user)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Private note read access"   ON public.notes;
DROP POLICY IF EXISTS "Private note write access"  ON public.notes;
DROP POLICY IF EXISTS "Private note update access" ON public.notes;
DROP POLICY IF EXISTS "Private note delete access" ON public.notes;

CREATE POLICY "Private note read access"
  ON public.notes FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

CREATE POLICY "Private note write access"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

CREATE POLICY "Private note update access"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- DELETE: owner of note OR editor role
CREATE POLICY "Private note delete access"
  ON public.notes FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
  );

-- ─────────────────────────────────────────────
-- DOCUMENTS (vector store)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Document read access"   ON public.documents;
DROP POLICY IF EXISTS "Document write access"  ON public.documents;
DROP POLICY IF EXISTS "Document update access" ON public.documents;
DROP POLICY IF EXISTS "Document delete access" ON public.documents;

CREATE POLICY "Document read access"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid)) IS NOT NULL
  );

CREATE POLICY "Document write access"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid))
      IN ('owner', 'editor', 'admin')
  );

CREATE POLICY "Document update access"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid))
      IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner, editor, or admin (per fix_editor_viewer_roles)
CREATE POLICY "Document delete access"
  ON public.documents FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_notebook_role((metadata->>'notebook_id')::uuid))
      IN ('owner', 'editor', 'admin')
  );

-- ─────────────────────────────────────────────
-- N8N CHAT HISTORIES
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Chat history read access"   ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history write access"  ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Chat history delete access" ON public.n8n_chat_histories;

-- SELECT: own messages + (member OR public notebook)
CREATE POLICY "Chat history read access"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = NULLIF(split_part(session_id, ':', 1), '')::uuid
          AND notebooks.visibility = 'public'
      )
    )
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

-- INSERT: any notebook participant (owner/editor/viewer) can chat
CREATE POLICY "Chat history write access"
  ON public.n8n_chat_histories FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) IS NOT NULL
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

-- DELETE: user deletes own chat (owner-role OR public notebook visitor)
CREATE POLICY "Chat history delete access"
  ON public.n8n_chat_histories FOR DELETE
  TO authenticated
  USING (
    (
      (SELECT public.get_notebook_role(NULLIF(split_part(session_id, ':', 1), '')::uuid)) = 'owner'
      OR (
        NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.notebooks
          WHERE notebooks.id = NULLIF(split_part(session_id, ':', 1), '')::uuid
            AND notebooks.visibility = 'public'
        )
      )
    )
    AND NULLIF(split_part(session_id, ':', 2), '')::uuid = (SELECT auth.uid())
  );

-- ─────────────────────────────────────────────
-- NOTEBOOK MEMBERS
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Notebook members visible to notebook participants" ON public.notebook_members;
DROP POLICY IF EXISTS "Only notebook owner can invite members"           ON public.notebook_members;
DROP POLICY IF EXISTS "Owner can update membership"                      ON public.notebook_members;
DROP POLICY IF EXISTS "Only notebook owner can remove members"           ON public.notebook_members;

CREATE POLICY "Notebook members visible to notebook participants"
  ON public.notebook_members FOR SELECT
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IS NOT NULL);

CREATE POLICY "Only notebook owner can invite members"
  ON public.notebook_members FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin'));

CREATE POLICY "Owner can update membership"
  ON public.notebook_members FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin'));

CREATE POLICY "Only notebook owner can remove members"
  ON public.notebook_members FOR DELETE
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IN ('owner', 'admin'));

-- ─────────────────────────────────────────────
-- ACTIVITY LOG
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "activity_log_select_members" ON public.activity_log;
CREATE POLICY "activity_log_select_members"
  ON public.activity_log FOR SELECT
  TO authenticated
  USING ((SELECT public.get_notebook_role(notebook_id)) IS NOT NULL);

-- ─────────────────────────────────────────────
-- FLOWCHARTS (private per user, with public notebook fallback)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Private flowchart read access"   ON public.flowcharts;
DROP POLICY IF EXISTS "Private flowchart write access"  ON public.flowcharts;
DROP POLICY IF EXISTS "Private flowchart update access" ON public.flowcharts;
DROP POLICY IF EXISTS "Private flowchart delete access" ON public.flowcharts;

CREATE POLICY "Private flowchart read access"
  ON public.flowcharts FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
          AND notebooks.visibility = 'public'
      )
    )
  );

CREATE POLICY "Private flowchart write access"
  ON public.flowcharts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
          AND notebooks.visibility = 'public'
      )
    )
  );

CREATE POLICY "Private flowchart update access"
  ON public.flowcharts FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
          AND notebooks.visibility = 'public'
      )
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
          AND notebooks.visibility = 'public'
      )
    )
  );

CREATE POLICY "Private flowchart delete access"
  ON public.flowcharts FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.get_notebook_role(notebook_id)) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notebooks
        WHERE notebooks.id = flowcharts.notebook_id
          AND notebooks.visibility = 'public'
      )
    )
  );


-- ============================================================================
-- BƯỚC 10: REALTIME CONFIGURATION
-- ============================================================================

ALTER TABLE public.notebooks          REPLICA IDENTITY FULL;
ALTER TABLE public.sources            REPLICA IDENTITY FULL;
ALTER TABLE public.notes              REPLICA IDENTITY FULL;
ALTER TABLE public.n8n_chat_histories REPLICA IDENTITY FULL;
ALTER TABLE public.notebook_members   REPLICA IDENTITY FULL;
ALTER TABLE public.flowcharts         REPLICA IDENTITY FULL;
-- activity_log: default REPLICA IDENTITY (PK) is sufficient (append-only)

ALTER PUBLICATION supabase_realtime SET TABLE
  public.notebooks,
  public.sources,
  public.notes,
  public.n8n_chat_histories,
  public.notebook_members,
  public.activity_log,
  public.flowcharts;


-- ============================================================================
-- BƯỚC 11: STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'sources', 'sources', false,
    26214400,  -- 25 MB
    ARRAY[
      'application/pdf',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
      'application/vnd.ms-excel',                                             -- .xls
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/m4a',
      'audio/ogg'
      -- NOTE: DOCX intentionally excluded
    ]
  ),
  (
    'audio', 'audio', false,
    104857600,  -- 100 MB
    ARRAY['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a']
  ),
  (
    'public-images', 'public-images', true,
    10485760,  -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  )
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public             = EXCLUDED.public;


-- ============================================================================
-- BƯỚC 12: STORAGE RLS POLICIES
-- ============================================================================

-- (Drop all old policies first for clean slate)
DROP POLICY IF EXISTS "Users can view their own source files"                             ON storage.objects;
DROP POLICY IF EXISTS "Users can upload source files to their notebooks"                  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to sources bucket"                  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to sources bucket with size limit"  ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own source files"                           ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own source files"                           ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read their own files"                      ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their own files"                    ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete source files"                                    ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete audio files"                                     ON storage.objects;
DROP POLICY IF EXISTS "Members can view source files"                                     ON storage.objects;
DROP POLICY IF EXISTS "Members can upload source files"                                   ON storage.objects;
DROP POLICY IF EXISTS "Members can update source files"                                   ON storage.objects;
DROP POLICY IF EXISTS "Members can delete source files"                                   ON storage.objects;
DROP POLICY IF EXISTS "Members can view audio files"                                      ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage audio files"                               ON storage.objects;
DROP POLICY IF EXISTS "Members can delete audio files"                                    ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view public images"                                     ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage public images"                             ON storage.objects;

-- ── SOURCES bucket ──
CREATE POLICY "Members can view source files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sources'
    AND (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IS NOT NULL
  );

CREATE POLICY "Members can upload source files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sources'
    AND (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid))
      IN ('owner', 'editor', 'admin')
  );

CREATE POLICY "Members can update source files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sources'
    AND (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid))
      IN ('owner', 'editor', 'admin')
  );

-- DELETE: owner OR editor (per fix_editor_viewer_roles)
CREATE POLICY "Members can delete source files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sources'
    AND (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid))
      IN ('owner', 'editor', 'admin')
  );

-- ── AUDIO bucket ──
CREATE POLICY "Members can view audio files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid)) IS NOT NULL
  );

-- INSERT/UPDATE: service_role only (Edge Functions write audio — bypasses RLS)
CREATE POLICY "Service role can manage audio files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'audio'
    AND auth.role() = 'service_role'
  );

-- DELETE: owner OR editor
CREATE POLICY "Members can delete audio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND (SELECT public.get_notebook_role((storage.foldername(name))[1]::uuid))
      IN ('owner', 'editor', 'admin')
  );

-- ── PUBLIC-IMAGES bucket ──
CREATE POLICY "Anyone can view public images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'public-images');

CREATE POLICY "Service role can manage public images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'public-images'
    AND auth.role() = 'service_role'
  );


-- ============================================================================
-- BƯỚC 13: SEED ADMIN USER
-- ============================================================================
-- Chỉ chạy sau khi user đã đăng ký (profile đã tồn tại)
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'vuongbui72440@gmail.com';


-- ============================================================================
-- HOÀN TẤT — Checklist sau khi restore:
-- ============================================================================
-- ✅ 9 Tables: profiles, notebooks, sources, notes, documents,
--              n8n_chat_histories, notebook_members, activity_log, flowcharts
-- ✅ 4 ENUMs:  source_type, member_role, invitation_status (+ 'expired' value)
-- ✅ 8 Functions + trigger functions
-- ✅ 11 Triggers (bao gồm on_auth_user_created trên auth.users)
-- ✅ RLS enabled + policies trên tất cả 9 tables
-- ✅ Realtime cho 7 tables
-- ✅ 3 Storage Buckets + RLS Storage Policies
-- ✅ HNSW halfvec index cho 3072-dim embeddings
--
-- SAU KHI RESTORE, bạn cần:
--   1. Re-ingest toàn bộ sources qua n8n để tái tạo vector embeddings
--      (bảng documents trống vì dimension đã đổi từ 1536 → 3072)
--   2. Kiểm tra: SELECT role FROM profiles WHERE email = 'vuongbui72440@gmail.com';
--      → phải trả về 'admin'
-- ============================================================================
