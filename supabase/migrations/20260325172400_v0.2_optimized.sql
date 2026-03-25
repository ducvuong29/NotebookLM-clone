-- ============================================================================
-- COMPLETE DATABASE SCHEMA — v0.2 (Optimized)
-- This script creates the ENTIRE InsightsLM database schema from scratch
-- with all performance, security, and data integrity optimizations applied.
--
-- Changes from v0.1:
--   Fix #1: auth.uid() wrapped in (select ...) in ALL RLS policies (5-10x perf)
--   Fix #2: GIN + expression indexes on documents.metadata (10-100x search)
--   Fix #5: CHECK constraints on status columns (data integrity)
--   Fix #6: SET search_path = '' on ALL SECURITY DEFINER functions (security)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE source_type AS ENUM ('pdf', 'text', 'website', 'youtube', 'audio');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Chat histories table
CREATE TABLE IF NOT EXISTS public.n8n_chat_histories (
  id serial not null,
  session_id uuid not null,
  message jsonb not null,
  constraint n8n_chat_histories_pkey primary key (id)
) TABLESPACE pg_default;

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Notebooks table (with CHECK constraints — Fix #5)
CREATE TABLE IF NOT EXISTS public.notebooks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    color text DEFAULT 'gray',
    icon text DEFAULT '📝',
    generation_status text DEFAULT 'completed'
        CONSTRAINT chk_notebooks_generation_status
        CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed')),
    audio_overview_generation_status text
        CONSTRAINT chk_notebooks_audio_generation_status
        CHECK (audio_overview_generation_status IS NULL
            OR audio_overview_generation_status IN ('generating', 'completed', 'failed')),
    audio_overview_url text,
    audio_url_expires_at timestamp with time zone,
    example_questions text[] DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sources table (with CHECK constraint — Fix #5)
CREATE TABLE IF NOT EXISTS public.sources (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    notebook_id uuid NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    title text NOT NULL,
    type source_type NOT NULL,
    url text,
    file_path text,
    file_size bigint,
    display_name text,
    content text,
    summary text,
    processing_status text DEFAULT 'pending'
        CONSTRAINT chk_sources_processing_status
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Notes table
CREATE TABLE IF NOT EXISTS public.notes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    notebook_id uuid NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    title text NOT NULL,
    content text NOT NULL,
    source_type text DEFAULT 'user',
    extracted_text text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Documents table (vector embeddings)
CREATE TABLE IF NOT EXISTS public.documents (
    id bigserial PRIMARY KEY,
    content text,
    metadata jsonb,
    embedding vector(1536)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Notebooks indexes
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON public.notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at ON public.notebooks(updated_at DESC);

-- Sources indexes
CREATE INDEX IF NOT EXISTS idx_sources_notebook_id ON public.sources(notebook_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON public.sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_processing_status ON public.sources(processing_status);

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_notes_notebook_id ON public.notes(notebook_id);

-- Chat histories indexes
CREATE INDEX IF NOT EXISTS idx_chat_histories_session_id ON public.n8n_chat_histories(session_id);

-- Documents indexes (Fix #2 — GIN + expression index for metadata JSONB)
CREATE INDEX IF NOT EXISTS idx_documents_metadata
    ON public.documents USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_documents_notebook_id
    ON public.documents ((metadata->>'notebook_id'));

-- Vector similarity index
-- NOTE: HNSW index does not support >2000 dimensions.
-- gemini-embedding-001 outputs 3072 dims, so we skip index creation here.
-- When enough data exists, create an IVFFlat index:
-- CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

-- Function to handle new user creation
-- (Fix #6 — search_path already set in v0.1)
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
        COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    );
    RETURN new;
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$;

-- Function to check notebook ownership
-- (Fix #1 + Fix #6 — cached auth.uid() + search_path pinned)
CREATE OR REPLACE FUNCTION public.is_notebook_owner(notebook_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.notebooks
        WHERE id = notebook_id_param
        AND user_id = (select auth.uid())
    );
$$;

-- Function to check notebook ownership for documents
-- (Fix #1 + Fix #6 — cached auth.uid() + search_path pinned)
CREATE OR REPLACE FUNCTION public.is_notebook_owner_for_document(doc_metadata jsonb)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.notebooks
        WHERE id = (doc_metadata->>'notebook_id')::uuid
        AND user_id = (select auth.uid())
    );
$$;

-- Function to match documents using vector similarity
CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding vector,
    match_count integer DEFAULT NULL,
    filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    id bigint,
    content text,
    metadata jsonb,
    similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        documents.id,
        documents.content,
        documents.metadata,
        1 - (documents.embedding <=> query_embedding) as similarity
    FROM public.documents
    WHERE documents.metadata @> filter
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- All policies use (select auth.uid()) pattern for per-query caching (Fix #1)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;

-- ===== PROFILES POLICIES =====

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING ((select auth.uid()) = id);

-- ===== NOTEBOOKS POLICIES =====

DROP POLICY IF EXISTS "Users can view their own notebooks" ON public.notebooks;
CREATE POLICY "Users can view their own notebooks"
    ON public.notebooks FOR SELECT
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own notebooks" ON public.notebooks;
CREATE POLICY "Users can create their own notebooks"
    ON public.notebooks FOR INSERT
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notebooks" ON public.notebooks;
CREATE POLICY "Users can update their own notebooks"
    ON public.notebooks FOR UPDATE
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own notebooks" ON public.notebooks;
CREATE POLICY "Users can delete their own notebooks"
    ON public.notebooks FOR DELETE
    USING ((select auth.uid()) = user_id);

-- ===== SOURCES POLICIES =====

DROP POLICY IF EXISTS "Users can view sources from their notebooks" ON public.sources;
CREATE POLICY "Users can view sources from their notebooks"
    ON public.sources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can create sources in their notebooks" ON public.sources;
CREATE POLICY "Users can create sources in their notebooks"
    ON public.sources FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can update sources in their notebooks" ON public.sources;
CREATE POLICY "Users can update sources in their notebooks"
    ON public.sources FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can delete sources from their notebooks" ON public.sources;
CREATE POLICY "Users can delete sources from their notebooks"
    ON public.sources FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = sources.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

-- ===== NOTES POLICIES =====

DROP POLICY IF EXISTS "Users can view notes from their notebooks" ON public.notes;
CREATE POLICY "Users can view notes from their notebooks"
    ON public.notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can create notes in their notebooks" ON public.notes;
CREATE POLICY "Users can create notes in their notebooks"
    ON public.notes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can update notes in their notebooks" ON public.notes;
CREATE POLICY "Users can update notes in their notebooks"
    ON public.notes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can delete notes from their notebooks" ON public.notes;
CREATE POLICY "Users can delete notes from their notebooks"
    ON public.notes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.notebooks
            WHERE notebooks.id = notes.notebook_id
            AND notebooks.user_id = (select auth.uid())
        )
    );

-- ===== DOCUMENTS POLICIES =====

DROP POLICY IF EXISTS "Users can view documents from their notebooks" ON public.documents;
CREATE POLICY "Users can view documents from their notebooks"
    ON public.documents FOR SELECT
    USING (public.is_notebook_owner_for_document(metadata));

DROP POLICY IF EXISTS "Users can create documents in their notebooks" ON public.documents;
CREATE POLICY "Users can create documents in their notebooks"
    ON public.documents FOR INSERT
    WITH CHECK (public.is_notebook_owner_for_document(metadata));

DROP POLICY IF EXISTS "Users can update documents in their notebooks" ON public.documents;
CREATE POLICY "Users can update documents in their notebooks"
    ON public.documents FOR UPDATE
    USING (public.is_notebook_owner_for_document(metadata));

DROP POLICY IF EXISTS "Users can delete documents from their notebooks" ON public.documents;
CREATE POLICY "Users can delete documents from their notebooks"
    ON public.documents FOR DELETE
    USING (public.is_notebook_owner_for_document(metadata));

-- ===== N8N CHAT HISTORIES POLICIES =====

DROP POLICY IF EXISTS "Users can view chat histories from their notebooks" ON public.n8n_chat_histories;
CREATE POLICY "Users can view chat histories from their notebooks"
    ON public.n8n_chat_histories FOR SELECT
    USING (public.is_notebook_owner(session_id::uuid));

DROP POLICY IF EXISTS "Users can create chat histories in their notebooks" ON public.n8n_chat_histories;
CREATE POLICY "Users can create chat histories in their notebooks"
    ON public.n8n_chat_histories FOR INSERT
    WITH CHECK (public.is_notebook_owner(session_id::uuid));

DROP POLICY IF EXISTS "Users can delete chat histories from their notebooks" ON public.n8n_chat_histories;
CREATE POLICY "Users can delete chat histories from their notebooks"
    ON public.n8n_chat_histories FOR DELETE
    USING (public.is_notebook_owner(session_id::uuid));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_notebooks_updated_at ON public.notebooks;
DROP TRIGGER IF EXISTS update_sources_updated_at ON public.sources;
DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notebooks_updated_at
    BEFORE UPDATE ON public.notebooks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sources_updated_at
    BEFORE UPDATE ON public.sources
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- REALTIME CONFIGURATION
-- ============================================================================

ALTER TABLE public.notebooks REPLICA IDENTITY FULL;
ALTER TABLE public.sources REPLICA IDENTITY FULL;
ALTER TABLE public.notes REPLICA IDENTITY FULL;
ALTER TABLE public.n8n_chat_histories REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notebooks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sources;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.n8n_chat_histories;

-- ============================================================================
-- STORAGE BUCKETS AND POLICIES
-- ============================================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('sources', 'sources', false, 52428800, ARRAY[
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/m4a'
  ]),
  ('audio', 'audio', false, 104857600, ARRAY[
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/m4a'
  ]),
  ('public-images', 'public-images', true, 10485760, ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;

-- ===== SOURCES BUCKET RLS =====
-- (Fix #1 — using (select auth.uid()) in storage policies too)

CREATE POLICY "Users can view their own source files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'sources' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM notebooks WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can upload source files to their notebooks"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'sources' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM notebooks WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can update their own source files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'sources' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM notebooks WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can delete their own source files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'sources' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM notebooks WHERE user_id = (select auth.uid())
  )
);

-- ===== AUDIO BUCKET RLS =====

CREATE POLICY "Users can view their own audio files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM notebooks WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Service role can manage audio files"
ON storage.objects FOR ALL
USING (
  bucket_id = 'audio' AND
  auth.role() = 'service_role'
);

CREATE POLICY "Users can delete their own audio files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM notebooks WHERE user_id = (select auth.uid())
  )
);

-- ===== PUBLIC-IMAGES BUCKET RLS =====

CREATE POLICY "Anyone can view public images"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-images');

CREATE POLICY "Service role can manage public images"
ON storage.objects FOR ALL
USING (
  bucket_id = 'public-images' AND
  auth.role() = 'service_role'
);
