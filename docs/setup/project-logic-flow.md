# 🏗️ Luồng Logic Hoạt Động Dự Án InsightsLM (NotebookLM Clone)

> Tài liệu này giải thích chi tiết luồng hoạt động của toàn bộ dự án, từ Frontend → Supabase → n8n AI Pipeline.

---

## Tổng Quan Kiến Trúc

Dự án gồm **3 tầng (layers)** chính:

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite + TypeScript)                       │
│  - Giao diện người dùng                                     │
│  - Hooks quản lý state (React Query + Supabase Realtime)    │
│  - Supabase JS Client (Auth, DB, Storage)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│  SUPABASE (Backend-as-a-Service)                            │
│  - Auth (đăng ký/đăng nhập/JWT)                             │
│  - PostgreSQL Database (notebooks, sources, documents...)   │
│  - Edge Functions (proxy gọi n8n, xử lý logic backend)     │
│  - Storage (upload file PDF, audio)                         │
│  - Realtime (push updates về frontend qua WebSocket)        │
└──────────────────────┬──────────────────────────────────────┘
                       │ Webhook HTTP
┌──────────────────────▼──────────────────────────────────────┐
│  N8N (AI Processing Pipeline)                               │
│  - Upsert to Vector Store (embedding + lưu vector)          │
│  - Extract Text (trích xuất text từ PDF/audio/text)         │
│  - Generate Notebook Details (tạo title/icon/questions)     │
│  - Chat (RAG: tìm vector → trả lời câu hỏi)               │
│  - Process Additional Sources (xử lý URLs/text bổ sung)    │
│  - Podcast Generation (tạo audio overview)                  │
│  Sử dụng: Google Gemini (LLM + Embeddings)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 🔐 Luồng Xác Thực (Authentication Flow)

### File liên quan:
- `src/contexts/AuthContext.tsx` — Quản lý session/user state
- `src/components/auth/ProtectedRoute.tsx` — Bảo vệ route
- `src/services/authService.ts` — Logout logic
- `src/App.tsx` — Routing

### Luồng hoạt động:

```
User mở app
   │
   ▼
App.tsx: <AuthProvider> bọc toàn bộ app
   │
   ▼
AuthContext: 
   1. supabase.auth.getSession() → lấy session từ localStorage
   2. supabase.auth.onAuthStateChange() → lắng nghe thay đổi auth
   │
   ├─ Có session → setUser(user), setSession(session)
   │                ProtectedRoute render <Dashboard />
   │
   └─ Không có session → ProtectedRoute render <Auth /> (trang đăng nhập)
```

### Chi tiết quan trọng:
- **ProtectedRoute** kiểm tra `isAuthenticated` (= `!!user && !!session`)
- **signOut()** xóa local state trước → gọi `supabase.auth.signOut()` → redirect `/auth`
- Hỗ trợ edge case: session hết hạn trên server → tự clear local session

---

## 2. 📓 Luồng Tạo Notebook Mới

### File liên quan:
- `src/hooks/useNotebooks.tsx` — CRUD notebooks
- `src/hooks/useSources.tsx` — CRUD sources + auto-trigger AI
- `src/hooks/useNotebookGeneration.tsx` — Gọi Edge Function tạo metadata
- `supabase/functions/generate-notebook-content/index.ts` — Edge Function

### Luồng hoạt động:

```
User click "Create Notebook"
   │
   ▼
useNotebooks.createNotebook()
   → INSERT vào bảng `notebooks` { title, user_id, generation_status: 'pending' }
   → Supabase Realtime push event → UI tự cập nhật
   │
   ▼
User được chuyển đến trang Notebook (3 cột: Sources | Chat | Studio)
   │
   ▼
User upload source (PDF/text/URL/audio) — xem mục 3 bên dưới
   │
   ▼
useSources.addSource() → onSuccess kiểm tra:
   └─ Nếu là source đầu tiên + notebook.generation_status === 'pending'
      → Gọi useNotebookGeneration.generateNotebookContentAsync()
         │
         ▼
      supabase.functions.invoke('generate-notebook-content')
         │
         ▼
      Edge Function: generate-notebook-content
         1. Xác thực JWT → kiểm tra user sở hữu notebook
         2. Update notebook status → 'generating'
         3. Gọi n8n webhook → "InsightsLM - Generate Notebook Details"
         4. n8n dùng Gemini AI tạo: title, summary, icon, background_color, example_questions
         5. Callback → Update notebook với dữ liệu AI tạo ra
         6. Supabase Realtime → Frontend tự cập nhật UI
```

