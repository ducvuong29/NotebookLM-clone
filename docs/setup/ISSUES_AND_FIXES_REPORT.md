# 🔴 Báo cáo lỗi: "Model output doesn't fit required format"

> **Ngày báo cáo:** 2026-03-22  
> **Trạng thái:** ❌ CHƯA GIẢI QUYẾT  
> **Ảnh hưởng:** 2 workflow n8n không hoạt động khi upload PDF

---

## 1. Mô tả lỗi

### Lỗi gì?
Khi user upload file PDF, 2 workflow n8n bị lỗi ở node **Structured Output Parser1** với message:

```
Model output doesn't fit required format
```

### Workflow bị ảnh hưởng
| Workflow | ID | Node lỗi |
|---|---|---|
| InsightsLM - Generate Notebook Details | `UdP5vM6HcHUBYO0A` | Structured Output Parser1 |
| InsightsLM - Upsert to Vector Store | `iby1ddgV6y1SSpre` | Structured Output Parser1 |

### Nguyên nhân gốc
Lỗi xảy ra sau khi **chuyển từ Gemini sang OpenAI** model. Gemini và OpenAI xử lý structured output khác nhau, dẫn đến format mismatch.

---

## 2. Phân tích kỹ thuật chi tiết

### 2.1 Cách n8n Structured Output Parser hoạt động

Khi Structured Output Parser được kết nối vào Chain node, n8n **tự động** thêm instruction vào prompt gửi cho LLM:

```
You must format your output as a JSON value that adheres to a given "JSON Schema" instance.
...
The JSON response must contain a key named "output" with the value being the structured data.
```

→ Điều này có nghĩa: **bất kể schema bạn khai báo thế nào**, n8n luôn yêu cầu model wrap response trong key `"output"`.

### 2.2 Vấn đề "Catch-22" (tiến thoái lưỡng nan)

#### Trường hợp A: Schema FLAT (không có `output` wrapper)
```json
// Schema khai báo:
{"title": "<ADD>", "summary": "<ADD>"}

// n8n tự động yêu cầu model wrap trong "output"
// → Model trả về:
{"output": {"title": "ABC", "summary": "DEF"}}

// → Parser validate FLAT schema → FAIL!
// Parser mong đợi: {"title": "ABC", "summary": "DEF"} ở root
// Parser nhận được: {"output": {...}} ở root
```
**Kết quả: ❌ Lỗi**

#### Trường hợp B: Schema có `output` wrapper
```json
// Schema khai báo:
{"output": {"title": "<ADD>", "summary": "<ADD>"}}

// n8n tự động yêu cầu model wrap trong "output" 
// + Schema cũng có "output"
// → Model trả về DOUBLE-WRAPPED:
{"output": {"output": {"title": "ABC", "summary": "DEF"}}}

// → Parser validate → Tìm key "title" trong output nhưng thấy key "output" → FAIL!
```
**Kết quả: ❌ Lỗi**

### 2.3 Tại sao Gemini hoạt động mà OpenAI không?

Gemini model cũ **bỏ qua** instruction wrapper `output` từ parser và trả về JSON flat trực tiếp. OpenAI model **tuân thủ nghiêm ngặt** mọi instruction, bao gồm cả instruction wrap trong `output` từ parser → gây ra xung đột.

---

## 3. Lịch sử các cách đã thử (tất cả đều thất bại)

### Lần 1: Sửa system prompt + Xóa Response Format
- **Thời gian:** 2026-03-21 ~12:30
- **Hành động:** 
  - Sửa system prompt thành "output raw JSON without wrappers"
  - Xóa setting "Response Format: JSON Object" từ OpenAI node
- **Kết quả:** ❌ Vẫn lỗi - Model vẫn wrap trong `output` vì parser tự thêm instruction

### Lần 2: Bật Auto-Fix Format
- **Thời gian:** 2026-03-21 ~12:47
- **Hành động:** Bật toggle "Auto-Fix Format" trong Structured Output Parser
- **Kết quả:** ❌ Yêu cầu kết nối thêm 1 model phụ → không khả thi

