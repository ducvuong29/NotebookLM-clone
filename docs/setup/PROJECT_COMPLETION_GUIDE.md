# NotebookLM Clone - Project Completion Guide

**Project:** InsightsLM (NotebookLM Clone)
**Repository:** https://github.com/ducvuong29/NotebookLM-clone
**Last Updated:** 2026-03-18 (Session 2 - All Workflows Fixed & Published)
**Status:** ✅ ALL 6 WORKFLOWS PUBLISHED - Pending Supabase Secrets

---

## 📋 Project Overview

InsightsLM is an open-source, self-hostable alternative to Google NotebookLM. It enables:

- Chat with documents (RAG - Retrieval Augmented Generation)
- Verifiable citations
- Podcast generation from documents
- Private, self-hosted deployment

### Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Frontend   | Vite + React 18 + TypeScript + shadcn-ui + Tailwind CSS |
| Backend    | Supabase (Database, Auth, Storage, Edge Functions)      |
| Automation | n8n (self-hosted with Docker + FFmpeg)                  |
| AI         | Gemini API (replacing OpenAI)                           |

---

## 🎯 Current Status

### ✅ Completed

- [x] Supabase project created
- [x] Database migration SQL executed
- [x] Environment file (`.env`) created
- [x] Codebase cloned from GitHub
- [x] Docker Desktop installed
- [x] n8n Docker container running (http://localhost:5678)
- [x] n8n admin account created
- [x] n8n API key generated
- [x] Custom Dockerfile with FFmpeg support
- [x] n8n Credentials configured:
  - Supabase API credential (Supabase account)
  - PostgreSQL credential (Postgres account)
  - Header Auth credential (Header Auth account)
  - Google Gemini API credential (Google Gemini(PaLM) Api account)
  - n8n API credential (n8n account)
- [x] Import Insights LM Workflows executed successfully
- [x] 6 child workflows imported to n8n
- [x] Supabase CLI installed
- [x] All 9 Edge Functions deployed:
  - generate-note-title
  - generate-notebook-content
  - process-document
  - process-additional-sources
  - send-chat-message
  - audio-generation-callback
  - generate-audio-overview
  - process-document-callback
  - refresh-audio-url
- [x] "Verify JWT with legacy secret" disabled on all edge functions
- [x] Supabase Secrets created:
  - NOTEBOOK_GENERATION_AUTH
  - GEMINI_API_KEY
- [x] **ALL 6 n8n workflows published:**
  - ✅ InsightsLM - Extract Text (Published)
  - ✅ InsightsLM - Chat (Published)
  - ✅ InsightsLM - Upsert to Vector Store (Published)
  - ✅ InsightsLM - Generate Notebook Details (Published)
  - ✅ InsightsLM - Podcast Generation (Published)
  - ✅ InsightsLM - Process Additional Sources (No fix needed)
- [x] **OpenAI → Gemini migration complete in all workflows**
- [x] **n8n v1.x compatibility fixes:**
  - ✅ Replaced `executeCommand` nodes with `Code` nodes
  - ✅ Fixed deprecated node types

### ⏳ In Progress

- [ ] Add webhook URLs to Supabase Secrets (5 remaining secrets):
  - [ ] `NOTEBOOK_CHAT_URL` - Chat webhook
  - [ ] `NOTEBOOK_GENERATION_URL` - Notebook generation webhook
  - [ ] `AUDIO_GENERATION_WEBHOOK_URL` - Audio generation webhook
  - [ ] `DOCUMENT_PROCESSING_WEBHOOK_URL` - Document processing webhook
  - [ ] `ADDITIONAL_SOURCES_WEBHOOK_URL` - Additional sources webhook
- [ ] End-to-end testing
- [ ] Frontend local development testing

### ❌ Pending

- [ ] Document upload testing
- [ ] Chat functionality testing
- [ ] Podcast generation testing
- [ ] Production deployment

---

## 🚀 Setup Roadmap

### Phase 1: Supabase Edge Functions (Priority: HIGH) ✅ COMPLETED

#### Step 1.1: ✅ Install Supabase CLI - COMPLETED

```bash
# Windows (PowerShell as Administrator)
npm install -g supabase
```

#### Step 1.2: ✅ Login to Supabase - COMPLETED

```bash
supabase login
```

#### Step 1.3: ✅ Link Project - COMPLETED

```bash
cd "F:\NotebookLM clone\NotebookLM-clone"
supabase link --project-ref qreqmcprolrpqkrdpwrl
```

#### Step 1.4: ✅ Deploy Edge Functions - COMPLETED

All 9 functions deployed:

```bash
supabase functions deploy generate-note-title
supabase functions deploy generate-notebook-content
supabase functions deploy process-document
supabase functions deploy process-additional-sources
supabase functions deploy send-chat-message
supabase functions deploy audio-generation-callback
supabase functions deploy generate-audio-overview
supabase functions deploy process-document-callback
supabase functions deploy refresh-audio-url
```

#### Step 1.5: ✅ Configure Edge Functions - COMPLETED

In Supabase Dashboard → Edge Functions:

- For EACH function, set **"Verify JWT with legacy secret" = FALSE**
- Functions handle auth internally now

#### Step 1.6: ⏳ Create Supabase Secrets - IN PROGRESS

In Supabase Dashboard → Edge Functions → Secrets:

**Completed:**

- [x] `NOTEBOOK_GENERATION_AUTH` - Auth password for webhooks
- [x] `GEMINI_API_KEY` - Gemini API key

**Pending (need webhook URLs from n8n):**

- [ ] `NOTEBOOK_CHAT_URL` - Chat webhook
- [ ] `NOTEBOOK_GENERATION_URL` - Notebook generation webhook
- [ ] `AUDIO_GENERATION_WEBHOOK_URL` - Audio generation webhook
- [ ] `DOCUMENT_PROCESSING_WEBHOOK_URL` - Document processing webhook
- [ ] `ADDITIONAL_SOURCES_WEBHOOK_URL` - Additional sources webhook

---

### Phase 2: n8n Self-Hosted Setup (Priority: HIGH) ✅ COMPLETED

#### Step 2.1: ✅ Install Docker Desktop - COMPLETED

Download from: https://www.docker.com/products/docker-desktop/

#### Step 2.2: ✅ Create n8n Docker Compose - COMPLETED

Create folder `C:\n8n` and add `docker-compose.yml`:

```yaml
version: "3.8"

services:
  n8n:
    build: .
    container_name: n8n_server
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=Asia/Ho_Chi_Minh
    volumes:
      - ./n8n_data:/home/node/.n8n
```

#### Step 2.3: ✅ Custom Dockerfile with FFmpeg - COMPLETED

```dockerfile
FROM mwader/static-ffmpeg:6.0 AS ffmpeg-source
FROM n8nio/n8n:latest
USER root
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/
USER node
```

#### Step 2.4: ✅ Start n8n - COMPLETED

```bash
cd C:\n8n
docker compose build --no-cache
docker compose up -d
```

Access n8n at: http://localhost:5678

#### Step 2.5: ✅ Import Workflows - COMPLETED

**Completed Steps:**

1. [x] Imported `Import_Insights_LM_Workflows.json`
2. [x] Created n8n API key
3. [x] Filled in all credential information in "Enter User Values" node
4. [x] Created all required credentials:
   - Supabase account
   - Postgres account
   - Header Auth account
   - Google Gemini(PaLM) Api account
   - n8n API account
5. [x] Executed import workflow successfully
6. [x] 6 child workflows imported

#### Step 2.6: ✅ Configure n8n Credentials - COMPLETED

All credentials have been configured:

- [x] Supabase API
- [x] PostgreSQL
- [x] Header Auth
- [x] Google Gemini API
- [x] n8n API

#### Step 2.7: ✅ Publish Workflows - COMPLETED

**All 6 workflows published:**

1. ✅ **InsightsLM - Extract Text** - **PUBLISHED** ✅
   - Replaced OpenAI node with Gemini HTTP Request

2. ✅ **InsightsLM - Chat** - **PUBLISHED** ✅
   - Replaced OpenAI Chat Model with Google Gemini Chat Model
   - Replaced Embeddings OpenAI with Gemini Embeddings (HTTP Request)

3. ✅ **InsightsLM - Upsert to Vector Store** - **PUBLISHED** ✅
   - Replaced OpenAI Chat Model with Google Gemini Chat Model
   - Replaced Embeddings OpenAI with Gemini Embeddings

4. ✅ **InsightsLM - Generate Notebook Details** - **PUBLISHED** ✅
   - Replaced OpenAI Chat Model with Google Gemini Chat Model

5. ✅ **InsightsLM - Podcast Generation** - **PUBLISHED** ✅
   - Replaced OpenAI Chat Model with Google Gemini Chat Model
   - Replaced `executeCommand` nodes with `Code` nodes (n8n v1.x compatibility)
   - Fixed deprecated node types

6. ✅ **InsightsLM - Process Additional Sources** - **NO FIX NEEDED** ✅
   - No OpenAI nodes
   - No deprecated nodes

#### Step 2.8: Get Webhook URLs

For each workflow, get Production URL from Webhook node:

| Workflow | Webhook ID | Secret Name | Status |
|----------|-----------|-------------|--------|
| InsightsLM - Chat | `2fabf43f-6e6e-424b-8e93-9150e9ce7d6c` | `NOTEBOOK_CHAT_URL` | ⏳ Pending |
| InsightsLM - Generate Notebook Details | `0c488f50-8d6a-48a0-b056-5f7cfca9efe2` | `NOTEBOOK_GENERATION_URL` | ⏳ Pending |
| InsightsLM - Podcast Generation | `4c4699bc-004b-4ca3-8923-373ddd4a274e` | `AUDIO_GENERATION_WEBHOOK_URL` | ⏳ Pending |
| InsightsLM - Extract Text | `19566c6c-e0a5-4a8f-ba1a-5203c2b663b7` | `DOCUMENT_PROCESSING_WEBHOOK_URL` | ⏳ Pending |
| InsightsLM - Process Additional Sources | `670882ea-5c1e-4b50-9f41-4792256af985` | `ADDITIONAL_SOURCES_WEBHOOK_URL` | ⏳ Pending |

---

### Phase 3: Gemini API Integration (Priority: HIGH) ✅ COMPLETED

#### Step 3.1: ✅ Get Gemini API Key - COMPLETED

API key obtained and added to Supabase Secrets.

#### Step 3.2: ✅ Update n8n Workflows - COMPLETED

All OpenAI nodes replaced with Gemini:

**Chat Model Replacements:**
- `@n8n/n8n-nodes-langchain.lmChatOpenAi` → `@n8n/n8n-nodes-langchain.lmChatGoogleGemini`

**Embeddings Replacements:**
- `@n8n/n8n-nodes-langchain.embeddingsOpenAi` → HTTP Request to Gemini Embeddings API

**Edge Function Update:**
- `generate-note-title` edge function updated to use Gemini API

#### Step 3.3: ✅ Update Environment Variables - COMPLETED

`.env` file contains:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

---

### Phase 4: Frontend Setup (Priority: MEDIUM) ⏳ PENDING

#### Step 4.1: Install Dependencies

```bash
cd "F:\NotebookLM clone\NotebookLM-clone"
npm install
```

#### Step 4.2: Verify .env File

Ensure `.env` contains:

```env
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_zhlOkTubZN1uZJYoPiW8jg__wI00Nq4
VITE_SUPABASE_URL=https://qreqmcprolrpqkrdpwrl.supabase.co
GITHUB_API_KEY=ghp_your_personal_access_token_here
LEGACY_ROLE_API=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PUBLISHABLE_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=your_key_here
```

#### Step 4.3: Run Development Server

```bash
npm run dev
```

Access at: http://localhost:5173

---

### Phase 5: Testing & Validation (Priority: MEDIUM) ⏳ PENDING

#### Test Checklist

- [ ] User authentication (signup/login)
- [ ] Create new notebook
- [ ] Upload PDF document
- [ ] Document processing completes
- [ ] Chat with document works
- [ ] Citations are accurate
- [ ] Note generation works
- [ ] Audio overview generation (FFmpeg installed ✅)

#### Common Issues & Solutions

| Issue                   | Solution                            |
| ----------------------- | ----------------------------------- |
| Edge function 401       | Check "Verify JWT" is disabled      |
| Webhook timeout         | Increase n8n timeout settings       |
| Document not processing | Check Supabase storage RLS policies |
| Chat returns empty      | Verify n8n workflow is published    |
| Gemini API error        | Check API key and quota             |

---

## 📁 Project Structure

```
NotebookLM-clone/
├── src/                      # Frontend React code
│   ├── components/           # UI components
│   ├── contexts/             # React contexts
│   ├── hooks/                # Custom hooks
│   ├── integrations/         # External integrations
│   ├── lib/                  # Utilities
│   ├── pages/                # App pages
│   ├── services/             # API services
│   └── types/                # TypeScript types
├── supabase/
│   ├── functions/            # Edge functions (9 total)
│   └── migrations/           # Database migrations
├── n8n/                      # n8n workflow JSONs
│   ├── InsightsLM___Extract_Text.json
│   ├── InsightsLM___Chat.json
│   ├── InsightsLM___Upsert_to_Vector_Store.json
│   ├── InsightsLM___Generate_Notebook_Details.json
│   ├── InsightsLM___Podcast_Generation.json
│   ├── InsightsLM___Process_Additional_Sources.json
│   └── InsightsLM___Podcast_Generation_FIXED.json (n8n v1.x compatible)
├── docs/                     # Documentation
└── .env                      # Environment variables
```

---

## 🔐 Security Notes

### Supabase Keys

- **Publishable Key:** Safe for frontend (already in `.env`)
- **Legacy Service Role API:** NEVER expose to frontend
- **Edge Functions:** Handle auth internally

### n8n Webhooks

- Use custom header auth (not Bearer token)
- Store passwords in Supabase Secrets
- Rotate keys periodically

### API Keys

- Gemini API key: Store in Supabase Secrets
- Never commit `.env` to Git
- Use environment-specific keys

---

## 📞 Resources

### Official Documentation

- Supabase: https://supabase.com/docs
- n8n: https://docs.n8n.io
- Gemini API: https://ai.google.dev/docs
- InsightsLM Video: https://youtu.be/Nla35It-xfc

### Community

- The AI Automators: https://www.theaiautomators.com/
- n8n Forum: https://community.n8n.io/
- Supabase Discord: https://discord.supabase.com/

---

## 📝 Next Actions

### Immediate (This Session) - COMPLETED ✅

1. [x] Install Supabase CLI ✅
2. [x] Deploy all 9 edge functions ✅
3. [x] Disable "Verify JWT" on all functions ✅
4. [x] Setup n8n Docker container with FFmpeg ✅
5. [x] Import n8n workflows ✅
6. [x] Create Supabase Secrets (partial) ✅
   - [x] NOTEBOOK_GENERATION_AUTH
   - [x] GEMINI_API_KEY
7. [x] **Publish all 6 workflows** ✅
   - [x] InsightsLM - Extract Text - **PUBLISHED**
   - [x] InsightsLM - Chat - **PUBLISHED**
   - [x] InsightsLM - Upsert to Vector Store - **PUBLISHED**
   - [x] InsightsLM - Generate Notebook Details - **PUBLISHED**
   - [x] InsightsLM - Podcast Generation - **PUBLISHED**
   - [x] InsightsLM - Process Additional Sources - **NO FIX NEEDED**
8. [x] **Replace OpenAI → Gemini in all workflows** ✅
9. [x] **Fix n8n v1.x compatibility issues** ✅
   - [x] Replaced `executeCommand` nodes with `Code` nodes

### Short Term (Next Steps) - REMAINING

1. [ ] **Get webhook URLs from published workflows:**
   - [ ] Open each workflow in n8n
   - [ ] Copy Production URL from Webhook node
   - [ ] Save to notepad

2. [ ] **Create 5 Supabase Secrets with webhook URLs:**
   - [ ] NOTEBOOK_CHAT_URL
   - [ ] NOTEBOOK_GENERATION_URL
   - [ ] AUDIO_GENERATION_WEBHOOK_URL
   - [ ] DOCUMENT_PROCESSING_WEBHOOK_URL
   - [ ] ADDITIONAL_SOURCES_WEBHOOK_URL

3. [ ] Run frontend dev server
4. [ ] Test document upload
5. [ ] Test chat functionality

### Medium Term (This Month)

1. [ ] Test full chat flow
2. [ ] Test podcast generation
3. [ ] Deploy to production (Netlify/Vercel)
4. [ ] Setup monitoring & logging

---

## 🐛 Known Issues

1. **n8n v1.x Compatibility:** `executeCommand` node deprecated - **FIXED** by replacing with `Code` nodes
2. **OpenAI → Gemini Migration:** All workflows updated - **COMPLETED**
3. **FFmpeg for Podcast:** Requires custom Dockerfile - **FIXED** with multi-stage build
4. **Supabase Secrets:** 5 webhook URLs pending - **IN PROGRESS**

---

## 📊 Workflow Status Summary

| # | Workflow | OpenAI Nodes Fixed | n8n v1.x Fixed | Published | Webhook URL Added |
|---|----------|-------------------|----------------|-----------|-------------------|
| 1 | Extract Text | ✅ | N/A | ✅ | ⏳ |
| 2 | Chat | ✅ (2 nodes) | N/A | ✅ | ⏳ |
| 3 | Upsert to Vector Store | ✅ (2 nodes) | N/A | ✅ | ⏳ |
| 4 | Generate Notebook Details | ✅ (1 node) | N/A | ✅ | ⏳ |
| 5 | Podcast Generation | ✅ (1 node) | ✅ (2 executeCommand) | ✅ | ⏳ |
| 6 | Process Additional Sources | ✅ (0 nodes) | N/A | ✅ | ⏳ |

**Total:** 6/6 workflows published ✅  
**OpenAI → Gemini:** 6/6 complete ✅  
**n8n v1.x Fixes:** 2/2 executeCommand nodes replaced ✅  
**Supabase Secrets:** 2/7 created ⏳

---

**Document Version:** 2.0 (Updated 2026-03-18)  
**Maintained By:** AI Assistant  
**For Questions:** Review this doc before asking for context