### Chi tiết code quan trọng (`generate-notebook-content/index.ts`):
```typescript
// Payload gửi đến n8n
const payload = { sourceType, filePath, content };

// Nhận response từ n8n (đã qua Gemini AI)
const { title, summary, notebook_icon, background_color, example_questions } = generatedData.output;

// Cập nhật notebook
await supabaseClient.from('notebooks').update({
  title, description: summary, icon: notebook_icon, 
  color: background_color, example_questions,
  generation_status: 'completed'
}).eq('id', notebookId);
```

---

## 3. 📄 Luồng Upload & Xử Lý Document (Document Processing)

Đây là luồng phức tạp nhất, liên quan đến nhiều thành phần.

### File liên quan:
- `src/hooks/useFileUpload.tsx` — Upload file lên Supabase Storage
- `src/hooks/useSources.tsx` — Tạo source record
- `src/hooks/useDocumentProcessing.tsx` — Gọi process-document
- `supabase/functions/process-document/index.ts` — Edge Function proxy
- `supabase/functions/process-document-callback/index.ts` — Callback handler
- `n8n/InsightsLM - Upsert to Vector Store.json` — n8n workflow chính
- `n8n/InsightsLM - Extract Text.json` — n8n workflow trích xuất text

### Luồng hoạt động (ví dụ: upload PDF):

```
User kéo thả file PDF vào SourcesSidebar
   │
   ▼
① useFileUpload.uploadFile()
   → Upload file lên Supabase Storage bucket "sources"
   → Path: sources/{notebookId}/{sourceId}.pdf
   │
   ▼
② useSources.addSource()
   → INSERT vào bảng `sources` { notebook_id, title, type: 'pdf', file_path, processing_status: 'pending' }
   → Supabase Realtime → UI hiển thị source mới (trạng thái "processing...")
   │
   ▼
③ supabase.functions.invoke('process-document')
   │
   ▼
④ Edge Function: process-document
   1. Xác thực JWT + kiểm tra ownership
   2. Gọi n8n webhook (DOCUMENT_PROCESSING_WEBHOOK_URL)
      Payload: { source_id, file_url, file_path, source_type, callback_url }
   │
   ▼
⑤ N8N Workflow: "InsightsLM - Upsert to Vector Store"
   │
   ├─ Webhook nhận request
   │
   ├─ Extract Text (sub-workflow):
   │   1. Tạo Signed URL cho file trong Storage
   │   2. Download file
   │   3. Switch theo content-type:
   │      - application/pdf → Extract from File (PDF parser)
   │      - audio/mpeg → Gemini Transcribe
   │      - text/plain → Lấy raw data
   │   4. Output: { extracted_text }
   │
   ├─ Code1: Parse notebook_id từ file_path, gom extracted_text + source_id
   │
   ├─ Generate Title & Description (Gemini Chat):
   │   → Prompt AI tạo title + summary cho document
   │   → Output Parser: JSON { title, summary }
   │
   ├─ Supabase1: UPDATE bảng `sources` với content, summary, display_name
   │
   ├─ Edit Fields: Chuẩn bị { text } cho vector store
   │
   ├─ Supabase Vector Store (NODE QUAN TRỌNG):
   │   1. Default Data Loader (gắn metadata: notebook_id, source_id)
   │   2. Recursive Text Splitter (chunk_size=4000, overlap=200)
   │   3. Embeddings Google Gemini (model: gemini-embedding-001 → 3072 dims)
   │   4. INSERT vào bảng `documents` (content, embedding, metadata)
   │
   ├─ Aggregate: Gom kết quả
   │
   └─ HTTP Request → Callback: process-document-callback
       → UPDATE sources.processing_status = 'completed'
       → Supabase Realtime → Frontend UI cập nhật trạng thái ✅
```

