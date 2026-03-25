# Phân tích & Đánh giá Hiệu năng Database Schema
**Dự án:** InsightsLM
**Migration:** `20250606152423_v0.1.sql`

Tài liệu này tổng hợp phân tích chi tiết về 8 vấn đề được phát hiện trong thiết kế schema cơ sở dữ liệu hiện tại, cũng như lý do tại sao chúng lại ảnh hưởng đến hiệu năng và độ ổn định khi dự án mở rộng (500-1000 users).

Phần 1 là giải thích chi tiết bằng tiếng Việt về tác động của các lỗi.
Phần 2 là nguyên bản báo cáo kỹ thuật ban đầu (Schema Performance Review).

---

## Phần 1: Giải thích chi tiết các vấn đề (Impact Analysis)

Các lỗi được chia theo 3 cấp độ ảnh hưởng:

### 🔴 Lỗi Nghiêm Trọng (CRITICAL) - Ảnh hưởng trực tiếp đến tốc độ
**1. Lỗi gọi hàm `auth.uid()` liên tục trong các chính sách bảo mật (RLS)**
- **Vấn đề:** Trong tất cả các bảng (notebooks, sources,...), code đang viết là `USING (auth.uid() = user_id)`.
- **Cách hoạt động sai:** Khi user query lấy 10.000 dòng dữ liệu, Postgres sẽ gọi hàm `auth.uid()` **10.000 lần** (một lần cho mỗi dòng) để kiểm tra xem dòng đó có thuộc về user không. Hàm này thực hiện rất nhiều logic parsing token bên dưới.
- **Ảnh hưởng:** Làm truy vấn chậm đi **5-10 lần**.
- **Cách sửa:** Gói nó vào truy vấn con `USING ((select auth.uid()) = user_id)`, khi đó Postgres đủ thông minh để tính toán hàm này **đúng 1 lần** cho toàn bộ 10.000 dòng.

**2. Thiếu GIN Index cho cột JSONB `metadata` trên bảng `documents`**
- **Vấn đề:** Cột `metadata` (lưu trữ `notebook_id` của tài liệu) không được đánh index (mục lục). Trong khi tính năng Vector Search (`match_documents`) và RLS liên tục sử dụng cấu trúc `documents.metadata @> filter` để lọc tài liệu.
- **Cách hoạt động sai:** Khi có tìm kiếm, thay vì lật "mục lục" ra xem tài liệu nào thỏa mãn (rất nhanh), database phải quét từ dòng đầu tới dòng cuối cùng (Full Table Scan) trong toàn bộ hàng chục ngàn tài liệu.
- **Ảnh hưởng:** Khi dữ liệu lớn, tính năng Search và tốc độ Chat sẽ cực kỳ chậm (chậm hơn 10-100 lần).
- **Cách sửa:** Đánh index chuyên dụng (`GIN index`) cho kiểu dữ liệu JSONB.

---

### 🟠 Lỗi Ưu Tiên Cao (HIGH) - Ảnh hưởng đến bảo mật và toàn vẹn dữ liệu
**3. Không ràng buộc giá trị nhập vào cho cột Trạng thái (Status)**
- **Vấn đề:** Cột `processing_status` (của sources) và `generation_status` (của notebooks) đang dùng kiểu văn bản tự do (`text`) thay vì dùng Enum hay CHECK.
- **Cách hoạt động sai:** Code có thể vô tình gõ nhầm trạng thái (ví dụ gõ `"pendnig"` thay vì `"pending"`, hoặc `"compleeted"` thay vì `"completed"`). Cơ sở dữ liệu vẫn cho phép lưu lại thành công.
- **Ảnh hưởng:** Gây lỗi logic trầm trọng cho Frontend và n8n khi chúng không nhận diện được các trạng thái gõ sai này.
- **Cách sửa:** Thêm `CHECK constraint` (quy định chỉ được phép nhập 'pending', 'processing', 'completed', 'failed').

**4. Thiếu `SET search_path = ''` trong function `is_notebook_owner`**
- **Vấn đề:** PostgreSQL có cơ chế đường dẫn tìm kiếm (`search_path`). Nếu một hàm có quyền cao (`SECURITY DEFINER`) mà không khóa chặt đường dẫn này lại.
- **Cách hoạt động sai:** Một hacker có thể tạo ra 1 object trùng tên với những hàm hệ thống trong 1 schema khác và lừa function này chạy đoạn code độc hại do chúng viết với quyền quản trị viên.
- **Ảnh hưởng:** Đây là một lỗ hổng bảo mật kinh điển trong Postgres.
- **Cách sửa:** Chỉ cần thêm `SET search_path = ''` vào khai báo function.