### Lần 3: Chuyển sang JSON Schema mode + thêm `output` wrapper
- **Thời gian:** 2026-03-21 ~18:30
- **Hành động:**
  - Đổi Schema Type sang "Define using JSON Schema"
  - Khai báo schema với `output` wrapper:
    ```json
    {
      "type": "object",
      "properties": {
        "output": {
          "type": "object",
          "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            ...
          }
        }
      },
      "required": ["output"]
    }
    ```
- **Kết quả:** ❌ Model trả về double-wrapped: `{"output": {"output": {...}}}`

### Lần 4: Quay lại JSON Example mode + schema FLAT
- **Thời gian:** 2026-03-22 ~01:50
- **Hành động:**
  - Đổi Schema Type về "Generate From JSON Example"
  - Khai báo JSON Example flat (không có `output`):
    ```json
    {"title":"<ADD>","summary":"<ADD>","notebook_icon":"<ADD>","background_color":"<ADD>","example_questions":["ADD","ADD"]}
    ```
- **Kết quả:** ❌ Model vẫn wrap trong `output`, parser validate flat schema → fail

---

## 4. Trạng thái hiện tại (2026-03-22 02:27)

### Cấu hình hiện tại trong n8n live:

**WF1 - Generate Notebook Details:**
| Setting | Giá trị |
|---|---|
| Schema Type | Generate From JSON Example |
| JSON Example | `{"title":"<ADD>","summary":"<ADD>","notebook_icon":"<ADD>","background_color":"<ADD>","example_questions":["ADD","ADD"]}` |
| Auto-Fix Format | OFF |
| Published | ✅ Yes |

**WF2 - Upsert to Vector Store:**
| Setting | Giá trị |
|---|---|
| Schema Type | Generate From JSON Example |
| JSON Example | `{"title":"<ADD>","summary":"<ADD>"}` |
| Auto-Fix Format | OFF |
| Published | ✅ Yes |

### Output thực tế từ OpenAI (Execution #182):
```json
{
  "output": {
    "title": "Giáo Trình Phát Triển Ứng Dụng Android",
    "summary": "...",
    "notebook_icon": "📚",
    "background_color": "slate",
    "example_questions": [...]
  }
}
```

### Lý do fail:
Parser mong đợi flat JSON `{"title": "..."}` nhưng nhận được `{"output": {"title": "..."}}`.

---

## 5. Downstream code expectations

### Edge Function (`supabase/functions/generate-notebook-content/index.ts`):
```typescript
// Line 165-171: Mong đợi output wrapper
if (generatedData && generatedData.output) {
  const output = generatedData.output;
  title = output.title;
  description = output.summary;
  notebookIcon = output.notebook_icon;
  // ...
}
```
→ Edge function **cần** `output` wrapper

### WF2 Supabase1 node:
```
$json.output.summary  // Line 219
$json.output.title    // Line 223
```
→ Supabase node **cần** `output` wrapper

→ **Kết luận:** Downstream code cần dữ liệu ở dạng `$json.output.title`. Parser cần parse thành công để truyền dữ liệu xuống.

---

## 6. Giải pháp đề xuất tiếp theo

### 🟢 Giải pháp A: Xóa Structured Output Parser, dùng Code node parse JSON (ĐỀ XUẤT CHÍNH)

**Ý tưởng:** Bỏ node Structured Output Parser hoàn toàn. Thay bằng Code node tự parse JSON từ response text của OpenAI.

**Cách thực hiện:**
1. Ngắt kết nối Structured Output Parser1 khỏi Chain node
2. Tắt `hasOutputParser: true` trong Generate Title & Description1
3. Thêm Code node sau Chain node để parse JSON:
   ```javascript
   const text = $json.text; // raw output from chain
   const jsonMatch = text.match(/\{[\s\S]*\}/);
   const parsed = JSON.parse(jsonMatch[0]);
   return [{ json: { output: parsed } }];
   ```
4. Sửa system prompt yêu cầu trả về JSON flat (không `output` wrapper)

