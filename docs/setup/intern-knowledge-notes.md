# 📚 Ghi Chú Kiến Thức — Dự Án InsightsLM (NotebookLM Clone)

> Tài liệu này tổng hợp các kiến thức **mới** học được trong quá trình làm dự án InsightsLM.
> Viết cho intern mới biết **React + Node.js + Supabase cơ bản**, chưa biết về RAG, VectorDB, n8n.

---

## Mục Lục

1. [Kiến trúc tổng thể — Tại sao dùng 3 tầng?](#1-kiến-trúc-tổng-thể)
2. [Supabase Edge Functions — Serverless ở Supabase](#2-supabase-edge-functions)
3. [n8n — Công cụ tự động hóa quy trình](#3-n8n)
4. [RAG — Retrieval Augmented Generation](#4-rag)
5. [Vector Database & pgvector](#5-vector-database--pgvector)
6. [Embedding — Mã hóa ngữ nghĩa](#6-embedding)
7. [Chunking — Chia nhỏ văn bản](#7-chunking)
8. [Cosine Similarity — Đo độ giống nhau](#8-cosine-similarity)
9. [Callback Pattern — Xử lý bất đồng bộ](#9-callback-pattern)
10. [Supabase Realtime — Cập nhật UI tự động](#10-supabase-realtime)
11. [JWT & Bảo mật trong dự án](#11-jwt--bảo-mật)
12. [Service Role Key vs Anon Key](#12-service-role-key-vs-anon-key)
13. [RLS — Row Level Security](#13-rls--row-level-security)
14. [Tổng kết: Sơ đồ dữ liệu chạy qua hệ thống](#14-tổng-kết-sơ-đồ-dữ-liệu)

---

## 1. Kiến Trúc Tổng Thể

### Tại sao cần 3 tầng?

Dự án chia thành 3 tầng riêng biệt:

```
FRONTEND (React + Vite)
    ↕ HTTPS
SUPABASE (Auth + DB + Edge Functions + Realtime)
    ↕ HTTP Webhook
N8N (AI Pipeline: OpenAI + Vector Store)
```

**Lý do thiết kế như vậy:**

| Nếu làm trực tiếp                            | Vấn đề                                  | Giải pháp                                             |
| -------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| Frontend gọi thẳng API OpenAI                | Lộ API key cho người dùng               | Đi qua Edge Function (server-side)                    |
| Frontend tự xử lý PDF/Audio                  | Tốn RAM của browser, giới hạn file size | Đẩy sang n8n xử lý trên server                        |
| Frontend polling DB liên tục để check status | Tốn bandwidth, chậm                     | Supabase Realtime (WebSocket) push về khi có thay đổi |
| Viết code AI pipeline trong Edge Function    | Edge Function có timeout 10 giây        | n8n chạy không giới hạn thời gian                     |

**Kết luận:** Code bạn viết chủ yếu là **"ống nối"** — kết nối các dịch vụ với nhau. AI thực sự xử lý trong n8n + OpenAI.

---

## 2. Supabase Edge Functions

### Edge Function là gì?

Edge Function là function chạy **trên server của Supabase** (giống như serverless function của AWS Lambda, hoặc Vercel Functions), viết bằng **Deno** (không phải Node.js, nhưng cú pháp TypeScript gần giống).

```
Browser → supabase.functions.invoke('ten-function') → Supabase Server → chạy code → trả kết quả
```

### Tại sao dùng Edge Function thay vì gọi thẳng n8n từ Frontend?

**3 lý do chính:**

1. **Bảo mật API Key**: URL webhook n8n chứa secret key, nếu để ở frontend thì bị lộ
2. **Xác thực người dùng**: Edge Function kiểm tra JWT token, đảm bảo chỉ user đúng mới thực hiện được
3. **Kiểm tra ownership**: Đảm bảo user chỉ xử lý tài liệu của chính họ

### Code mẫu — Pattern xác thực trong mọi Edge Function

Mọi Edge Function trong dự án đều theo pattern này:

```typescript
// File: supabase/functions/process-document/index.ts

serve(async (req) => {
  // ① Lấy JWT từ header Authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  // ② Tạo Supabase client với JWT của user (không phải service key)
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // ③ Xác thực JWT — Supabase tự kiểm tra token có hợp lệ không
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();
  if (!user)
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
    });

  // ④ Kiểm tra ownership — user có quyền với resource này không?
  const { data: source } = await supabaseAdmin
    .from("sources")
    .select("id, notebooks!inner(user_id)") // JOIN với bảng notebooks
    .eq("id", sourceId)
    .single();

  if (source.notebooks.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
  }

  // ⑤ OK rồi — gọi n8n webhook
  const response = await fetch(n8nWebhookUrl, {
    method: "POST",
    body: JSON.stringify({ source_id, file_url, callback_url }),
  });
});
```

### Deno vs Node.js — Điểm khác biệt cần biết

|                 | Node.js                            | Deno (Edge Function)                            |
| --------------- | ---------------------------------- | ----------------------------------------------- |
| Import          | `require('express')` hoặc `import` | `import { serve } from "https://deno.land/..."` |
| Env variables   | `process.env.KEY`                  | `Deno.env.get('KEY')`                           |
| Package manager | npm/yarn                           | Không có, import trực tiếp từ URL               |
| TypeScript      | Cần compile                        | Chạy TypeScript trực tiếp                       |

---

## 3. n8n

### n8n là gì?

n8n (đọc là "nodemation") là công cụ **tự động hóa quy trình** dạng **low-code/no-code**. Bạn tạo "workflow" bằng cách kéo thả các "node" (khối xử lý) và nối chúng lại.

**Hãy tưởng tượng n8n như một dây chuyền nhà máy tự động:**

- Mỗi node = một trạm xử lý
- Data chạy từ trạm này sang trạm khác
- Mỗi trạm làm một việc cụ thể

### Khái niệm Node

```
[TRIGGER NODE] → [NODE 1] → [NODE 2] → [NODE N] → [OUTPUT]
```

| Loại Node                    | Ví dụ dùng trong dự án                              |
| ---------------------------- | --------------------------------------------------- |
| **Webhook**                  | Nhận request từ Edge Function                       |
| **Code**                     | Chạy JavaScript tùy chỉnh (parse data, xử lý logic) |
| **HTTP Request**             | Gọi API ra ngoài (ví dụ: callback về Supabase)      |
| **Supabase**                 | Đọc/ghi dữ liệu vào Supabase                        |
| **LLM Chain**                | Gọi AI model (OpenAI) để xử lý text                 |
| **AI Agent**                 | AI tự quyết định dùng tool nào để trả lời           |
| **Supabase Vector Store**    | Lưu/tìm kiếm vector embeddings                      |
| **Embeddings OpenAI**        | Chuyển text thành vector số                         |
| **Recursive Text Splitter**  | Chia văn bản dài thành chunks nhỏ                   |
| **Aggregate**                | Gom nhiều items thành 1                             |
| **Execute Workflow**         | Gọi 1 workflow khác (sub-workflow)                  |

### Ví dụ thực tế: Workflow "Upsert to Vector Store"

```
Webhook (nhận từ Edge Function)
    ↓ { source_id, file_path, file_url, callback_url }
Execute Workflow "Extract Text" (sub-workflow)
    ↓ { extracted_text }
Code Node (JavaScript: parse notebook_id, gom data)
    ↓ { notebook_id, source_id, extracted_text }
LLM Chain (OpenAI: tạo title + summary)
    ↓ { title, summary }
Supabase Node (UPDATE sources: content, summary, title)
    ↓
Edit Fields (set field "text" = extracted_text)
    ↓
Supabase Vector Store (INSERT vào bảng documents)
    - Default Data Loader (gắn metadata: notebook_id, source_id)
    - Text Splitter (chunk 4000 ký tự)
    - Embeddings OpenAI (text → vector 1536 chiều)
    ↓
Aggregate (gom kết quả)
    ↓
HTTP Request (callback → Supabase Edge Function → cập nhật status = 'completed')
```

### Cú pháp Expression trong n8n

Để lấy data từ các node khác, n8n dùng cú pháp `{{ ... }}`:

```javascript
// Lấy data từ node ngay trước
{
  {
    $json.field_name;
  }
}

// Lấy data từ node cụ thể (theo tên node)
{
  {
    $("Code1").item.json.notebook_id;
  }
}

// Lấy data từ webhook body
{
  {
    $json.body.source_id;
  }
}

// Lấy toàn bộ item đầu tiên của một node
{
  {
    $("Webhook1").first().json.body.file_path;
  }
}
```

### Hai loại Connection trong n8n

```
Main connection (→):        AI sub-node connection (⊥):
Data chạy tuần tự          "Phụ kiện" gắn vào AI node

[NodeA] ──main──→ [NodeB]   [AI Agent] ←─ai_languageModel─ [Gemini Model]
                             [AI Agent] ←─ai_memory──────── [Chat Memory]
                             [AI Agent] ←─ai_tool─────────  [Vector Store]
```

---

## 4. RAG

### RAG là gì?

**RAG = Retrieval Augmented Generation** (Tạo sinh được tăng cường bởi truy vấn)

Đây là kỹ thuật giúp AI trả lời dựa trên **dữ liệu riêng của bạn** thay vì chỉ dùng kiến thức chung đã học.

**Vấn đề nếu không có RAG:**

```
User: "Theo tài liệu nội bộ công ty tôi, chính sách nghỉ phép là gì?"
AI (không có RAG): "Tôi không có quyền truy cập tài liệu nội bộ của bạn."
```

**Với RAG:**

```
User: "Theo tài liệu nội bộ công ty tôi, chính sách nghỉ phép là gì?"

[RAG tìm đoạn văn liên quan trong tài liệu]
  → Tìm thấy: "Nhân viên được nghỉ 12 ngày phép/năm, áp dụng từ ngày..."

AI (có RAG): "Theo tài liệu của bạn, chính sách nghỉ phép là 12 ngày/năm... [Nguồn: chính-sách.pdf, trang 3]"
```

### RAG gồm 2 pha

#### Pha 1: Indexing (Lưu trữ — xảy ra khi upload tài liệu)

```
Tài liệu gốc (PDF/Text/Audio)
    ↓
① Trích xuất text thuần (PDF parser / Gemini transcribe audio)
    ↓
② Chunking: Chia thành đoạn 4000 ký tự (xem mục 7)
    ↓
③ Embedding: Mỗi chunk → OpenAI → vector [1536 số] (xem mục 6)
    ↓
④ Lưu vào database:
   { content: "đoạn văn bản", embedding: [v1, v2, ..., v1536], metadata: { notebook_id, source_id } }
```

#### Pha 2: Retrieval + Generation (Truy vấn — xảy ra khi user chat)

```
User hỏi: "Machine learning là gì?"
    ↓
① Embed câu hỏi: "Machine learning là gì?" → vector [q1, q2, ..., q1536]
    ↓
② Vector Search: So sánh vector câu hỏi với TẤT CẢ vectors trong DB
   → Tìm top 10 chunks có nội dung giống câu hỏi nhất
   → Lọc theo notebook_id (chỉ trong notebook đang mở)
    ↓
③ Ghép context:
   "Chunk 1: [đoạn văn liên quan]
    Chunk 2: [đoạn văn liên quan]
    ..."
    ↓
④ Prompt cho OpenAI:
   "Dựa vào thông tin sau: [context từ bước 3]
    Hãy trả lời câu hỏi: Machine learning là gì?
    Trích dẫn nguồn khi dùng thông tin."
    ↓
⑤ OpenAI trả lời có căn cứ + citations
```

### Tại sao RAG tốt hơn train lại AI?

|                    | Train lại AI             | RAG                                   |
| ------------------ | ------------------------ | ------------------------------------- |
| Chi phí            | Rất đắt (GPU, thời gian) | Rẻ (chỉ lưu DB)                       |
| Thời gian cập nhật | Vài ngày đến vài tuần    | Vài giây (upload file là xong)        |
| Độ chính xác nguồn | AI có thể "hallucinate"  | Trả về đúng text từ tài liệu          |
| Phù hợp cho        | Kiến thức chung, stable  | Tài liệu riêng, thường xuyên thay đổi |

---

## 5. Vector Database & pgvector

### Vector Database là gì?

Database thông thường lưu text, số, ngày tháng. **Vector Database** lưu thêm **mảng số nhiều chiều** (vector) và có khả năng **tìm kiếm theo sự tương đồng** (không phải tìm kiếm chính xác).

**Tìm kiếm thông thường (exact match):**

```sql
WHERE content = 'machine learning'  -- Chỉ tìm đúng cụm từ này
```

**Tìm kiếm vector (similarity search):**

```sql
ORDER BY embedding <=> query_embedding  -- Tìm những gì CÓ Ý NGHĨA GIỐNG với câu hỏi
```

→ Tìm được "deep learning", "AI", "neural network" dù không đúng từ khóa!

### pgvector — Vector Database ngay trong PostgreSQL

Thay vì dùng database vector riêng (Pinecone, Weaviate, Qdrant...), dự án này dùng **extension pgvector** của PostgreSQL — tiện lợi vì Supabase đã hỗ trợ sẵn.

```sql
-- Bật extension
CREATE EXTENSION IF NOT EXISTS "vector";

-- Tạo bảng có cột vector
CREATE TABLE documents (
    id        bigserial PRIMARY KEY,
    content   text,                -- Nội dung text gốc
    metadata  jsonb,               -- { notebook_id, source_id }
    embedding vector(1536)         -- 1536 chiều từ OpenAI
);
```

### Toán tử của pgvector

```sql
-- <=>  : Cosine Distance (dùng nhiều nhất)
-- <->  : Euclidean Distance (L2)
-- <#>  : Negative Inner Product

-- Ví dụ:
SELECT content, 1 - (embedding <=> '[0.1, 0.2, ...]') as similarity
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'  -- Gần nhất lên đầu
LIMIT 10;
```

### Hàm match_documents trong dự án

```sql
CREATE FUNCTION match_documents(
    query_embedding vector,   -- Vector câu hỏi
    match_count integer,      -- Lấy top K chunks
    filter jsonb DEFAULT '{}'  -- { "notebook_id": "abc-123" }
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
AS $$
BEGIN
    RETURN QUERY
    SELECT
        documents.id,
        documents.content,
        documents.metadata,
        -- similarity: 1.0 = giống hoàn toàn, 0.0 = không liên quan
        1 - (documents.embedding <=> query_embedding) as similarity
    FROM documents
    WHERE documents.metadata @> filter  -- Lọc theo notebook_id
    ORDER BY documents.embedding <=> query_embedding  -- Sắp xếp: gần nhất lên đầu
    LIMIT match_count;
END;
$$;
```

### Tại sao không dùng HNSW index?

```sql
-- HNSW là index nhanh nhất cho vector search
-- Hỗ trợ tối đa 2000 chiều
-- OpenAI text-embedding-3-small tạo vector 1536 chiều → phù hợp dùng HNSW

CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

---

## 6. Embedding

### Embedding là gì?

Embedding là quá trình **chuyển đổi text thành một mảng số** (vector) sao cho **text có nghĩa giống nhau thì có vector gần nhau**.

```
"Con chó đang chạy"  → [0.12, -0.45, 0.89, ..., 0.03]  (3072 số)
"Chú cún đang chạy" → [0.11, -0.44, 0.91, ..., 0.04]  (rất gần nhau!)
"Trời hôm nay đẹp"  → [-0.33, 0.72, -0.21, ..., 0.67] (rất khác!)
```

### Tại sao cần 1536 chiều?

Mỗi chiều trong vector "nắm bắt" một đặc trưng ngữ nghĩa nào đó của câu. Càng nhiều chiều → càng nhiều đặc trưng được ghi lại → tìm kiếm càng chính xác. OpenAI `text-embedding-3-small` dùng 1536 chiều.

### Embedding model dùng trong dự án

- **Model:** OpenAI `text-embedding-3-small`
- **Chiều vector:** 1536
- **Dùng ở đâu:**
  - Khi upload tài liệu: embed từng chunk → lưu vào bảng `documents`
  - Khi user chat: embed câu hỏi → tìm kiếm trong `documents`

### Lưu ý quan trọng

> **Phải dùng cùng một model để embed và tìm kiếm!**
> Nếu embed text bằng model A nhưng embed câu hỏi bằng model B → hai vector ở không gian khác nhau → tìm kiếm sai hoàn toàn.

---

## 7. Chunking

### Tại sao phải chia nhỏ văn bản?

**Vấn đề 1:** AI model có giới hạn token đầu vào (context window). Không thể nhét cả cuốn sách vào một lần.

**Vấn đề 2:** Nếu chunk quá dài → khi người dùng hỏi về một phần nhỏ, embedding bị "loãng" bởi thông tin không liên quan → tìm kiếm kém chính xác.

**Vấn đề 3:** Nếu chunk quá ngắn → mất ngữ cảnh, AI không hiểu được ý nghĩa đầy đủ.

### Recursive Character Text Splitter

Dự án dùng **Recursive Character Text Splitter** của LangChain với:

- `chunk_size = 4000` ký tự
- `chunk_overlap = 200` ký tự

```
Văn bản gốc (10,000 ký tự):
|─────────────────────────────────────────|

Chunk 1: ký tự 0–4000
         |──────────────────|
Chunk 2: ký tự 3800–7800        (overlap 200 ký tự với chunk 1)
                  |──────────────────|
Chunk 3: ký tự 7600–10000       (overlap 200 ký tự với chunk 2)
                           |──────────────────|
```

### Tại sao cần overlap?

Không có overlap:

```
...câu A là phần cuối chunk 1. | Câu B là phần đầu chunk 2...
                                ^
                    Ranh giới bị cắt — câu A và B bị tách rời!
```

Có overlap 200 ký tự:

```
...câu A là phần cuối chunk 1. Câu B... | ...câu A là phần cuối chunk 1. Câu B...
                                           ^ Chunk 2 lặp lại phần cuối chunk 1
→ Câu A luôn xuất hiện đầy đủ trong ít nhất 1 chunk → không mất ngữ cảnh
```

---

## 8. Cosine Similarity

### Trực giác về Cosine Similarity

Thay vì đo khoảng cách (dài/ngắn), Cosine đo **góc** giữa hai vector. Hai vector **cùng hướng** = nội dung giống nhau.

```
Vector A: →
Vector B: →   Góc 0° → cos(0°) = 1 → similarity = 1 (giống hoàn toàn)

Vector A: →
Vector B: ↑   Góc 90° → cos(90°) = 0 → similarity = 0 (không liên quan)

Vector A: →
Vector B: ←   Góc 180° → cos(180°) = -1 → similarity = -1 (ngược nghĩa)
```

### Trong pgvector: Distance vs Similarity

Toán tử `<=>` trả về **Cosine Distance** (khoảng cách), KHÔNG phải similarity:

```
Cosine Distance   = 1 - Cosine Similarity
Cosine Similarity = 1 - Cosine Distance
```

| Tình huống         | Similarity | Distance (`<=>`) | `1 - (<=>)` trong code |
| ------------------ | ---------- | ---------------- | ---------------------- |
| Giống hoàn toàn    | 1.0        | 0.0              | 1.0 ✅                 |
| Liên quan một phần | 0.7        | 0.3              | 0.7                    |
| Không liên quan    | 0.0        | 1.0              | 0.0                    |

```sql
-- Tại sao ORDER BY dùng <=> (distance nhỏ) thay vì similarity lớn?
ORDER BY embedding <=> query_embedding  -- distance nhỏ = gần = lên đầu
-- pgvector tối ưu hóa toán tử này trực tiếp với index
```

---

## 9. Callback Pattern

### Vấn đề: Xử lý lâu

Một số tác vụ cần nhiều thời gian (xử lý PDF, tạo audio podcast). Supabase Edge Function có timeout —không thể đợi n8n chạy xong.

**Giải pháp: Callback Pattern**

```
① Edge Function nhận request từ Frontend
② Edge Function gọi n8n và TRUYỀN LUÔN địa chỉ callback_url
③ Edge Function trả về { status: 'processing' } NGAY LẬP TỨC (không đợi n8n)
④ n8n xử lý trong nền (có thể mất vài phút)
⑤ n8n xong → gọi HTTP POST tới callback_url
⑥ Callback Edge Function nhận kết quả → UPDATE database
⑦ Database thay đổi → Supabase Realtime → Frontend tự cập nhật UI
```

```typescript
// Trong Edge Function: gửi callback_url cho n8n
const payload = {
  source_id: sourceId,
  file_url: fileUrl,
  callback_url: `${SUPABASE_URL}/functions/v1/process-document-callback`,
  //            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //            n8n sẽ gọi URL này khi xong
};

await fetch(n8nWebhookUrl, { method: "POST", body: JSON.stringify(payload) });

// Trả về ngay, không đợi
return new Response(JSON.stringify({ status: "processing" }));
```

### Đặc biệt: `EdgeRuntime.waitUntil()`

Feature đặc biệt của Supabase Edge Function — cho phép **trả response về trước**, nhưng **vẫn tiếp tục chạy code** ở background:

```typescript
// Dùng trong generate-audio-overview
EdgeRuntime.waitUntil(async () => {
  // Code này chạy TRONG NỀN sau khi response đã được gửi về
  await fetch(n8nAudioWebhookUrl, { ... })
})

// Return ngay lập tức, không đợi waitUntil hoàn thành
return new Response(JSON.stringify({ status: 'generating' }))
```

---

## 10. Supabase Realtime

### Cơ chế hoạt động

```
PostgreSQL change (INSERT/UPDATE/DELETE)
    ↓
PostgreSQL Replication Log (WAL - Write Ahead Log)
    ↓
Supabase Realtime Server (đọc WAL, phát broadcast)
    ↓  WebSocket (kết nối 2 chiều liên tục)
Frontend Hooks đang lắng nghe
    ↓
queryClient.setQueryData() → React re-render UI
```

### Tại sao dùng WebSocket thay vì polling?

**Polling (cách cũ — không dùng):**

```
Frontend: "Có data mới chưa?" (gọi API mỗi 1 giây)
Server: "Chưa"
Frontend: "Có data mới chưa?"
Server: "Chưa"
...→ Tốn bandwidth, tốn server resources
```

**WebSocket (cách dự án dùng):**

```
Server → Frontend: "Có data mới! Đây là data: {...}"
→ Server CHỦ ĐỘNG push về khi có thay đổi
→ Không tốn bandwidth chờ đợi
```

### Code pattern Realtime trong dự án

```typescript
// Trong useSources.tsx
const channel = supabase
  .channel("sources-changes") // Đặt tên channel tùy ý
  .on(
    "postgres_changes",
    {
      event: "*", // Lắng nghe tất cả: INSERT, UPDATE, DELETE
      schema: "public",
      table: "sources",
      filter: `notebook_id=eq.${notebookId}`, // Chỉ lắng nghe notebook hiện tại
    },
    (payload) => {
      // Cập nhật cache React Query trực tiếp (nhanh hơn refetch)
      queryClient.setQueryData(["sources", notebookId], (old) => {
        switch (payload.eventType) {
          case "INSERT":
            return [payload.new, ...old];
          case "UPDATE":
            return old.map((s) => (s.id === payload.new.id ? payload.new : s));
          case "DELETE":
            return old.filter((s) => s.id !== payload.old.id);
        }
      });
    },
  )
  .subscribe();

// Cleanup khi component unmount
return () => {
  supabase.removeChannel(channel);
};
```

### REPLICA IDENTITY FULL là gì?

Để Realtime gửi đủ dữ liệu (kể cả record cũ khi UPDATE/DELETE):

```sql
-- Trong migration file
ALTER TABLE public.sources REPLICA IDENTITY FULL;
-- Không có FULL: DELETE event chỉ có { old: { id } } — khó dùng
-- Có FULL: DELETE event có { old: { id, title, type, ... } } — đầy đủ
```

---

## 11. JWT & Bảo mật

### JWT là gì?

**JWT = JSON Web Token** — một chuỗi mã hóa chứa thông tin về người dùng.

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYWJjLTEyMyJ9.signature
└── Header ──────────┘└── Payload (user_id, email...) ┘└── Chữ ký số ┘
```

- Supabase tạo JWT khi user đăng nhập
- Token này được lưu ở browser (localStorage/cookie)
- Mỗi request tới Edge Function đều kèm theo JWT trong header `Authorization: Bearer <token>`
- Edge Function dùng JWT này để biết request đến từ user nào

### Tại sao không dùng user_id từ request body?

```typescript
// ❌ NGUY HIỂM — user có thể gửi user_id giả
const { user_id } = await req.json(); // User gửi user_id của người khác!

// ✅ AN TOÀN — lấy từ JWT đã được xác thực
const {
  data: { user },
} = await supabaseAuth.auth.getUser();
const user_id = user.id; // Chắc chắn đúng — Supabase xác minh chữ ký JWT
```

---

## 12. Service Role Key vs Anon Key

Supabase có 2 loại key khác nhau cho 2 mục đích khác nhau:

|                 | **Anon Key**                                  | **Service Role Key**          |
| --------------- | --------------------------------------------- | ----------------------------- |
| **Dùng ở đâu**  | Frontend, Edge Function khi cần xác thực user | Chỉ dùng ở server/backend     |
| **Quyền**       | Bị RLS ràng buộc — chỉ thấy data của mình     | Bypass RLS — thấy/sửa tất cả  |
| **Lộ ra ngoài** | OK (an toàn)                                  | **TUYỆT ĐỐI KHÔNG** để lộ     |
| **Mục đích**    | Thao tác với tư cách user                     | Admin, xử lý background tasks |

```typescript
// Dùng ANON_KEY + JWT user → RLS áp dụng → user chỉ thấy data của mình
const supabaseForUser = createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: userJwt } },
});

// Dùng SERVICE_ROLE_KEY → bypass RLS → thấy và sửa được mọi data
// Chỉ dùng trong Edge Function callback (nhận từ n8n, không có user JWT)
const supabaseAdmin = createClient(URL, SERVICE_ROLE_KEY);
```

---

## 13. RLS — Row Level Security

### RLS là gì?

Row Level Security là tính năng của PostgreSQL — **tự động lọc data theo user** ở cấp DB, không cần thêm WHERE trong code.

```sql
-- Bật RLS
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- Tạo policy: user chỉ thấy sources trong notebook của mình
CREATE POLICY "view own sources"
ON sources FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM notebooks
    WHERE notebooks.id = sources.notebook_id
    AND notebooks.user_id = auth.uid()  -- auth.uid() = user_id từ JWT
  )
);
```

**Kết quả:**

```typescript
// Dù SELECT * không có WHERE, RLS tự lọc
const { data } = await supabase.from("sources").select("*");
// → Chỉ trả về sources của user đang đăng nhập
// → User không thể thấy data của người khác dù có biết ID
```

### Double security — Tại sao cần cả Edge Function lẫn RLS?

```
Edge Function kiểm tra ownership  ← Lớp 1: Chặn trước khi đến DB
    ↓
Database RLS policy               ← Lớp 2: Chặn ngay tại DB

→ Dù hacker bypass được Edge Function, RLS vẫn chặn tại DB
→ Defense in depth (bảo vệ nhiều lớp)
```

---

## 14. Tổng Kết: Sơ Đồ Dữ Liệu

### Khi user upload PDF:

```
[Browser] User kéo thả file PDF
    │
    ▼
[Frontend React]
  ① useFileUpload → upload lên Supabase Storage
  ② useSources → INSERT vào bảng "sources" (status: 'pending')
  ③ Supabase Realtime → UI hiển thị "Processing..." ngay
  ④ useDocumentProcessing → gọi Edge Function
    │
    ▼
[Edge Function: process-document]
  ⑤ Kiểm tra JWT + ownership
  ⑥ Gọi n8n webhook + truyền callback_url
  ⑦ Return ngay: { status: 'processing' }
    │
    ▼
[n8n Workflow: Upsert to Vector Store]
  ⑧ Download file từ Supabase Storage
  ⑨ PDF parser → extract text
  ⑩ OpenAI AI → tạo title + summary
  ⑪ Supabase node → UPDATE sources: { content, summary, title }
  ⑫ Text Splitter → chia thành chunks (4000 ký tự)
  ⑬ OpenAI Embedding → mỗi chunk → vector 1536 chiều
  ⑭ Supabase Vector Store → INSERT vào bảng "documents"
  ⑮ HTTP Callback → gọi Edge Function process-document-callback
    │
    ▼
[Edge Function: process-document-callback]
  ⑯ UPDATE sources: { processing_status: 'completed' }
    │
    ▼
[Supabase Database → Realtime]
  ⑰ Realtime push UPDATE event → Frontend
    │
    ▼
[Frontend React]
  ⑱ useSources nhận Realtime event → cập nhật cache → UI hiển thị ✅
```

### Khi user chat:

```
[Browser] User gõ câu hỏi
    │ supabase.functions.invoke('send-chat-message')
    ▼
[Edge Function: send-chat-message]
  Kiểm tra JWT → Gọi n8n → Đợi kết quả (sync) → Return
    │
    ▼
[n8n Workflow: Chat]
  AI Agent tự gọi tool:
    → OpenAI embed câu hỏi → vector
    → Supabase Vector Store: tìm top 10 chunks tương tự (lọc theo notebook_id)
    → OpenAI: "Dựa trên [10 chunks], trả lời: [câu hỏi]"
    → Postgres Memory: lưu lịch sử chat
    → Return JSON: { output: [{ text, citations }] }
    │
    ▼
[Frontend React]
  Parse response → hiển thị câu trả lời + citations có thể click
```

---

## 15. React Query: `mutate` vs `mutateAsync`

Trong dự án dùng React Query để gọi API sửa đổi dữ liệu (ví dụ: tạo phần chat mới, xóa document). Hook `useMutation` cung cấp hai hàm chính để gọi: `mutate` và `mutateAsync`.

### `mutate`

- **Trả về:** `void` (không trả về Promise). Bạn KHÔNG THỂ dùng `await` với nó.
- **Cách dùng:** Gọi xong là bỏ qua, kết quả được xử lý thông qua các callbacks (`onSuccess`, `onError`) truyền vào khi gọi hook hoặc khi gọi hàm.
- **Khi nào dùng:** Thường dùng trong các handler UI đơn giản không cần đợi kết quả để chạy logic tiếp theo, hoặc khi mọi logic đều nằm trong các hàm callback khai báo chung.

```typescript
// Định nghĩa mutation
const { mutate } = useMutation({
  mutationFn: addDocument,
  onSuccess: () => {
    console.log("Đã thêm");
  },
  onError: (error) => {
    console.log(error);
  },
});

// Gọi mutation (KHÔNG dùng await)
const handleSubmit = () => {
  mutate({ title: "New Doc" });
  // Code ở đây vẫn chạy ngay lập tức mà không chờ API xong
};
```

### `mutateAsync`

- **Trả về:** Lời hứa (`Promise`) giải quyết (resolve) với dữ liệu trả về hoặc từ chối (reject) với lỗi.
- **Cách dùng:** Có thể dùng `async/await` và `try/catch` giống gọi các hàm promise thông thường.
- **Khi nào dùng:** Dùng khi bạn cần đợi API gọi xong mới thực hiện một tác vụ khác (ví dụ: đợi tạo xong document thì mới redirect sang trang detail của document đó), hoặc bạn muốn dùng cấu trúc `try/catch` để xử lý lỗi ngay tại nơi gọi hàm.

```typescript
const { mutateAsync } = useMutation({ mutationFn: addDocument });

const handleSubmit = async () => {
  try {
    // Đợi API xong lấy kết quả
    const newDoc = await mutateAsync({ title: "New Doc" });
    // Nếu thành công thì redirect
    router.push(`/document/${newDoc.id}`);
  } catch (error) {
    // Quản lý lỗi cục bộ
    console.error("Lỗi rồi", error);
  }
};
```

**Tóm gọn:**

- Muốn code gọn, không đợi, xử lý bằng callback chung → Dùng **`mutate`**
- Muốn đợi kết quả (`await`) theo luồng tuần tự (`try/catch`) → Dùng **`mutateAsync`**

---

## Tóm Tắt Nhanh — Từ Điển Thuật Ngữ

| Thuật ngữ             | Giải thích ngắn                                                        |
| --------------------- | ---------------------------------------------------------------------- |
| **Edge Function**     | Function chạy trên server Supabase (Deno), dùng làm proxy bảo mật      |
| **Webhook**           | URL mà một service gọi tới để thông báo hoặc gửi data cho service khác |
| **Callback**          | Gửi URL cho bên kia; khi bên kia xong việc, họ gọi POST tới URL đó     |
| **n8n**               | Tool tự động hóa: kéo thả nodes để tạo pipeline xử lý data             |
| **RAG**               | Kỹ thuật giúp AI trả lời dựa trên tài liệu riêng của bạn               |
| **Embedding**         | Chuyển text thành vector số (mã hóa ngữ nghĩa)                         |
| **Chunking**          | Chia văn bản dài thành đoạn nhỏ trước khi embedding                    |
| **pgvector**          | Extension PostgreSQL cho phép lưu và tìm kiếm vector                   |
| **Cosine Similarity** | Đo độ giống nhau giữa 2 vector bằng góc giữa chúng                     |
| **JWT**               | Token mã hóa chứa thông tin user, dùng để xác thực                     |
| **RLS**               | Row Level Security — PostgreSQL tự lọc data theo user                  |
| **Service Role Key**  | Key admin của Supabase, bypass RLS — tuyệt đối không để lộ             |
| **Anon Key**          | Key public của Supabase, dùng kèm JWT user — an toàn                   |
| **Realtime**          | WebSocket push thay đổi DB về frontend ngay lập tức                    |
| **HNSW**              | Thuật toán index vector nhanh, nhưng chỉ hỗ trợ ≤2000 chiều            |
| **IVFFlat**           | Thuật toán index vector khác, hỗ trợ >2000 chiều                       |
| **Signed URL**        | URL có thời hạn để truy cập file private trong Storage                 |