### Chi tiết Vector Store (bảng `documents`):
```sql
CREATE TABLE public.documents (
    id bigserial PRIMARY KEY,
    content text,                    -- Nội dung text chunk
    metadata jsonb,                  -- { notebook_id, source_id }
    embedding vector(3072)           -- Vector embedding từ Gemini
);
```

---

## 4. 💬 Luồng Chat (RAG - Retrieval Augmented Generation)

### File liên quan:
- `src/hooks/useChatMessages.tsx` — Quản lý chat messages
- `src/components/chat/ChatArea.tsx` — UI chat
- `supabase/functions/send-chat-message/index.ts` — Edge Function proxy
- `n8n/InsightsLM - Chat.json` — n8n workflow
- SQL function `match_documents()` — Vector similarity search

### Luồng hoạt động:

```
User gõ câu hỏi trong ChatArea → click Send
   │
   ▼
① useChatMessages.sendMessage()
   → supabase.functions.invoke('send-chat-message')
   │
   ▼
② Edge Function: send-chat-message
   1. Xác thực JWT (lấy verified user_id, KHÔNG dùng user_id từ request body)
   2. Gọi n8n webhook (NOTEBOOK_CHAT_URL)
      Payload: { session_id: notebookId, message, user_id, timestamp }
   │
   ▼
③ N8N Workflow: "InsightsLM - Chat"
   1. Nhận message từ webhook
   2. Vector Search: Dùng Gemini tạo embedding cho câu hỏi
      → match_documents(query_embedding, filter: { notebook_id })
      → Tìm top K chunks tương tự nhất
   3. Gemini AI: Trả lời dựa trên context từ vector search + chat history
   4. Lưu cả câu hỏi (human) + câu trả lời (ai) vào bảng n8n_chat_histories
   │
   ▼
④ Supabase Realtime → Frontend nhận message mới
   │
   ▼
⑤ useChatMessages: transformMessage()
   → Parse AI response (có thể chứa citations)
   → Hiển thị message với citations có thể click
```

### Chi tiết hàm vector search (`match_documents`):
```sql
CREATE FUNCTION match_documents(
    query_embedding vector,          -- Embedding của câu hỏi
    match_count integer,             -- Số kết quả trả về
    filter jsonb DEFAULT '{}'        -- { "notebook_id": "..." }
)
RETURNS TABLE(id, content, metadata, similarity)
AS $$
    SELECT id, content, metadata,
           1 - (embedding <=> query_embedding) as similarity  -- Cosine similarity
    FROM documents
    WHERE metadata @> filter          -- Lọc theo notebook_id
    ORDER BY embedding <=> query_embedding   -- Sắp xếp theo similarity
    LIMIT match_count;
$$;
```

### Chi tiết parse AI response (`useChatMessages.tsx`):
Câu trả lời từ n8n có format:
```json
{
  "output": [
    { "text": "Đoạn trả lời...", "citations": [{ "chunk_source_id": "uuid", "chunk_lines_from": 1, "chunk_lines_to": 10 }] }
  ]
}
```
Frontend parse thành `segments` (đoạn text) + `citations` (nguồn tham chiếu) → hiển thị với số [1], [2] có thể click.

---

## 5. 🌐 Luồng Thêm Sources Bổ Sung (Websites / Copied Text)

### File liên quan:
- `supabase/functions/process-additional-sources/index.ts`
- `n8n/InsightsLM - Process Additional Sources.json`

### Luồng hoạt động:

```
User thêm nguồn dạng websites hoặc copied text
   │
   ├─ Multiple Websites:
   │   → supabase.functions.invoke('process-additional-sources')
   │   → Payload: { type: 'multiple-websites', notebookId, urls: [...], sourceIds: [...] }
   │   → n8n: Crawl từng URL → Trích xuất text → Upsert vectors
   │
   └─ Copied Text:
       → Payload: { type: 'copied-text', notebookId, title, content, sourceId }
       → n8n: Xử lý text trực tiếp → Upsert vectors
```

---

## 6. 🎙️ Luồng Tạo Audio Overview (Podcast Generation)