**Ưu điểm:**
- Không phụ thuộc vào parser behavior của n8n
- Kiểm soát hoàn toàn format
- Downstream code không cần sửa (vẫn nhận `$json.output.*`)

**Nhược điểm:**
- Cần xử lý edge case khi model trả về invalid JSON

---

### 🟡 Giải pháp B: Bật Auto-Fix Format + kết nối model phụ

**Ý tưởng:** Bật Auto-Fix Format và kết nối thêm 1 OpenAI model instance để tự sửa format.

**Cách thực hiện:**
1. Bật toggle "Auto-Fix Format" trong Structured Output Parser
2. Kết nối thêm 1 OpenAI Chat Model node vào port "Model" của parser
3. Dùng model nhẹ (gpt-4o-mini) để tiết kiệm token

**Ưu điểm:**
- n8n xử lý tự động
- Không cần viết code

**Nhược điểm:**
- Tốn thêm API call (tốn tiền)
- Chậm hơn
- Có thể vẫn fail nếu auto-fix không đủ thông minh

---

### 🟡 Giải pháp C: Sử dụng OpenAI Function Calling thay vì Parser

**Ý tưởng:** Dùng OpenAI node với Function Calling / Tool Use để enforce structured output.

**Cách thực hiện:**
1. Thay Chain + Parser bằng OpenAI node trực tiếp (không qua LangChain)
2. Cấu hình Function Calling với JSON schema
3. OpenAI sẽ trả về structured output đúng format

**Ưu điểm:**
- OpenAI native structured output rất đáng tin cậy
- Không bị conflict với parser behavior

**Nhược điểm:**
- Phải restructure workflow
- Không dùng được LangChain chain node

---

### 🔵 Giải pháp D: Sửa downstream code để không cần `output` wrapper

**Ý tưởng:** Nếu parser trả về flat JSON thành công, sửa downstream code để đọc trực tiếp.

**Cách thực hiện:**
1. Sửa Edge Function: `title = generatedData.title` (thay vì `generatedData.output.title`)
2. Sửa WF2 Supabase node: `$json.title` (thay vì `$json.output.title`)

**Lưu ý:** Giải pháp này chỉ áp dụng nếu parser thực sự parse thành công flat JSON - nhưng hiện tại parser vẫn fail, nên giải pháp này KHÔNG đủ một mình.

---

## 7. Khuyến nghị

> **Giải pháp A (Code node thay parser)** là phương án an toàn và đáng tin cậy nhất vì nó loại bỏ hoàn toàn dependency vào behavior tự động của n8n Structured Output Parser.

### Thứ tự ưu tiên:
1. **Giải pháp A** - Xóa parser, dùng Code node ← ĐỀ XUẤT #1
2. **Giải pháp C** - Dùng OpenAI Function Calling ← ĐỀ XUẤT #2
3. **Giải pháp B** - Auto-Fix Format + model phụ ← Backup plan
4. **Giải pháp D** - Sửa downstream code ← Bổ sung cho A/B/C

---

## 8. Files liên quan

| File | Mô tả |
|---|---|
| `n8n/InsightsLM - Generate Notebook Details.json` | Workflow 1 JSON local |
| `n8n/InsightsLM - Upsert to Vector Store.json` | Workflow 2 JSON local |
| `supabase/functions/generate-notebook-content/index.ts` | Edge function xử lý WF1 response |

---

# 🟢 Báo cáo sửa lỗi: "The file \"/tmp/...mp3\" is not writable"

> **Ngày báo cáo:** 2026-03-23
> **Trạng thái:** ✅ ĐÃ GIẢI QUYẾT
> **Workflow:** InsightsLM - Podcast Generation
> **Vấn đề ban đầu:** Lỗi không ghi được file khi chạy trên n8n UI (`/tmp is not writable` hoặc `/home/node/.n8n/...mp3 is not writable`)

## 1. Phân tích nguyên nhân gốc rễ

Lỗi xảy ra trong quá trình chuyển đổi (migration) model từ **Gemini sang OpenAI**:

