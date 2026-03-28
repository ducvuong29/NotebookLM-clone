# InsightsLM — Project Current State Documentation

> **Date**: 2026-03-26  
> **Version**: 0.2.0  
> **Status**: Epic 3 completed, Epic 4 in backlog

---

## 1. Project Overview

**InsightsLM** is a clone of Google's NotebookLM — an AI-powered notebook application that allows users to upload documents, generate notebook content (title, description, icon, example questions) from AI, chat with documents using AI, and generate audio overviews. The application supports Vietnamese localization throughout.

### Core Capabilities
- **Document Management**: Upload PDF, audio, website URL, YouTube URL, or paste text as sources  
- **AI Notebook Generation**: Auto-generate notebook metadata (title, description, icon, color, example questions)  
- **AI Chat**: Context-aware chat with uploaded document sources  
- **Audio Overview**: AI-generated audio summaries of notebook content  
- **Admin Panel**: User management, CSV bulk import, public notebook management  
- **Email OTP Authentication**: Passwordless login via one-time passcode  

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Vite | 8.x |
| **Frontend** | React | 18.3 |
| **Language** | TypeScript | 5.5 |
| **Styling** | TailwindCSS + tailwindcss-animate | 3.4 |
| **UI Components** | shadcn/ui (Radix UI primitives) | — |
| **Typography** | Plus Jakarta Sans, Playfair Display | — |
| **State Management** | TanStack React Query | 5.56 |
| **Routing** | React Router DOM | 6.26 |
| **Forms** | React Hook Form + Zod | — |
| **Backend** | Supabase (Auth, DB, Storage, Edge Functions) | 2.49 |
| **AI Orchestration** | n8n (external, self-hosted) | — |
| **Testing** | Playwright (E2E), Vitest + Testing Library (Unit) | — |
| **Build** | Vite + SWC (via @vitejs/plugin-react-swc) | — |

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite + React)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │Dashboard │  │ Notebook │  │   Auth   │  │  Admin Panel  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       │              │             │               │           │
│  ┌────┴──────────────┴─────────────┴───────────────┴────────┐  │
│  │              Custom Hooks Layer (18 hooks)                │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                 │
│  ┌───────────────────────────┴──────────────────────────────┐  │
│  │          Supabase Client (@supabase/supabase-js)          │  │
│  └───────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼─────────────────────────────────┘
                               │
┌──────────────────────────────┼─────────────────────────────────┐
│                     SUPABASE PLATFORM                          │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Auth (OTP)│  │ PostgreSQL│  │  Storage  │  │Edge Funcs  │  │
│  └────────────┘  └───────────┘  └──────────┘  └──────┬─────┘  │
└──────────────────────────────────────────────────────┼─────────┘
                                                       │
                          Webhooks (HTTP POST)          │
                                                       │
┌──────────────────────────────────────────────────────┼─────────┐
│                     n8n WORKFLOWS                     │        │
│  ┌────────────────────┐  ┌──────────────────────┐    │        │
│  │ Document Processing│  │ Notebook Generation  │    │        │
│  │ (extract, summarize│  │ (title, desc, icon,  │    │        │
│  │  via AI)           │  │  questions via AI)   │    │        │
│  └────────┬───────────┘  └──────────────────────┘    │        │
│  ┌────────┴───────────┐  ┌──────────────────────┐    │        │
│  │ Chat with Sources  │  │ Audio Overview Gen   │    │        │
│  │ (RAG pipeline)     │  │ (TTS via AI)         │    │        │
│  └────────────────────┘  └──────────────────────┘    │        │
│                              Callbacks               │        │
│                              (HTTP POST back)        │        │
└──────────────────────────────────────────────────────┘─────────┘
```

---

## 4. n8n Integration Architecture

n8n serves as the **AI orchestration layer**. The Supabase Edge Functions act as proxies — they authenticate the user, validate ownership, then forward requests to n8n webhooks. n8n processes them (using AI models) and callbacks to Supabase with results.

### 4.1 Environment Variables (Webhook URLs)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NOTEBOOK_GENERATION_URL` | `generate-notebook-content` | n8n workflow that generates notebook title, description, icon, color, example questions |
| `NOTEBOOK_GENERATION_AUTH` | Multiple functions | Shared auth header for n8n webhook authentication |
| `DOCUMENT_PROCESSING_WEBHOOK_URL` | `process-document` | n8n workflow that extracts text, generates summary from documents |
| `NOTEBOOK_CHAT_URL` | `send-chat-message` | n8n workflow for RAG-based chat with document sources |
| `AUDIO_GENERATION_WEBHOOK_URL` | `generate-audio-overview` | n8n workflow for text-to-speech audio generation |

