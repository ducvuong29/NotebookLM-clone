import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// CORS Headers — shared across all responses
// ============================================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// Response Helpers — Unified API response format
// ============================================================================

interface ErrorResponseBody {
  error: true
  code: string
  message: string
}

interface SuccessResponseBody<T = unknown> {
  data: T
}

function errorResponse(status: number, code: string, message: string): Response {
  const body: ErrorResponseBody = { error: true, code, message }
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function successResponse<T>(data: T): Response {
  const body: SuccessResponseBody<T> = { data }
  return new Response(
    JSON.stringify(body),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// Action Handlers
// ============================================================================

interface PingResponse {
  status: string
  role: string
}

function handlePing(): Response {
  return successResponse<PingResponse>({ status: 'ok', role: 'admin' })
}

interface CreateUserRequest {
  email: string
  full_name: string
}

interface CreateUserResponseData {
  user_id: string
  email: string
  full_name: string
}

async function handleCreateUser(
  body: { email?: string; full_name?: string },
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { email, full_name } = body as CreateUserRequest

  if (!email || !full_name) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  // Basic email format check (server-side defense-in-depth)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return errorResponse(400, 'INVALID_EMAIL', 'Email không hợp lệ')
  }

  // Create auth user — Supabase sends invite email automatically
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (authError) {
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      return errorResponse(409, 'USER_EXISTS', 'Email đã tồn tại trong hệ thống')
    }
    console.error('[admin-api] createUser error:', authError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Không thể tạo tài khoản')
  }

  // Update profile with full_name (handle_new_user trigger auto-creates profile row)
  if (authData.user) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ full_name })
      .eq('id', authData.user.id)

    if (profileError) {
      console.warn('[admin-api] Profile update warning (non-fatal):', profileError)
    }
  }

  console.log('[admin-api] User created successfully:', { email, userId: authData.user?.id })

  return successResponse<CreateUserResponseData>({
    user_id: authData.user?.id ?? '',
    email,
    full_name,
  })
}

// ============================================================================
// list_users — Paginated user list merging auth + profiles
// ============================================================================

interface ListUsersResponseItem {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
  last_sign_in_at: string | null
  is_disabled: boolean
}

interface ListUsersResponseData {
  users: ListUsersResponseItem[]
  total: number
}

async function handleListUsers(
  body: { page?: number; perPage?: number; search?: string },
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const page = body.page ?? 1
  const perPage = Math.min(body.perPage ?? 25, 100)
  const search = body.search?.trim() ?? ''

  // Fetch auth users — includes banned_until, last_sign_in_at
  const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage,
  })

  if (authError) {
    console.error('[admin-api] listUsers error:', authError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Không thể tải danh sách')
  }

  // Fetch profiles for full_name, role
  const userIds = authResult.users.map((u: { id: string }) => u.id)
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role')
    .in('id', userIds)

  const profileMap = new Map<string, { full_name: string | null; role: string }>(
    (profiles ?? []).map((p: { id: string; full_name: string | null; role: string }) => [p.id, p])
  )

  // Merge auth + profile data
  let mergedUsers: ListUsersResponseItem[] = authResult.users.map(
    (authUser: {
      id: string
      email?: string
      created_at: string
      last_sign_in_at?: string
      banned_until?: string
      user_metadata?: { full_name?: string }
    }) => {
      const profile = profileMap.get(authUser.id)
      return {
        id: authUser.id,
        email: authUser.email ?? '',
        full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? null,
        role: profile?.role ?? 'user',
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        is_disabled: !!authUser.banned_until,
      }
    }
  )

  // Server-side search filter (auth.admin.listUsers doesn't support search)
  if (search) {
    const lower = search.toLowerCase()
    mergedUsers = mergedUsers.filter(
      (u) =>
        u.email.toLowerCase().includes(lower) ||
        (u.full_name?.toLowerCase().includes(lower) ?? false)
    )
  }

  console.log('[admin-api] listUsers:', { page, perPage, search, count: mergedUsers.length })

  return successResponse<ListUsersResponseData>({
    users: mergedUsers,
    total: mergedUsers.length,
  })
}

// ============================================================================
// toggle_user_status — Ban/unban user via Auth Admin API
// ============================================================================

interface ToggleUserStatusResponseData {
  user_id: string
  enabled: boolean
}

async function handleToggleUserStatus(
  body: { user_id?: string; enabled?: boolean },
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { user_id, enabled } = body

  if (!user_id || typeof enabled !== 'boolean') {
    return errorResponse(400, 'INVALID_INPUT', 'Thiếu thông tin người dùng')
  }

  // ban_duration: 'none' to unban, '876000h' (~100 years) to effectively ban
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    user_id,
    { ban_duration: enabled ? 'none' : '876000h' }
  )

  if (updateError) {
    if (updateError.message?.includes('not found')) {
      return errorResponse(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng')
    }
    console.error('[admin-api] toggleUserStatus error:', updateError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Không thể cập nhật trạng thái')
  }

  console.log('[admin-api] User status toggled:', { user_id, enabled })

  return successResponse<ToggleUserStatusResponseData>({ user_id, enabled })
}

// ============================================================================
// bulk_create_users — Insert multiple users sequentially
// ============================================================================

interface BulkCreateUserRequest {
  users: Array<{ email: string; full_name?: string }>;
}

interface BulkCreateUserResponseData {
  success_count: number;
  failed_count: number;
  total: number;
  failed: Array<{ email: string; reason: string }>;
}

async function handleBulkCreateUsers(
  body: BulkCreateUserRequest,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { users } = body;

  if (!Array.isArray(users) || users.length === 0) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng cung cấp danh sách người dùng cần tạo');
  }

  if (users.length > 100) {
    return errorResponse(400, 'PAYLOAD_TOO_LARGE', 'Chỉ hỗ trợ tối đa 100 người dùng mỗi lượt');
  }

  const failed: Array<{ email: string; reason: string }> = [];
  let success_count = 0;

  for (const user of users) {
    const { email, full_name } = user;
    if (!email) {
      failed.push({ email: 'unknown', reason: 'Email trống' });
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      failed.push({ email, reason: 'Email không hợp lệ' });
      continue;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? email.split('@')[0] },
    });

    if (authError) {
      if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
        failed.push({ email, reason: 'Email đã tồn tại' });
      } else {
        console.error(`[admin-api] bulk createUser error for ${email}:`, authError);
        failed.push({ email, reason: 'Lỗi hệ thống khi tạo tài khoản' });
      }
      continue;
    }

    if (authData.user && full_name) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name })
        .eq('id', authData.user.id);

      if (profileError) {
        console.warn(`[admin-api] Profile bulk update warning for ${email}:`, profileError);
      }
    }
    success_count++;
  }

  console.log('[admin-api] Bulk Users created:', { success: success_count, failed: failed.length });

  return successResponse<BulkCreateUserResponseData>({
    success_count,
    failed_count: failed.length,
    total: users.length,
    failed,
  });
}