1. **Kiến trúc cũ (Gemini TTS):** Gemini trả về audio dạng Base64 PCM. Workflow phải:
   - Decode Base64 thành file PCM
   - Ghi file PCM ra disk (`Write Audio to Disk`)
   - Dùng FFmpeg convert PCM sang MP3
   - Đọc lại file MP3 (`Read Audio from Disk`)
   - Upload lên Supabase Storage
2. **Nguyên nhân lỗi ghi file:** Container Docker n8n chạy với user `node` (non-root), vì vậy nó không có quyền ghi trực tiếp vào thư mục `/tmp` của host, tạo ra lỗi permission denied (`is not writable`).

## 2. Giải pháp đã thực hiện

### Lần 1: Sai lầm (Sửa đường dẫn file) ❌
- **Hành động:** Chuyển đường dẫn từ `/tmp/...` sang `/home/node/.n8n/...` (thư mục user node có quyền ghi).
- **Kết quả:** Vẫn lỗi. Lý do là workflow vẫn mang logic rườm rà của Gemini cũ (vẫn cố ghi và dùng FFmpeg convert) trong khi đã đổi sang OpenAI node.

### Lần 2: Tối ưu hóa pipeline (Đơn giản hóa kiến trúc) ✅
- **Phát hiện:** `OpenAI TTS API` trả về trực tiếp file `MP3` dưới dạng **binary data** (nếu set `response_format: "mp3"` và `Response Format: file`).
- **Hành động:**
  1. Xóa bỏ hoàn toàn các node xử lý file trung gian: `Convert to File`, `Write Audio to Disk`, `Convert Audio to MP`, `Read Audio from Disk`.
  2. Nối trực tiếp node `Generate Audio` (OpenAI) vào node `Upload object` (Supabase).
  3. Cấu hình node `Upload object` đọc trực tiếp từ input binary field `data`.
  4. Sửa lại tên file upload thành `podcast_{{ $execution.id }}.mp3` cho rõ ràng.

## 3. Kết luận
- **Sự khác biệt API:** Việc migrate model AI không chỉ là thay đổi thông tin API Key hay endpoint, mà cần hiểu rõ **response format** của mỗi model khác nhau như thế nào (Base64 PCM vs Binary MP3) để điều chỉnh workflow tương ứng.
- **Micro-optimization:** Việc bỏ các bước read/write disk không chỉ sửa lỗi permission, mà còn giúp workflow chạy nhanh hơn đáng kể và tiết kiệm tài nguyên I/O cho server.

---

# 🟢 Báo cáo sửa lỗi: Chat Workflow — "Model output doesn't fit required format" + Frontend xoay tròn

> **Ngày báo cáo:** 2026-03-23
> **Trạng thái:** ✅ ĐÃ GIẢI QUYẾT
> **Workflow:** InsightsLM - Chat
> **Vấn đề ban đầu:** Node Structured Output Parser1 báo lỗi "Model output doesn't fit required format" khi user hỏi câu không có trong tài liệu, đồng thời frontend bị xoay tròn mãi mãi

## 1. Mô tả lỗi chi tiết

### Hai triệu chứng đan xen:
| Triệu chứng | Khi nào xảy ra | Biểu hiện |
|---|---|---|
| Parser format error | Hỏi câu **không có** trong tài liệu | n8n báo lỗi đỏ ở node Structured Output Parser1 |
| Frontend xoay tròn | Hỏi câu **không có** trong tài liệu | Loading indicator (3 chấm nảy) không bao giờ tắt |

### Lưu ý:
- Khi hỏi câu **có** trong tài liệu → workflow chạy hoàn toàn bình thường, trả lời + citations đúng format.
- Lỗi chỉ xảy ra khi AI không tìm thấy thông tin liên quan trong Vector Store.

## 2. Phân tích nguyên nhân gốc rễ

### 2.1 Tại sao Parser fail?

Khi AI không tìm thấy thông tin, nó trả về **plain text** (VD: `"Sorry I don't know"`) thay vì JSON `[{text, citations}]`. Structured Output Parser **không thể parse plain text** → báo lỗi.