### 4.2 Flow Pattern: Edge Function → n8n → Callback

**Document Processing Flow:**
```
User uploads file → Frontend → process-document (Edge Fn)
  → Validates JWT + ownership
  → POST to DOCUMENT_PROCESSING_WEBHOOK_URL (n8n)
    Payload: { source_id, file_url, file_path, source_type, callback_url }
  ← n8n processes (extract text, summarize via AI)
  → POST to process-document-callback (Edge Fn)
    Payload: { source_id, content, summary, title, status }
  → Updates sources table
```

**Notebook Content Generation Flow:**
```
After source processed → Frontend → generate-notebook-content (Edge Fn)
  → Validates JWT + ownership
  → POST to NOTEBOOK_GENERATION_URL (n8n)
    Payload: { sourceType, filePath/content }
  ← n8n generates via AI
  ← Response: { output: { title, summary, notebook_icon, background_color, example_questions } }
  → Updates notebooks table directly (synchronous)
```

**Chat Flow:**
```
User sends message → Frontend → send-chat-message (Edge Fn)
  → Validates JWT (25s timeout enforced)
  → POST to NOTEBOOK_CHAT_URL (n8n)
    Payload: { session_id, message, user_id, timestamp }
  ← n8n RAG pipeline responds
  ← Returns AI response to user (synchronous)
```

**Audio Overview Flow:**
```
User requests audio → Frontend → generate-audio-overview (Edge Fn)
  → Validates JWT + ownership
  → Sets status to 'generating'
  → EdgeRuntime.waitUntil (background task):
    POST to AUDIO_GENERATION_WEBHOOK_URL (n8n)
    Payload: { notebook_id, callback_url }
  ← Returns immediately with 'generating' status
  ... n8n processes TTS asynchronously ...
  → POST to audio-generation-callback (Edge Fn)
    Payload: { notebook_id, audio_url, status }
  → Updates notebooks table with audio_url + 24h expiry
```

### 4.3 n8n Database

The project includes `n8n_db.sqlite` (~44MB) at the project root — this is the self-hosted n8n instance's local database containing all workflow definitions, credentials, and execution history.

---

## 5. Supabase Edge Functions (10 total)

| Function | Type | JWT | n8n Integration | Description |
|----------|------|-----|-----------------|-------------|
| `admin-api` | User-facing | Internal verify | No | Multi-action admin API (create_user, list_users, toggle_user_status, bulk_create_users, create/delete_public_notebook) |
| `generate-notebook-content` | User-facing | Internal verify | Yes (sync) | Sends source data to n8n, receives notebook metadata |
| `send-chat-message` | User-facing | Internal verify | Yes (sync, 25s timeout) | Proxies chat messages to n8n RAG pipeline |
| `process-document` | User-facing | Internal verify | Yes (async) | Triggers document processing in n8n, n8n callbacks when done |
| `process-additional-sources` | User-facing | Internal verify | Yes | Processes additional sources added to notebook |
| `generate-audio-overview` | User-facing | Internal verify | Yes (async, EdgeRuntime.waitUntil) | Triggers audio generation in n8n |
| `generate-note-title` | User-facing | Internal verify | Yes | Generates title for user notes |
| `refresh-audio-url` | User-facing | Internal verify | No | Refreshes expired audio URLs |
| `process-document-callback` | Callback (n8n) | No auth | Receives from n8n | Receives processed document data from n8n |
| `audio-generation-callback` | Callback (n8n) | No auth | Receives from n8n | Receives audio URL from n8n |

> **Security Note**: All user-facing functions verify JWT internally. Callback functions have no auth (called by n8n webhooks).

---