**5. Khóa chính (Primary Key) sử dụng UUIDv4 (Random)**
- **Vấn đề:** Sinh mã UUID ngẫu nhiên (v4) thay vì tuần tự theo thời gian (v7).
- **Ảnh hưởng:** Khi số dòng vượt mức 100K, việc chèn dữ liệu ngẫu nhiên sẽ làm phân mảnh ổ cứng ở mức vật lý (Index Fragmentation), làm giảm tốc độ thêm mới dữ liệu (INSERT). *Lỗi này chưa cần sửa ngay vì 500-1000 users chưa đủ làm hệ thống quá tải.* 

**6. Bật `REPLICA IDENTITY FULL` trên tất cả bảng Realtime**
- **Vấn đề:** Khi bật Realtime, cấu hình này yêu cầu lưu **toàn bộ content** của dòng cũ vào file log (WAL) mỗi khi có 1 thay đổi nhỏ (Update/Delete).
- **Ảnh hưởng:** Làm phình to dung lượng ổ cứng (WAL bloat) và chậm quá trình đồng bộ định kỳ.
- *(Lưu ý: Dù tốn dung lượng, nhưng cấu hình này đang là **Bắt buộc** để tính năng bảo mật RLS làm việc đúng với Subscriptions trên Supabase, nên ta đã quyết định giữ nguyên và không sửa lỗi này).*

---

### 🟡 Lỗi Cấp Trung Bình (MEDIUM) - Tối ưu hóa thêm
**7. Có thể dùng Index một phần (Partial Index)**
- **Vấn đề:** Chúng ta đang bắt database lập danh mục cho cả vài triệu file tài liệu đã xử lý xong (`status = 'completed'`).
- **Ảnh hưởng:** Gây dư thừa vì ta chỉ thường tìm lọc những file `status = 'pending'`. Làm file index nặng hơn gấp 10-20 lần mức cần thiết.
- **Cách sửa:** Chỉ đánh index cho những row có `status != 'completed'`.

**8. Tiêu chuẩn quốc tế: Dùng `identity` thay vì `serial`**
- **Vấn đề:** Bảng `n8n_chat_histories` dùng kiểu cũ `serial` để tự tăng ID (1, 2, 3..). PostgreSQL khuyến khích dùng `identity` (chuẩn quốc tế của SQL) trong các phiên bản mới hơn.
- **Ảnh hưởng:** Không có lỗi xảy ra, chỉ là viết kiểu cũ thì hơi "outdated" so với Standard SQL.

---

## Phần 2: Báo cáo Kỹ thuật Gốc (Original Schema Performance Review)

Review based on Supabase Postgres Best Practices rules.

### Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 2 | RLS perf + missing JSONB index on documents |
| 🟠 HIGH | 4 | UUID fragmentation, REPLICA IDENTITY FULL, missing status constraint, RLS helper function pattern |
| 🟡 MEDIUM | 2 | Partial index opportunity, `serial` vs `identity` |

### 🔴 CRITICAL — Fix Immediately

#### 1. RLS policies call `auth.uid()` per-row instead of caching it
**Rule**: `security-rls-performance` · Impact: **5-10× slower queries**

Every RLS policy directly compares `auth.uid() = user_id`. Postgres evaluates this function **per row**, causing severe overhead on large tables.

**Current**:
```sql
USING (auth.uid() = user_id);
```

**Fix** — wrap in a scalar subquery to evaluate once:
```sql
USING ((select auth.uid()) = user_id);
```

> [!CAUTION]
> This affects **all 16+ RLS policies** across `profiles`, `notebooks`, `sources`, `notes`, `documents`, and `n8n_chat_histories`. Every one of them should be updated.

Also applies to the `is_notebook_owner` and `is_notebook_owner_for_document` helper functions — the inner `auth.uid()` call should also be wrapped:

```diff
-- is_notebook_owner (line 167)
-AND user_id = auth.uid()
+AND user_id = (select auth.uid())

-- is_notebook_owner_for_document (line 181)
-AND user_id = auth.uid()
+AND user_id = (select auth.uid())
```

#### 2. No GIN index on `documents.metadata` for RLS and `match_documents`
**Rule**: `advanced-jsonb-indexing` · Impact: **10-100× slower JSONB queries**