### File liên quan:
- `src/hooks/useAudioOverview.tsx` — Frontend hook
- `supabase/functions/generate-audio-overview/index.ts` — Edge Function
- `supabase/functions/audio-generation-callback/index.ts` — Callback
- `n8n/InsightsLM - Podcast Generation.json` — n8n workflow

### Luồng hoạt động:

```
User click "Generate Audio Overview"
   │
   ▼
① useAudioOverview.generateAudioOverview()
   → supabase.functions.invoke('generate-audio-overview')
   │
   ▼
② Edge Function: generate-audio-overview
   1. Xác thực JWT + kiểm tra ownership
   2. Update notebook: audio_overview_generation_status → 'generating'
   3. EdgeRuntime.waitUntil() → chạy nền (background task)
      → Gọi n8n webhook (AUDIO_GENERATION_WEBHOOK_URL)
      → Payload: { notebook_id, callback_url }
   4. Return ngay cho user: { status: 'generating' }
   │
   ▼
③ Supabase Realtime → Frontend biết status = 'generating' → hiển thị loading
   │
   ▼
④ N8N: "Podcast Generation" workflow
   → Gemini AI tạo script podcast dựa trên sources
   → Text-to-Speech → Tạo audio file
   → Upload audio lên Supabase Storage bucket "audio"
   → Callback: audio-generation-callback
      → Update notebook: audio_overview_url, audio_overview_generation_status: 'completed'
   │
   ▼
⑤ Supabase Realtime → Frontend tự cập nhật → Hiện audio player
```

### Đặc biệt: Audio URL có thời hạn (signed URL)
- `useAudioOverview.checkAudioExpiry()` kiểm tra `audio_url_expires_at`
- Nếu hết hạn → `autoRefreshIfExpired()` gọi `refresh-audio-url` Edge Function

---

## 7. 🔄 Mô Hình Realtime (Real-time Updates)

### Nguyên lý hoạt động:

Dự án dùng **Supabase Realtime** (WebSocket) để frontend tự cập nhật UI mà không cần polling.

```
Supabase Database thay đổi (INSERT/UPDATE/DELETE)
   │
   ▼
PostgreSQL Replication → Supabase Realtime Server
   │
   ▼  WebSocket
Frontend Hooks lắng nghe:
   - useNotebooks: lắng nghe bảng `notebooks` (filter user_id)
   - useSources: lắng nghe bảng `sources` (filter notebook_id)
   - useChatMessages: lắng nghe bảng `n8n_chat_histories` (filter session_id)
   - useAudioOverview: lắng nghe bảng `notebooks` UPDATE (filter id)
   │
   ▼
queryClient.setQueryData() hoặc invalidateQueries()
   → React Query re-render UI
```

### Chi tiết code pattern (ví dụ `useSources.tsx`):
```typescript
const channel = supabase
  .channel('sources-changes')
  .on('postgres_changes', {
    event: '*',                           // Lắng nghe tất cả events
    schema: 'public',
    table: 'sources',
    filter: `notebook_id=eq.${notebookId}` // Chỉ notebook hiện tại
  }, (payload) => {
    // Cập nhật cache trực tiếp thay vì refetch
    queryClient.setQueryData(['sources', notebookId], (old) => {
      switch (payload.eventType) {
        case 'INSERT': return [payload.new, ...old];
        case 'UPDATE': return old.map(s => s.id === payload.new.id ? payload.new : s);
        case 'DELETE': return old.filter(s => s.id !== payload.old.id);
      }
    });
  })
  .subscribe();
```

---