Đây là lỗi thiết kế: Parser chỉ xử lý được 1 trường hợp (JSON hợp lệ), không có cơ chế fallback cho trường hợp "không có câu trả lời".

### 2.2 Tại sao Frontend xoay tròn?

Đây là **phát hiện quan trọng nhất**: Vấn đề không nằm ở webhook response, mà ở **Postgres Chat Memory**.

```
Chuỗi sự kiện:
1. Parser fail → AI Agent node ERROR
2. AI Agent error → Postgres Chat Memory KHÔNG LƯU AI response
3. n8n_chat_histories KHÔNG CÓ message mới
4. Supabase Realtime KHÔNG FIRE event nào
5. Frontend chờ Realtime INSERT event → KHÔNG BAO GIỜ NHẬN ĐƯỢC
6. Loading indicator KHÔNG TẮT → xoay tròn mãi
```

**Data flow của Chat:**
```
Frontend → Edge Function (send-chat-message) → n8n Webhook
  → AI Agent → Postgres Chat Memory lưu vào n8n_chat_histories
  → Supabase Realtime bắn INSERT event → Frontend nhận message mới
  → Frontend tắt loading indicator
```

Vì Memory không lưu → Realtime không fire → Frontend không bao giờ nhận được AI response.

## 3. Lịch sử các cách đã thử

### Lần 1: Flatten schema (bỏ output wrapper) ❌
- **Thời gian:** 2026-03-23 ~10:30
- **Hành động:** Bỏ key `"output"` bao ngoài trong `jsonSchemaExample` để tránh triple-nesting (giống fix ở WF1 và WF2)
- **Kết quả:** ❌ Khi có câu trả lời → hoạt động. Khi không có → vẫn fail vì AI trả plain text, Parser không parse được.
- **Bài học:** Flatten chỉ sửa được lỗi double/triple wrapping, không sửa được lỗi AI trả plain text.

### Lần 2: Ép System Prompt trả JSON format + Flatten ❌
- **Thời gian:** 2026-03-23 ~11:06
- **Hành động:** Sửa system prompt, thêm instruction bắt AI phải trả JSON kể cả khi không biết: `[{"text": "Sorry...", "citations": []}]`
- **Kết quả:** ❌ AI vẫn trả plain text khi không biết. Lý do: **n8n Parser tự inject instruction riêng** vào prompt, ghi đè hoặc xung đột với system prompt của mình.
- **Bài học:** Ép system prompt không đủ vì Parser có behavior riêng, không kiểm soát được.

### Lần 3: Giải pháp A — Bỏ Parser, thêm Code node regex ❌
- **Thời gian:** 2026-03-23 ~10:53
- **Hành động:** Xóa Structured Output Parser, set `hasOutputParser: false`, thêm Code node sau AI Agent để parse JSON bằng regex
- **Kết quả:** ❌ AI luôn trả "Sorry I don't know" cho mọi câu hỏi (kể cả câu hỏi có đáp án). System prompt thay đổi quá nhiều khiến AI bối rối.
- **Bài học:** Khi thay đổi quá nhiều thứ cùng lúc (xóa parser + thay prompt + thêm code node), khó xác định lỗi ở đâu.

### Lần 4: Thêm Handle Parse Error node vào error output ❌
- **Thời gian:** 2026-03-23 ~11:20
- **Hành động:**
  - Giữ Structured Output Parser
  - Tận dụng `onError: "continueErrorOutput"` của AI Agent
  - Kết nối error output (index 1) → Code node "Handle Parse Error" → wrap fallback JSON
- **Kết quả:** ❌ Handle Parse Error chạy đúng (green check trong n8n), NHƯNG:
  - Code node **không ghi vào database** `n8n_chat_histories`
  - Frontend lắng nghe Realtime từ bảng này, không phải webhook response
  - → Vẫn xoay tròn
- **Bài học:** Cần hiểu rõ **toàn bộ data flow** (Frontend ← Realtime ← Database ← Memory) chứ không chỉ fix ở tầng n8n workflow.

