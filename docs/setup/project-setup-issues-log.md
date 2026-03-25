# Báo cáo Toàn diện: Các Vấn đề & Giải pháp trong Quá trình Setup Dự án InsightsLM

Tài liệu này tổng hợp toàn bộ các lỗi, vướng mắc logic và các lỗi hệ thống gặp phải trong quá trình khởi tạo, cấu hình và triển khai dự án InsightsLM (NotebookLM Clone). Việc ghi lại bao gồm cả những phương án đã thất bại và những giải pháp thành công cuối cùng để làm tài liệu tham khảo cho việc maintain sau này.

---

## 1. Vấn đề Tương thích n8n v1.x (Deprecated Nodes)

### 📌 Mô tả lỗi
Workflow **Podcast Generation** tải về nguyên bản chứa các node `executeCommand` đã bị deprecate trong các phiên bản n8n mới (v1.x trở lên), dẫn đến workflow báo lỗi không thể kích hoạt hoặc import chuẩn xác.

### 🛠️ Giải pháp áp dụng
- **Trạng thái:** ✅ Thành công
- **Cách xử lý:** Thay thế toàn bộ các node `executeCommand` cũ bằng các `Code` node tiêu chuẩn của n8n, cho phép thực thi logic tương đương mà không bị cảnh báo legacy. Workflow sau đó được lưu thành bản `InsightsLM___Podcast_Generation_FIXED.json`.

---

## 2. Thiếu Môi trường FFmpeg cho Podcast Generation

### 📌 Mô tả lỗi
Tính năng tạo Podcast (ghép audio) yêu cầu thư viện hệ điều hành FFmpeg. Tuy nhiên, Docker image mặc định của `n8nio/n8n` không có sẵn FFmpeg, dẫn đến lỗi command not found khi workflow chạy pipeline xử lý audio.

### 🛠️ Giải pháp áp dụng
- **Trạng thái:** ✅ Thành công
- **Cách xử lý:** Tạo một `Dockerfile` custom áp dụng Multi-stage build để inject FFmpeg tĩnh vào image n8n.
  ```dockerfile
  FROM mwader/static-ffmpeg:6.0 AS ffmpeg-source
  FROM n8nio/n8n:latest
  USER root
  COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
  COPY --from=ffmpeg-source /ffprobe /usr/local/bin/
  USER node
  ```
- **Lưu ý bổ sung:** Cấu hình biến môi trường `NODES_EXCLUDE=[]` trong `docker-compose.yml` để mở khóa các CLI node cần thiết cho workflow.

---

## 3. Lỗi Gọi Sub-Workflow ("Cannot Execute Workflow")

### 📌 Mô tả lỗi
Trong workflow **Process Additional Sources**, node `Execute Workflow` báo lỗi không gọi được workflow con là **Upsert to Vector Store**. Cụ thể, n8n ném lỗi không nhận diện được workflow đích.

### 📌 Phân tích nguyên nhân
Workflow đích ("Upsert to Vector Store") bắt đầu bằng một node `Webhook` (chờ HTTP Request). Node Webhook chỉ lắng nghe traffic từ ngoài vào và **không** có chức năng nhận tín hiệu trigger nội bộ từ workflow khác trong n8n.

### 🛠️ Giải pháp áp dụng
- **Trạng thái:** ✅ Thành công
- **Cách xử lý:** Xử lý trực tiếp trong workflow đích ("Upsert to Vector Store"):
  - Bổ sung thêm node **"When Executed by Another Workflow"** (`executeWorkflowTrigger`).
  - Gắn node này song song với node `Webhook` trỏ thẳng vào khối `Code` xử lý logic tiếp theo.
  - Sau khi lưu, workflow cha có thể tham chiếu và truyền data thành công qua trigger này. Chú ý thứ tự publish: Phải publish các workflow con (Extract Text, Upsert to Vector Store) trước khi publish workflow cha.
- Đồng thời phải chọn workflow đích bằng Workflow ID thay vì chọn từ dropdown list nếu UI bị bug hiển thị trạng thái unpublished dù đã publish.

---

## 4. Lỗi Sai lệch Kích thước Vector Database (Dimension Mismatch Error)

### 📌 Mô tả lỗi
Tại node `Supabase Vector Store`, n8n bung lỗi từ database:
`Error inserting: expected 768 dimensions, not 3072 400 Bad Request`

### 📌 Phân tích nguyên nhân
- Giai đoạn đầu dự án, Supabase table `documents` được tạo với schema chứa cột `embedding` kiểu `vector(768)` (do trước đây xài OpenAI hoặc mô hình Gemini cũ `text-embedding-004`).
- Khi migrate hoàn toàn sang Gemini, n8n sử dụng node `Embeddings Google Gemini` dùng model đời mới `gemini-embedding-001`. Model này mặc định trả ra vector có **3072 dimensions**.

### 🛠️ Giải pháp áp dụng
- **Trạng thái:** ✅ Thành công
- **Cách xử lý:** Chạy đoạn mã SQL trên Supabase SQL Editor để drop index (nếu có) và thay đổi trực tiếp dimension của column:
  ```sql
  DROP INDEX IF EXISTS documents_embedding_idx;
  ALTER TABLE public.documents ALTER COLUMN embedding TYPE vector(3072);
  ```

---

## 5. Cạn kiệt Quota API (Gemini 429 Too Many Requests)