The `match_documents` function uses `documents.metadata @> filter`, and every documents RLS policy calls `is_notebook_owner_for_document(metadata)` which extracts `metadata->>'notebook_id'`. Without a GIN index, this is a **full table scan** on every query.

**Fix**:
```sql
-- GIN index for containment queries (@> in match_documents)
CREATE INDEX IF NOT EXISTS idx_documents_metadata
  ON public.documents USING gin (metadata jsonb_path_ops);

-- Expression index for the RLS notebook_id extraction
CREATE INDEX IF NOT EXISTS idx_documents_notebook_id
  ON public.documents ((metadata->>'notebook_id'));
```

### 🟠 HIGH — Fix Before Scale

#### 3. UUIDv4 primary keys cause index fragmentation
**Rule**: `schema-primary-keys` · Impact: **worse insert performance, scattered B-tree pages**

Tables `notebooks`, `sources`, and `notes` use `uuid_generate_v4()` which generates **random** UUIDs, causing B-tree index fragmentation as data grows past ~100K rows.

**Fix** — switch to time-ordered UUIDv7 (requires Supabase's `pg_uuidv7` extension or Postgres 17+):
```sql
-- If pg_uuidv7 available:
CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";
-- Then use uuid_generate_v7() as default

-- Alternative: gen_random_uuid() has same problem (still v4)
-- Best alternative without extension: use bigint identity
```

> [!NOTE]
> For your scale (500-1000 users), UUIDv4 fragmentation is unlikely to cause problems in the near term. Flag for future migration.

#### 4. `REPLICA IDENTITY FULL` on all realtime tables
**Rule**: Supabase Realtime best practice · Impact: **WAL bloat, slower replication**

Lines 418-421 set `REPLICA IDENTITY FULL` on `notebooks`, `sources`, `notes`, and `n8n_chat_histories`. This writes the **entire row** to WAL on every UPDATE/DELETE, dramatically increasing WAL size.

**Fix** — use `DEFAULT` (primary key only) where possible. Only use `FULL` if you need old column values in realtime subscriptions:
```sql
-- Only set FULL if the frontend subscribes to specific column changes
-- Otherwise, DEFAULT is sufficient and much lighter on WAL
ALTER TABLE public.notebooks REPLICA IDENTITY DEFAULT;
```

> [!IMPORTANT]
> Supabase Realtime **requires** `REPLICA IDENTITY FULL` to detect row changes on non-PK columns for `postgres_changes` subscriptions. Only remove it if you don't filter realtime events by column values.

#### 5. `processing_status` and `generation_status` use unconstrained `text`
**Rule**: `schema-data-types` · Impact: **data integrity risk**

`sources.processing_status` and `notebooks.generation_status` are free-text columns with no `CHECK` constraint or enum type. Any typo (`"pendnig"`, `"compleeted"`) silently succeeds.

**Fix** — add CHECK constraints or use enums:
```sql
-- Option 1: CHECK constraint
ALTER TABLE public.sources
  ADD CONSTRAINT chk_sources_processing_status
  CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'));

-- Option 2: Create an enum (like you did for source_type)
CREATE TYPE processing_status_type AS ENUM ('pending', 'processing', 'completed', 'failed');
```

#### 6. `is_notebook_owner` helper function missing `search_path`
**Rule**: `security-rls-performance` · Impact: **potential security issue**

`is_notebook_owner` is `SECURITY DEFINER` but does **not** set `search_path = ''`. Compare with `handle_new_user` which correctly sets it. If `search_path` is not pinned, a malicious user could exploit schema search order.

**Fix**:
```diff
 CREATE OR REPLACE FUNCTION public.is_notebook_owner(notebook_id_param uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
+SET search_path = ''
 AS $$
```

### 🟡 MEDIUM — Optimize When Convenient

#### 7. Partial index opportunity on `sources.processing_status`
**Rule**: `query-partial-indexes` · Impact: **5-20× smaller index**

The existing full index `idx_sources_processing_status` includes all rows. If you typically query for non-completed sources (e.g., pending/processing), a partial index is more efficient:

```sql
-- Replace full index with partial for active processing
CREATE INDEX IF NOT EXISTS idx_sources_active_processing
  ON public.sources(processing_status)
  WHERE processing_status != 'completed';
```

#### 8. `n8n_chat_histories.id` uses `serial` instead of `identity`
**Rule**: `schema-primary-keys` · Impact: **minor, SQL-standard compliance**

Line 28 uses `id serial` which works but `identity` is the SQL-standard replacement recommended for new schemas:

```sql
-- Current
id serial not null

-- Recommended
id bigint generated always as identity primary key
```