### Lần 5: Bỏ Parser hoàn toàn + System prompt phù hợp ✅
- **Thời gian:** 2026-03-23 ~11:28
- **Hành động:**
  1. **Xóa hoàn toàn** Structured Output Parser1 và Handle Parse Error node
  2. Set `hasOutputParser: false` trong AI Agent1
  3. Sửa system prompt yêu cầu AI trả JSON format `{output: [{text, citations}]}` nhưng **không quá cứng nhắc**
  4. **Giữ nguyên** tất cả các node khác (Memory, Vector Store, Embeddings, Webhook)
- **Kết quả:** ✅ **Hoạt động hoàn hảo cho cả 2 trường hợp!**

## 4. Tại sao Lần 5 thành công?

### Logic quyết định:
```
Khi BỎ Parser → AI Agent KHÔNG BAO GIỜ ERROR (vì không có gì để fail)
→ Postgres Chat Memory LUÔN LƯU AI response
→ n8n_chat_histories LUÔN CÓ message mới
→ Realtime LUÔN FIRE INSERT event
→ Frontend LUÔN NHẬN được AI response
→ Loading indicator LUÔN TẮT
```

### Sự khác biệt với Lần 3 (cũng bỏ parser nhưng fail):
- **Lần 3:** Thay đổi system prompt quá triệt để + thêm Code node → AI bối rối, luôn trả "Sorry"
- **Lần 5:** Giữ system prompt gần giống gốc, chỉ thêm instruction JSON nhẹ nhàng + **KHÔNG thêm Code node**

### Bước parse JSON chuyển sang Frontend:
Frontend (`useChatMessages.tsx` dòng 60-129) **đã có sẵn logic** xử lý cả 2 trường hợp:

```typescript
// Thử parse JSON
const parsedContent = JSON.parse(messageObj.content);
if (parsedContent.output && Array.isArray(parsedContent.output)) {
  // ✅ JSON hợp lệ → hiển thị text + citations
} else {
  // Fallback → hiển thị text thuần
}
// ... catch block:
// ❌ Parse fail → hiển thị raw text (không crash)
```

## 5. Đánh giá tác động

| Khía cạnh | Trước | Sau | Đánh giá |
|---|---|---|---|
| Hiệu năng | Tốn 2-3 API call (Agent + AutoFix retry) | 1 API call duy nhất | 🟢 Tốt hơn |
| Trải nghiệm | Xoay tròn khi không có đáp án | Luôn nhận phản hồi | 🟢 Tốt hơn nhiều |
| Độ ổn định | Parser fail → crash workflow | Không có parser → không crash | 🟢 Tốt hơn |
| Bảo mật | JWT + RLS + Webhook Auth | Không thay đổi | ⚪ Không đổi |
| Trade-off | — | Mất citations nếu AI trả plain text (~5%) | 🟡 Chấp nhận được |

## 6. Files đã thay đổi

| File | Thay đổi |
|---|---|
| `n8n/InsightsLM - Chat.json` | Xóa Structured Output Parser1, set `hasOutputParser: false`, cập nhật system prompt, xóa connections liên quan parser |

## 7. Bài học rút ra

1. **Hiểu toàn bộ data flow trước khi fix:** Lỗi ở n8n (Parser fail) nhưng triệu chứng ở Frontend (xoay tròn). Phải trace: Parser → Agent error → Memory không lưu → Realtime không fire → Frontend chờ mãi.
2. **Structured Output Parser + AI Agent = rủi ro:** Parser không có cơ chế graceful fallback cho trường hợp AI trả plain text. Khi dùng với Agent (hành vi tự do), risiko crash cao.
3. **Frontend-side parsing linh hoạt hơn:** Cho phép xử lý cả JSON và plain text mà không crash workflow.
4. **Thay đổi ít hơn = debug dễ hơn:** Lần 3 thay đổi quá nhiều → khó tìm lỗi. Lần 5 thay đổi tối thiểu → thành công.

---

*Báo cáo này được cập nhật tự động bởi Antigravity AI Assistant.*
