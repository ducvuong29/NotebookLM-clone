# Hướng Dẫn Cơ Bản Về n8n: Cú Pháp, Hoạt Động Cốt Lõi Và Ứng Dụng

Tài liệu này cung cấp cho người mới bắt đầu lập trình hoặc mới làm quen với tự động hóa một cái nhìn tổng thể về **n8n**, giải thích chi tiết cơ chế hoạt động, các cú pháp thường gặp, ưu / nhược điểm và ứng dụng thực tế.

---

## 1. n8n Là Gì & Cơ Chế Hoạt Động Cơ Bản

**n8n** (phát âm là `n-eight-n`) là một công cụ tự động hóa quy trình làm việc (workflow automation) mã nguồn mở tuỳ chỉnh hoặc cài đặt cấu hình nguồn (fair-code) có thể tự host. Giống như Zapier hay Make, n8n giúp bạn kết nối các ứng dụng khác nhau qua các API. Tuy nhiên, nó mạnh mẽ hơn nhờ khả năng tiếp cận sâu về mặt code (code-level control).

### Các Khái Niệm Quan Trọng (Core Concepts)

- **Workflow (Quy trình làm việc):** Một biểu đồ tuần tự bao gồm các bước tự động hóa. Khi được kích hoạt, workflow sẽ chạy từ đầu đền cuối.
- **Node (Nút bấm):** Mọi thao tác trong n8n đều được đóng gói thành các node. Mỗi Node nhận dữ liệu đầu vào (Input), thực hiện một nhiệm vụ (VD: Gửi HTTP Request, Thao tác Google Sheets, hay Query DB), sau đó chuyển dữ liệu đó ra (Output). 
- **Trigger Node (Nút kích hoạt):** Là nút đầu tiên khởi động mọi Workflow. Có thể là **Webhook** (Chờ request gửi từ một ứng dụng bên ngoài như Supabase / Edge Functions tới để kích hoạt), Time Trigger (Scheduler - chạy lịch định kỳ), hoặc Trigger từ các ứng dụng (như khi có dòng dữ liệu mới trong Google Sheets).
- **Data flow (Luồng Dữ Liệu):** Dữ liệu truyền giữa các node bao giờ cũng ở dưới định dạng **Mảng các đối tượng JSON** (Array of JSON Objects). Input của node đằng sau luôn nhận toàn bộ Output từ node liền trước.

---

## 2. Cú Pháp Cơ Bản Và Logic Trong n8n

n8n sử dụng hệ thống gọi là **Expressions** - cho phép nhúng mã JavaScript chuẩn vào các field cấu hình bên trong mỗi Node.

Cú pháp Expressions luôn bắt đầu và kết thúc bằng `{{` và `}}`. 
Bên trong dấu ngoặc kép này là đối tượng (Object) JSON chứa toàn bộ dữ liệu đang có.

### 2.1 Truy Xuất Dữ Liệu Của Node Hiện Tại
n8n lưu trữ toàn bộ dữ liệu truyền từ node trước dưới dạng một đối tượng tên là `$json`.

Ví dụ payload node trước phát ra:
```json
[
  {
    "body": {
      "content": "Đây là văn bản",
      "sourceType": "website"
    }
  }
]
```
Thì bên trong Node hiện tại:
- Bằng cách gõ `{{ $json.body.content }}` bạn sẽ lấy được text "Đây là văn bản".
- Bằng cách gõ `{{ $json.body.sourceType }}` bạn sẽ lấy được text "website".

### 2.2 Xin Dữ Liệu Tử Một Node Đã Chạy Xong Phía Trước
Đôi khi, bạn đang ở Node số 4 và muốn lấy dữ liệu ở Node số 1 (do đặc tính Node 3 Output ra đã biến đổi hoàn toàn và làm mất Input của Node 1). Bạn sẽ dùng cú pháp `$('<Tên Node>')`.

- `{{ $('Webhook').item.json.body.filePath }}` : Lấy `filePath` nằm trong node có tên là "Webhook". `item` đảm bảo là nó ánh xạ đúng tới phần tử JSON hiện tại.
- `{{ $('Set Data').first().json.content }}` : Lấy giá trị phần tử JSON đầu tiên của Node mang tên "Set Data".