// ============================================================================
// create_public_notebook — Admin only notebook creation
// ============================================================================

interface CreatePublicNotebookResponseData {
  notebook_id: string
}

async function handleCreatePublicNotebook(
  body: { title?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<Response> {
  const { title } = body

  if (!title || title.trim() === '') {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập tên notebook')
  }

  const { data, error } = await supabaseAdmin
    .from('notebooks')
    .insert({
      title: title.trim(),
      user_id: userId,
      visibility: 'public'
    })
    .select('id')
    .single()

  if (error) {
    console.error('[admin-api] createPublicNotebook error:', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Không thể tạo public notebook')
  }

  console.log('[admin-api] Public notebook created:', { notebook_id: data.id, user_id: userId })

  return successResponse<CreatePublicNotebookResponseData>({
    notebook_id: data.id
  })
}

// ============================================================================
// delete_public_notebook — Admin only notebook deletion
// ============================================================================

interface DeletePublicNotebookResponseData {
  success: boolean
}

async function handleDeletePublicNotebook(
  body: { notebook_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { notebook_id } = body

  if (!notebook_id) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng cung cấp ID của notebook')
  }

  // 1. Verify notebook exists and is public
  const { data: notebook, error: fetchError } = await supabaseAdmin
    .from('notebooks')
    .select('id, visibility')
    .eq('id', notebook_id)
    .single()

  if (fetchError || !notebook) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy notebook')
  }

  if (notebook.visibility !== 'public') {
    return errorResponse(403, 'FORBIDDEN', 'Chỉ có thể xoá public notebook qua API này')
  }

  // 2. Fetch sources to delete files from storage
  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from('sources')
    .select('file_path')
    .eq('notebook_id', notebook_id)

  if (sourcesError) {
    console.error('[admin-api] Error fetching sources for deletion:', sourcesError)
    // Continue anyway to try and delete the DB record
  }

  const filesToDelete = sources?.filter((s: { file_path: string | null }) => s.file_path).map((s: { file_path: string | null }) => s.file_path) || []
  if (filesToDelete.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage
      .from('sources')
      .remove(filesToDelete)

    if (storageError) {
      console.error('[admin-api] Error deleting files from storage:', storageError)
    }
  }

  // 3. Delete notebook (cascades to sources and documents)
  const { error: deleteError } = await supabaseAdmin
    .from('notebooks')
    .delete()
    .eq('id', notebook_id)

  if (deleteError) {
    console.error('[admin-api] Error deleting notebook:', deleteError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Không xoá được notebook')
  }

  console.log('[admin-api] Public notebook deleted:', { notebook_id })

  return successResponse<DeletePublicNotebookResponseData>({
    success: true
  })
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ============ 1. AUTHORIZATION CHECK ============
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập')
    }

    // Verify user identity using their JWT
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
    if (userError || !user) {
      console.error('[admin-api] Auth error:', userError)
      return errorResponse(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn')
    }

    console.log('[admin-api] Authenticated user:', user.id)

    // ============ 2. ADMIN GUARD ============
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[admin-api] Profile lookup error:', profileError)
      return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền truy cập')
    }

    if (profile.role !== 'admin') {
      console.warn('[admin-api] Non-admin access attempt:', { userId: user.id, role: profile.role })
      return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền truy cập')
    }

    console.log('[admin-api] Admin access granted:', user.id)

    // ============ 3. PARSE ACTION ============
    const body = await req.json()
    const { action } = body as { action: string }

    if (!action) {
      return errorResponse(400, 'INVALID_ACTION', 'Hành động không hợp lệ')
    }

    // ============ 4. ACTION DISPATCH ============
    switch (action) {
      case 'ping':
        return handlePing()

      case 'create_user':
        return await handleCreateUser(body, supabaseAdmin)

      case 'list_users':
        return await handleListUsers(body, supabaseAdmin)

      case 'toggle_user_status':
        return await handleToggleUserStatus(body, supabaseAdmin)

      case 'bulk_create_users':
        return await handleBulkCreateUsers(body as unknown as BulkCreateUserRequest, supabaseAdmin)

      case 'create_public_notebook':
        return await handleCreatePublicNotebook(body, supabaseAdmin, user.id)

      case 'delete_public_notebook':
        return await handleDeletePublicNotebook(body, supabaseAdmin)

      default:
        return errorResponse(400, 'INVALID_ACTION', 'Hành động không hợp lệ')
    }

  } catch (error) {
    console.error('[admin-api] Unhandled error:', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }
})