## 6. Database Schema (PostgreSQL via Supabase)

### 6.1 Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `notebooks` | User notebooks | id, title, description, icon, color, user_id, visibility, generation_status, example_questions, audio_overview_url, audio_overview_generation_status, audio_url_expires_at |
| `sources` | Document sources per notebook | id, notebook_id, title, file_path, source_type, content, summary, processing_status |
| `notes` | User notes within notebooks | id, notebook_id, title, content |
| `chat_sessions` | Chat conversation sessions | id, notebook_id |
| `chat_messages` | Individual chat messages | id, session_id, role, content, citations |
| `profiles` | User profiles | id (= auth.users.id), full_name, role |

### 6.2 Migrations (6 files)

| Migration | Description |
|-----------|-------------|
| `v0.1.sql` | Initial schema — notebooks, sources, notes, chat tables, storage, RLS policies |
| `schema_optimization.sql` | Performance indexes and optimizations |
| `v0.2_optimized.sql` | Additional columns and schema updates |
| `storage_size_limit.sql` | Storage bucket size limits |
| `add_notebook_visibility.sql` | Adds `visibility` column to notebooks |
| `admin_role.sql` | Admin role infrastructure, profiles table, `is_admin()` function |

---

## 7. Frontend Architecture

### 7.1 App Route Structure

```
/           → Dashboard (ProtectedRoute)
/notebook   → Notebook creation (ProtectedRoute)
/notebook/:id → Notebook detail view (ProtectedRoute)
/admin      → AdminPanel (ProtectedRoute → AdminGuard)
/auth       → Auth (login/OTP)
*           → NotFound
```

### 7.2 Provider Hierarchy

```
QueryClientProvider (TanStack)
  └─ ThemeProvider (light/dark/system)
       └─ TooltipProvider
            └─ AuthProvider
                 └─ Toaster + Sonner (notifications)
                      └─ BrowserRouter → Routes
```

### 7.3 Components (28+ custom)