### 📌 Mô tả lỗi
Trong quá trình test ingest lượng lớn text từ PDF, workflow liên tục fail ở các node gọi Google Gemini Chat Model với mã lỗi HTTP 429 (Too Many Requests/Quota Exceeded). Nguyên nhân là do sử dụng bản free tier bị giới hạn rate limit cực thấp.

### 🛠️ Giải pháp thử nghiệm
- **Trạng thái:** ⚠️ Đã giảm thiểu
- **Cách xử lý:** 
  - Chờ đợi reset quota theo ngày.
  - Chuyển đổi qua lại giữa các model (vd: dùng gemini-2.5-flash).
  - Có thể config node trong n8n auto-retry sau vài giây nếu dính lỗi code 429.

---

## 6. Lỗi Format Structured Output Parser Của n8n ("Model output doesn't fit required format")

### 📌 Mô tả lỗi
Đây là diễn biến phức tạp nhất. Ở 2 workflow (`Generate Notebook Details` và `Upsert to Vector Store`), node **Structured Output Parser** luôn ném lỗi validate schema với thông báo "Model output doesn't fit required format". 

### 📌 Phân tích Catch-22 (Tiến thoái lưỡng nan)
Node `Structured Output Parser` của n8n có một rule "ngầm": nó âm thầm gắn nối một dòng promt (Instruction) bắt LLM **phải** wrap data json vào trong một root key tên là `"output"`. 
- Nếu khai báo JSON Schema flat `{"title": "..."}`, LLM tạo ra `{"output": {"title": "..."}}`. Parser nhận format này và đem so sánh với bản gốc (flat) => ❌ **FAIL** vì dư key "output".
- Nếu khai báo JSON Schema có key `"output"`, n8n lại chèn thêm instruction => Kết quả LLM x2 bọc lại: `{"output": {"output": {"title": "..."}}}`. Parser kiểm tra root "title" nhưng đụng "output" => ❌ **FAIL** tiếp.
- Model của OpenAI thì tuân thủ luật wrap này 100%, nhưng model Gemini đôi khi lại lờ đi, gây nên sự bất nhất (lúc chạy lúc lỗi).

### ❌ Các giải pháp từng thử nhưng Thất bại
1. **Sửa system prompt bắt raw JSON:** Node n8n vẫn cố tình override prompt. **(FAIL)**
2. **Bật Auto-Fix Format trong Parser:** Yêu cầu chạy thêm 1 model phụ gây tốn quota/token vô ích. **(FAIL)**
3. **Khai báo nested schema chứa sẵn thẻ 'output':** Gây ra output double-wrapped. **(FAIL)**
4. **Đổi qua Generate from JSON example flat:** Test lại với n8n vẫn lỗi parsing y như cũ. **(FAIL)**

### 🛠️ Giải pháp áp dụng cuối cùng (Giải pháp A)
- **Trạng thái:** ✅ Thành công tuyệt đối
- **Cách xử lý:** LOẠI BỎ hoàn toàn dependency vào Node Parser của n8n.
  1. Tắt chế độ `Require Specific Output Format` (`hasOutputParser = false`) trong LangChain node.
  2. Xoá node Structured Output Parser.
  3. Sửa hard-code trong System Message yêu cầu LLM phải trả về duy nhất một cấu trúc JSON JSON object.
  4. Bổ sung một **Code node** (Javascript) vào workflow để tự parse response từ lang chain (`$json.text`). Sử dụng Regex `match(/\{[\s\S]*\}/)` để lọc bất kì text rác nào trước/sau object.
  5. Thêm hook kiểm tra: nếu JSON bị wrap trong `"output"`, code sẽ dỡ nó về flat. Sau đó Code tự đóng gói trả về định dạng downstream mong muốn `[{ json: { output: parsed_data } }]`.
  6. **Kết quả:** Code Supabase Edge Functions xử lý ngọt ngào vì nó vẫn nhận được biến `generatedData.output.*` như thiết kế nguyên bản ban đầu.

---

## 7. Configuration Supabase Webhook & Edge Function (Error 401/500/Timeout)

### 📌 Mô tả lỗi
Edge Function gặp lỗi gọi Webhook n8n ném ra mớ lỗi Unauthorized (401) hoặc Internal Server Error (500). Workflow không chạy được khi trigger từ Front-end app.

### 🛠️ Giải pháp áp dụng
- **Trạng thái:** ✅ Thành công
- **Cách xử lý:**
  1. Thay vì truyền credential qua .env rườm rà, khai báo thẳng 5 URL webhook production của n8n vào Supabase Secrets (`NOTEBOOK_CHAT_URL`, `NOTEBOOK_GENERATION_URL`, `AUDIO_GENERATION_WEBHOOK_URL`, `DOCUMENT_PROCESSING_WEBHOOK_URL`, `ADDITIONAL_SOURCES_WEBHOOK_URL`).
  2. Map key API `GEMINI_API_KEY` vào Supabase Secrets thay vì hard-coded.
  3. Thêm parameter khai báo Header Auth (`NOTEBOOK_GENERATION_AUTH`).
  4. Trọng yếu nhất: Trên Cài đặt Edge Function của Supabase Dashboard, **TẮT mục "Verify JWT with legacy secret"** vì codebase sử dụng luồng check Auth token mới (nội bộ hàm ts) thay vì dùng Global Supabase Anon/Service Key cổ điển.

---

*Tài liệu này được tạo tự động để tra cứu nhanh các quyết định kỹ thuật đã đạt được trong suốt quá trình setup dự án InsightsLM.*
