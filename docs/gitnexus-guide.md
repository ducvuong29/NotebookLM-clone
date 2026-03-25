# Hướng dẫn chi tiết sử dụng GitNexus cho dự án NotebookLM-clone

GitNexus là một công cụ Code Intelligence giúp lập chỉ mục toàn bộ dự án dưới dạng Knowledge Graph. Điều này cho phép bạn dễ dàng truy vấn luồng thực thi (execution flows), phân tích mức độ ảnh hưởng (impact analysis) khi sửa code, và đổi tên biến/hàm an toàn trên nhiều file.

Dưới đây là cách ứng dụng GitNexus cụ thể trong dự án NotebookLM-clone của bạn, kết hợp với các công cụ MCP (Model Context Protocol).

---

## 1. Các bước cần làm TRƯỚC VÀ SAU KHI code

Vì dự án đã được lập chỉ mục bởi GitNexus (6845 symbols, 8077 relationships), bạn cần tuân thủ quy trình sau để đảm bảo an toàn:

### Trước khi sửa một hàm/lớp (Impact Analysis)
**Bắt buộc** phải chạy phân tích mức độ ảnh hưởng (blast radius) trước khi thay đổi bất kỳ code nào:
```javascript
// Sử dụng công cụ MCP mcp_gitnexus_impact
gitnexus_impact({ target: "tên_hàm_cần_sửa", direction: "upstream" })
```
- **Ví dụ**: Nếu bạn muốn đổi chiều dài của vector `embedding` từ 3072 xuống 1536 như vừa rồi, bạn có thể kiểm tra xem đoạn code nào gọi đến schema lưu trữ db:
  ```javascript
  gitnexus_impact({ target: "upsert_document", direction: "upstream" })
  ```
- Ý nghĩa các mức độ ảnh hưởng:
  - **d=1**: WILL BREAK — Các file gọi trực tiếp. Chắc chắn phải sửa theo.
  - **d=2**: LIKELY AFFECTED — Ảnh hưởng gián tiếp, cần chạy test.
  - **d=3**: MAY NEED TESTING — Ảnh hưởng xa.

### Trước khi Commit Code (Detect Changes)
Kiểm tra xem các thay đổi của bạn ảnh hưởng tới những luồng thực thi (execution flows) nào:
```javascript
gitnexus_detect_changes({ scope: "staged" })
```

### Sau khi Commit hoặc Pull code mới (Update Index)
Để GitNexus luôn hiểu đúng cấu trúc code mới nhất, bạn cần chạy lại lệnh analyze trong terminal:
```bash
npx gitnexus analyze --embeddings
```
*(Nếu muốn giữ lại các vector embeddings đã tạo, nhớ thêm `--embeddings`)*.

---

## 2. Tìm kiếm và Khám phá Codebasis

Thông thường, khi debug hoặc thêm tính năng mới, thay vì dùng `grep` hay tìm kiếm văn bản đơn thuần, bạn nên dùng luồng đồ thị của GitNexus:

### Tìm theo ngữ cảnh (Context Search)
Bạn muốn biết một luồng tính năng hoạt động ra sao (Ví dụ: "quá trình tạo RAG podcast"):
```javascript
gitnexus_query({ query: "podcast generation process" })
```
Lệnh này sẽ phân cụm và trả về chính xác luồng chạy (gọi từ Frontend -> API -> n8n -> Supabase).

### Xem chi tiết 360 độ của một hàm (Context)
Nếu bạn nghi ngờ một hàm `upload_document` đang bị lỗi:
```javascript
gitnexus_context({ name: "upload_document" })
```
Kết quả trả về sẽ liệt kê:
- **Incoming calls**: Ai đang gọi hàm này.
- **Outgoing calls**: Hàm này gọi đi đâu (ví dụ gọi Supabase API).
- **Processes**: Hàm này thuộc luồng nào (vd: Luồng "Thêm tài liệu mới" ở bước 2).

---

## 3. Refactor Code An Toàn

Nếu bạn muốn đổi tên một hàm hay biến (ví dụ đổi `generatePodcast` thành `createAudioSummary`), KHÔNG dùng `Find & Replace` của IDE. Hãy dùng GitNexus để nó cập nhật đúng qua cây đồ thị gọi hàm:

1. **Chạy thử để xem trước các thay đổi (Dry run)**:
   ```javascript
   gitnexus_rename({ symbol_name: "generatePodcast", new_name: "createAudioSummary", dry_run: true })
   ```
   Xem lại các file bị ảnh hưởng. Nếu kết quả báo `text_search` thì cần kiểm tra kỹ bằng mắt vì độ tin cậy thấp, `graph` thì hoàn toàn tin cậy.

2. **Áp dụng đổi tên**:
   ```javascript
   gitnexus_rename({ symbol_name: "generatePodcast", new_name: "createAudioSummary", dry_run: false })
   ```

---

## 4. Tóm tắt các công cụ GitNexus MCP hiện có để gọi cho AI

Khi yêu cầu AI (như tôi) làm việc với code của bạn, hãy bảo tôi sử dụng các công cụ này:

| Công cụ MCP | Khi nào nên dùng? | Command mẫu cho AI |
|---|---|---|
| `mcp_gitnexus_query` | Tìm code qua concept, debug lỗi | `Tìm cho tôi luồng code xử lý lỗi "Model output doesn't fit required format" bằng gitnexus_query` |
| `mcp_gitnexus_context` | Hiểu rõ 1 hàm: ai gọi nó, nó gọi ai | `Phân tích hàm "upsert_vector" bằng gitnexus_context` |
| `mcp_gitnexus_impact` | Đánh giá rủi ro trước khi sửa / xóa code | `Kiểm tra impact của "validateApiKey" theo hướng upstream` |
| `mcp_gitnexus_detect_changes` | Kiểm tra trước khi commit | `Chạy detect_changes cho các file đang staged` |
| `mcp_gitnexus_rename` | Đổi tên biến/hàm an toàn trên nhiều file | `Dùng gitnexus_rename để đổi "oldFunc" thành "newFunc"` |

***Lưu ý:** Hiện tại MCP GitNexus chưa được liên kết với hệ thống của tôi (tôi chưa thể tự động gọi các hàm mcp_... trên). Bạn cần cấu hình tool GitNexus trong IDE (như hướng dẫn ở phản hồi trước) trước khi yêu cầu tôi tự động gọi nó.*