| Group | Components |
|-------|-----------|
| **auth/** | `AuthForm`, `ProtectedRoute`, `AdminGuard` |
| **dashboard/** | `DashboardHeader`, `EmptyDashboard`, `NotebookCard`, `NotebookGrid` |
| **notebook/** | `AddSourcesDialog`, `AudioPlayer`, `ChatArea`, `CopiedTextDialog`, `MobileNotebookTabs`, `MultipleWebsiteUrlsDialog`, `NoteEditor`, `NotebookHeader`, `PasteTextDialog`, `RenameSourceDialog`, `SaveToNoteButton`, `SourcesSidebar`, `StudioSidebar`, `WebsiteUrlInput`, `YouTubeUrlInput` |
| **chat/** | `CitationButton`, `MarkdownRenderer`, `SourceContentViewer`, `SourceViewer` |
| **admin/** | `BulkImportDialog`, `CreateUserDialog`, `PublicNotebooksView`, `UserTable` |
| **ui/** | 51 shadcn/ui components + `Logo`, `ThemeToggle` |
| **root** | `ErrorBoundary` |

### 7.4 Custom Hooks (18)

| Hook | Purpose |
|------|---------|
| `useChatMessages` | Chat message CRUD and AI interaction |
| `useSources` | Source management (upload, list, process) |
| `useNotebooks` | Notebook CRUD operations |
| `useNotebookDelete` | Notebook deletion with cleanup |
| `useNotebookGeneration` | Trigger notebook content generation |
| `useNotebookUpdate` | Notebook field updates |
| `useNotes` | Note CRUD within notebooks |
| `useFileUpload` | File upload to Supabase Storage |
| `useDocumentProcessing` | Document processing state management |
| `useSourceDelete` | Source deletion with storage cleanup |
| `useSourceUpdate` | Source field updates |
| `useAudioOverview` | Audio generation and playback state |
| `useAdminUsers` | Admin user list, search, status toggle |
| `useIsAdmin` | Check admin role from profile |
| `useDebounce` | Debounced values for search inputs |
| `use-mobile` | Mobile viewport detection |
| `useIsDesktop` | Desktop viewport detection |
| `use-toast` | Toast notification system |

### 7.5 Contexts

| Context | Purpose |
|---------|---------|
| `AuthContext` | Email OTP auth state, session management, sign-in/sign-out |
| `ThemeContext` | Light/dark/system theme with persistence |

---

## 8. Sprint Progress

### Completed Epics

| Epic | Name | Status |
|------|------|--------|
| **Epic 1** | MVP Foundation & Resiliency | ✅ Done |
| **Epic 2** | Design System & UX | ✅ Done |
| **Epic 3** | Admin Panel & Auth Enhancements | ✅ Done |

### Current Backlog — Epic 4: Sharing & Collaboration

| Story | Description | Status |
|-------|-------------|--------|
| 4-1 | Database migration (visibility, members) | Backlog |
| 4-2 | RLS policy rewrite (critical) | Backlog |
| 4-3 | Dashboard tabs + notebook filtering | Backlog |
| 4-4 | Share dialog + member management | Backlog |
| 4-5 | Activity log | Backlog |
| 4-6 | Notebook view header + collapsible panels | Backlog |

---

## 9. Testing Infrastructure

### E2E Tests (Playwright)
- `auth.spec.ts` — Authentication flows
- `dashboard.spec.ts` — Dashboard functionality
- `admin-csv-import.spec.ts` — CSV bulk user import
- `ChatResiliency.test.tsx` — Chat error handling & retry
- `CitationButton.test.tsx` — Citation UI
- `FileUploadValidation.test.tsx` — File upload validation
- `SourceContentViewer.test.tsx` — Source content display
- `VietnameseLocalization.test.tsx` — Vietnamese UI strings

### Configuration
- Playwright config: `playwright.config.ts`
- Vitest for unit tests

---

## 10. Key Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build configuration with SWC plugin |
| `tailwind.config.ts` | TailwindCSS with custom theme tokens, design system |
| `tsconfig.json` | TypeScript project references |
| `eslint.config.js` | ESLint flat config for React |
| `postcss.config.js` | PostCSS with TailwindCSS + autoprefixer |
| `supabase/config.toml` | Supabase local dev config (auth, DB, storage, edge runtime) |
| `components.json` | shadcn/ui component configuration |
| `.env` | Environment variables (Supabase URL, keys, webhook URLs) |

---

## 11. Project Directory Structure

```
NotebookLM-clone/
├── src/
│   ├── App.tsx                    # Root app with routes & providers
│   ├── main.tsx                   # Entry point
│   ├── index.css                  # Global styles + design tokens
│   ├── components/
│   │   ├── admin/                 # Admin panel components (4)
│   │   ├── auth/                  # Auth components (3)
│   │   ├── chat/                  # Chat display components (4)
│   │   ├── dashboard/             # Dashboard components (4)
│   │   ├── notebook/              # Notebook workspace components (15)
│   │   ├── ui/                    # shadcn/ui + custom UI (51)
│   │   └── ErrorBoundary.tsx
│   ├── contexts/                  # AuthContext, ThemeContext
│   ├── hooks/                     # 18 custom hooks
│   ├── pages/                     # 6 page components
│   ├── services/                  # authService.ts
│   ├── integrations/supabase/     # Supabase client + generated types
│   ├── types/                     # message.ts type definitions
│   └── lib/                       # utils.ts (cn helper)
├── supabase/
│   ├── config.toml                # Supabase local config
│   ├── functions/                 # 10 Edge Functions
│   │   ├── admin-api/
│   │   ├── generate-notebook-content/
│   │   ├── send-chat-message/
│   │   ├── process-document/
│   │   ├── process-document-callback/
│   │   ├── process-additional-sources/
│   │   ├── generate-audio-overview/
│   │   ├── audio-generation-callback/
│   │   ├── generate-note-title/
│   │   └── refresh-audio-url/
│   └── migrations/                # 6 SQL migrations
├── tests/
│   ├── e2e/                       # 8 test files
│   └── setup.ts
├── docs/                          # Documentation
├── plans/                         # Original project plan
├── n8n_db.sqlite                  # n8n workflow database (~44MB)
├── _bmad-output/                  # BMad artifacts
├── design-artifacts/              # Design specs
└── dist/                          # Build output
```