## 8. 🗄️ Cơ Sở Dữ Liệu (Database Schema)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  profiles     │     │  notebooks   │     │  sources     │
│──────────────│     │──────────────│     │──────────────│
│ id (FK users)│◄────│ user_id (FK) │     │ notebook_id  │
│ email        │     │ title        │     │ title        │
│ full_name    │     │ description  │     │ type (enum)  │
│ avatar_url   │     │ icon         │     │ url          │
└──────────────┘     │ color        │     │ file_path    │
                     │ gen_status   │     │ content      │
                     │ audio_url    │     │ summary      │
                     │ example_q[]  │     │ proc_status  │
                     └───────┬──────┘     └──────┬───────┘
                             │                    │
                     ┌───────▼──────┐     ┌──────▼───────┐
                     │  notes       │     │  documents   │
                     │──────────────│     │──────────────│
                     │ notebook_id  │     │ content      │
                     │ title        │     │ metadata     │
                     │ content      │     │ embedding    │
                     │ source_type  │     │ (vector 3072)│
                     └──────────────┘     └──────────────┘

                     ┌──────────────────┐
                     │ n8n_chat_histories│
                     │──────────────────│
                     │ session_id       │ ← = notebook_id
                     │ message (JSONB)  │ ← { type, content }
                     └──────────────────┘
```

### Bảo mật (RLS):
- Mỗi bảng đều bật **Row Level Security**
- User chỉ thấy/sửa/xóa data của chính mình
- Kiểm tra ownership qua `auth.uid()` và helper functions: `is_notebook_owner()`, `is_notebook_owner_for_document()`

---

## 9. 📋 Tổng Kết Các Hooks Quan Trọng

| Hook | Chức năng | File |
|------|-----------|------|
| `useAuth` | Quản lý user session, login/logout state | `contexts/AuthContext.tsx` |
| `useNotebooks` | CRUD notebooks + Realtime + source counts | `hooks/useNotebooks.tsx` |
| `useSources` | CRUD sources + Realtime + auto-trigger AI generation | `hooks/useSources.tsx` |
| `useChatMessages` | Gửi/nhận chat + Realtime + parse citations | `hooks/useChatMessages.tsx` |
| `useAudioOverview` | Generate/refresh audio + Realtime status tracking | `hooks/useAudioOverview.tsx` |
| `useFileUpload` | Upload file lên Supabase Storage | `hooks/useFileUpload.tsx` |
| `useNotebookGeneration` | Gọi AI tạo title/description/icon cho notebook | `hooks/useNotebookGeneration.tsx` |
| `useNotes` | CRUD ghi chú trong notebook | `hooks/useNotes.tsx` |
| `useNotebookDelete` | Xóa notebook + cascade cleanup | `hooks/useNotebookDelete.tsx` |
| `useSourceDelete` | Xóa source + cleanup vectors trong documents | `hooks/useSourceDelete.tsx` |

---

## 10. 🔗 Tổng Kết N8N Workflows

| Workflow | Trigger | Mục đích |
|----------|---------|----------|
| **Upsert to Vector Store** | Webhook + executeWorkflowTrigger | Extract text → AI title/summary → chunk + embed → lưu vectors |
| **Extract Text** | executeWorkflowTrigger | Sub-workflow: download file → parse PDF/audio/text → return extracted_text |
| **Generate Notebook Details** | Webhook | AI tạo title, summary, icon, color, example questions cho notebook |
| **Chat** | Webhook | RAG: vector search → Gemini trả lời → lưu chat history |
| **Process Additional Sources** | Webhook | Xử lý websites/copied text bổ sung → upsert vectors |
| **Podcast Generation** | Webhook | AI tạo podcast script → TTS → upload audio → callback |

---

## 11. 🔑 Mẫu Thiết Kế Chung (Design Patterns)

### Pattern 1: Edge Function → n8n Proxy
Mọi tương tác AI đều đi qua cùng một mẫu:
```
Frontend → supabase.functions.invoke() 
  → Edge Function (xác thực JWT + kiểm tra ownership) 
    → fetch(n8n_webhook_url) 
      → n8n xử lý AI 
        → Callback / Realtime → Frontend cập nhật
```

### Pattern 2: Optimistic UI + Realtime
- Frontend **không chờ** n8n xử lý xong
- Hiển thị trạng thái "processing..." ngay lập tức
- Khi n8n xong → cập nhật DB → Realtime push → UI tự cập nhật

### Pattern 3: Security Layer
- Mọi Edge Function đều: `getUser()` → kiểm tra JWT → kiểm tra ownership → mới cho thực thi
- Bảng DB dùng RLS policy → ngay cả khi bypass Edge Function, DB vẫn an toàn
