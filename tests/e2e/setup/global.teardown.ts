import { FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

async function globalTeardown(config: FullConfig) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const e2eUserId = process.env.E2E_TEST_USER_ID;

  if (!supabaseUrl || !serviceRoleKey || !e2eUserId) {
    console.log('[Teardown] Bỏ qua dọn dẹp do không tìm thấy thông tin xác thực E2E User ID.');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('[Teardown] Đang bắt đầu dọn rác (Garbage Collection)...');

  // 1. Lấy tất cả các Notebook mà User này tạo ra
  const { data: notebooks } = await supabase
    .from('notebooks')
    .select('id')
    .eq('user_id', e2eUserId);

  if (notebooks && notebooks.length > 0) {
    console.log(`[Teardown] Phát hiện ${notebooks.length} notebooks. Đang xóa dữ liệu...`);
    const notebookIds = notebooks.map(n => n.id);

    // 2. Lấy danh sách Document liên kết và Xóa File trên Storage Bucket
    const { data: documents } = await supabase
      .from('documents')
      .select('file_path')
      .in('notebook_id', notebookIds)
      .not('file_path', 'is', null);

    if (documents && documents.length > 0) {
      const filePaths = documents.map(d => d.file_path).filter(Boolean) as string[];
      if (filePaths.length > 0) {
        await supabase.storage.from('documents').remove(filePaths);
        console.log(`[Teardown] Đã xóa ${filePaths.length} file vật lý trên Storage.`);
      }
    }

    // Xoá Database Records (Sẽ cascade xóa members, chat, audio, sources...)
    await supabase.from('notebooks').delete().in('id', notebookIds);
  }

  // 3. Xoá vĩnh viễn User khỏi hệ thống
  await supabase.auth.admin.deleteUser(e2eUserId);
  console.log('[Teardown] Xóa thành công User test mô phỏng hoàn tất toàn bộ quy trình.');
}

export default globalTeardown;