### 2.3 Các Biến Môi Trường (Built-in Variables) Và Hàm Thường Dùng
- `{{ $now }}`: Ngày giờ hiện hành. (Thường hay gọi dưới dạng format Text ISO bằng `$now.toISO()`).
- `{{ $execution.id }}`: Mã nhận dạng lần chạy luồng này (dành cho mục đích log, debug).
- Có thể dùng thẳng các hàm trong JavaScript Native (VD: Split, Upper/Lower, String methods,...):
  - `{{ $json.ten.toUpperCase() }}` -> Biến chữ thường thành HOA
  - `{{ $json.url.split('?')[0] }}` -> Format lại url không chứa ID đằng sau.

### 2.4 Node "Code" (Nâng Cao)
Khi muốn viết hẳn 1 kịch bản code JavaScript (hoặc Python) phức tạp:
```javascript
// Biến $input đại diện cho dữ liệu đầu vào.
// Lặp qua toàn bộ Item truyền tới
for (const item of $input.all()) {
  // Thay đổi JSON trực tiếp
  item.json.myNewField = item.json.oldField + " - đã chỉnh sửa";
}
// Trả về luồng để gửi mảng này sang node kế tiếp
return $input.all();
```

---

## 3. Ứng Dụng Thực Tế Của n8n (Use Cases)

n8n xử lý được từ các Data Pipeline rất rộng và phức tạp, áp dụng chủ yếu:

1. **Xây Dựng Các "AI Agent" Hoặc "RAG Pipelines" (Như dự án hiện tại):**
   - Sự kết hợp giữa **n8n Advanced AI (LangChain)** tạo ra chuỗi AI workflow. Nhận dữ liệu text -> RAG Vectorization (Chia nhỏ dữ liệu thành vector) -> Quăng vào Vector DataBase (Supabase pgvector) -> Và giao tiếp gọi hỏi (LLM Chain).
2. **Serverless APIs / Webhooks Của Một Backend Nhỏ:**
   - Dùng n8n thiết lập "Webhook Node" đóng vai trò như các `Routes / APIs Endpoint`, nhận Client Fetch Payload thay vì tự tay gõ Server bằng Node.js / Express.
3. **Data Sync (ETL Pipelines - Đồng Bộ Hóa Data):**
   - Extract-Transform-Load (ETL). Đọc từ CRM/Shopify, làm sạch Text / Filter logic, cuối cùng lưu trữ kết quả thống nhất vào SQL DB như Postgres hoặc Supabase.
4. **DevOps & IT Automation:**
   - Thông báo lỗi server qua Slack, hay cập nhật Tasks lên bộ Jira/Trello/Linear.

---

## 4. Điểm Mạnh Và Điểm Yếu

### Điểm Mạnh (Strengths)
- **Truy Cập Được Mức Code (Code-level Control):** Cho phép bạn tự do code bất cứ khi kéo thả UI GUI của Node không đáp ứng đủ bằng cả JS và Python. Cực kỳ mạnh mẽ đối với lập trình viên (Developer-Friendly).
- **Tự Host Độc Lập / Chi Phí Thấp (Self-Hosted):** Bạn có thể dựng n8n bằng Docker Image hoặc NPM lên con Server riêng của bạn hoàn toàn miễn phí. Hạn chế tính theo "Số tài nguyên của Server của bạn", không tính theo "Mỗi một Action là đóng tiền" như Zapier.
- **Support Nhánh Logic Đồ Sộ & AI Sâu Rộng:** Cho phép tự do phân luồng nhanh nhờ Switch Node, If Node, Merge. Hơn hết n8n là Tool dẫn đầu về hệ sinh thái kết nối tích hợp Node đồ sộ của LangChain.

### Điểm Yếu (Weaknesses)
- **Đường Cong Học Tập Góc Bẹt Hơn (Steeper Learning curve):** Người dùng hệ non-tech (Marketing, QA...) ít kiến thức về JSON / String Array / Loop sẽ cực kì đau đầu vật vã với nó so với một cái kéo thả mù mờ của Zapier.
- **Có Khả Năng Crash Hệ Thống (Resource Hungry):** Nếu Data Flow bắn vào 1 cục JSON Array nặng với vòng lặp lớn (Ví dụ: Process bảng Excel triệu rows), RAM / CPU có thể giật và gây đứng tiến trình trên con VPS Self-Hosted. Sẽ cần config lại kiến trúc chạy Workers (Queue mode).
- **Thiếu Ổn Định Đôi Khi & Phụ Thuộc Update:** Bản Open Source khá liên tục ra updates và sửa các API 3rd-party (Slack, Fb, vân vân). Thỉnh thoảng các phiên bản update lớn tự làm hỏng phiên bản cũ (Breaking Changes Workflow).
