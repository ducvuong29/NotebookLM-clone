import { FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

async function globalSetup(config: FullConfig) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Bạn cần phải cung cấp VITE_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong file .env');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const testEmail = 'e2e-tester@example.com';
  const testPassword = 'E2E-Password-123!!';
  
  console.log('[Setup] Đang tạo tài khoản E2E ảo...');

  // Xóa user cũ nếu test trước đó chạy lỗi và chưa kịp dọn rác
  const { data: usersData } = await supabase.auth.admin.listUsers();
  if (usersData?.users) {
    const existingUser = usersData.users.find((u: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => u.email === testEmail);
    if (existingUser) {
      await supabase.auth.admin.deleteUser(existingUser.id).catch(() => {});
    }
  }

  // Tự động sinh User lách OTP qua quyền Admin
  const { data: userData, error: createError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Tester' }
  });

  if (createError) throw new Error(`[Setup] Lỗi tạo user: ${createError.message}`);

  // Đăng nhập API bằng mật khẩu vừa gán để lấy Token (Session)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
    email: testEmail, 
    password: testPassword 
  });

  if (authError || !authData.session) {
    throw new Error(`[Setup] Lỗi lấy session: ${authError?.message}`);
  }

  // Lấy Project Reference ID từ URL (VD: "https://xyz.supabase.co" -> "xyz")
  const urlParts = new URL(supabaseUrl).hostname.split('.');
  const projectRef = urlParts[0]; 
  const storageKey = `sb-${projectRef}-auth-token`;

  // Ép thông tin Session JWT vào định dạng LocalStorage cho Playwright
  const state = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:8082',
        localStorage: [
          {
            name: storageKey,
            value: JSON.stringify(authData.session)
          }
        ]
      }
    ]
  };

  const authDir = path.join(process.cwd(), 'playwright', '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(authDir, 'user.json'), JSON.stringify(state));
  console.log('[Setup] Đã inject Session vào Playwright thành công!');

  // Export User ID sang Envrionment Variable để global.teardown.ts biết đường đi dọn dẹp
  process.env.E2E_TEST_USER_ID = userData.user.id;
}

export default globalSetup;
