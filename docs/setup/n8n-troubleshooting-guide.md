# Hướng dẫn Xử lý Lỗi & Kinh nghiệm Cấu hình n8n (Dự án InsightsLM)

Tài liệu này tổng hợp lại các vấn đề đã gặp phải và cách giải quyết trong quá trình cấu hình liên kết các workflows của n8n, cụ thể là giữa **Process Additional Sources** và **Upsert to Vector Store**.

---

## 1. Lỗi: Workflow con không thể được gọi (Cannot Execute Workflow)

### Mô tả vấn đề
- Thêm node `Execute Workflow` vào workflow cha ("Process Additional Sources") nhưng khi lưu hoặc cấu hình, n8n báo lỗi biểu tượng ⚠️ màu vàng.
- Workflow con ("InsightsLM - Upsert to Vector Store") hiển thị chữ màu đỏ trong danh sách thả xuống.
- N8n không nhận diện được workflow đích để thực thi.

### Nguyên nhân
- Workflow đích bắt đầu tiến trình bằng một **Webhook node** (phục vụ cho trigger qua API HTTP).
- Node Webhook **KHÔNG** đóng vai trò là điểm vào (entry point) cho phép một workflow khác trong cùng hệ thống gọi trực tiếp đến nó. 

### Giải pháp và Bài học rút ra
- **Giải pháp:** Bổ sung thêm node **`When Executed by Another Workflow`** (hay còn gọi là `executeWorkflowTrigger`) vào workflow đích. Khai báo các input schema cần thiết (`notebook_id`, `extracted_text`, `source_id`) và nối song song cùng với node Webhook vào tiến trình xử lý chính (Code node). 
- **Kinh nghiệm:** 
  > 💡 Một workflow trong n8n có thể có **nhiều Trigger Nodes** song song để phục vụ các mục đích gọi khác nhau. Luôn thêm `executeWorkflowTrigger` nếu có ý định thiết kế theo mô hình chia nhỏ Sub-workflows.

---

## 2. Lỗi: Sai lệch Kích thước Vector (Dimension Mismatch Error)

### Mô tả vấn đề
- Sau khi 2 workflow gọi được nhau, quá trình xử lý vẫn bị ném ra báo lỗi ở node **Supabase Vector Store**.
- Message lỗi từ Supabase: `Error inserting: expected 768 dimensions, not 3072 400 Bad Request`.

### Nguyên nhân
- Bảng `documents` trong Supabase ban đầu được khởi tạo với cột embedding có kích thước **768 dimensions** (hoặc 1536 trong migration gốc).
- Model **`gemini-embedding-001`** (model embedding chính thức hiện tại của Google, ra mắt 06/2025) mặc định trả về **3072 dimensions**. N8n node `Embeddings Google Gemini` không có tùy chọn `output_dimensionality` để giảm chiều.
- Model cũ `text-embedding-004` (768 dims) đã bị Google deprecated từ 08/2025 và không còn xuất hiện trong dropdown.
- Sự sai lệch dimensions giữa model output (3072) và DB schema (768) làm tiến trình insert bị từ chối.

### Giải pháp và Bài học rút ra
- **Giải pháp:** Đổi cột embedding trong Supabase sang **`vector(3072)`** để khớp với output mặc định của `gemini-embedding-001`:
  ```sql
  DROP INDEX IF EXISTS documents_embedding_idx;
  ALTER TABLE public.documents ALTER COLUMN embedding TYPE vector(3072);
  ```
  **Lưu ý:** HNSW index không hỗ trợ >2000 dimensions, nên KHÔNG tạo HNSW index. Với dataset nhỏ/vừa, sequential scan vẫn đủ nhanh. Khi data lớn, có thể dùng IVFFlat index thay thế.
- **Kinh nghiệm:**
  > 💡 Khi làm việc với Vector Database: (1) Dimensions trong DB schema phải khớp 100% với output của Embedding Model. (2) Google thường xuyên deprecate model cũ và thay bằng model mới có default dimensions khác — luôn kiểm tra docs mới nhất. (3) HNSW index giới hạn tối đa 2000 dims; nếu dùng model output >2000 dims, cần dùng IVFFlat hoặc bỏ index.

---

## Tổng kết Checklist khi Deploy n8n Workflows
1. [x] Kiểm tra các Sub-workflow đã có `executeWorkflowTrigger` chưa.
2. [x] Đảm bảo Data Input Parameters giữa Workflow cha (truyền) và Workflow con (nhận đoán) khớp biến với nhau.
3. [x] Validate lại Data Schema của Database (Supabase) so với cấu hình mặc định của các node xử lý AI / Embeddings / LLM. Dùng đúng Model Name từ list được support của n8n.
4. [x] Save & Publish thay đổi. Test Workflow bằng chức năng "Execute Workflow" thay vì test qua Production data để trace logs dễ hơn.
