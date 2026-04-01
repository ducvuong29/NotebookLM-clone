import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from '../_shared/cors.ts'

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

function errorResponse(req: Request, status: number, code: string, message: string): Response {
  const body: ErrorResponseBody = { error: true, code, message }
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  )
}

function successResponse<T>(req: Request, data: T): Response {
  const body: SuccessResponseBody<T> = { data }
  return new Response(
    JSON.stringify(body),
    { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// Action Handlers
// ============================================================================

interface PingResponse {
  status: string
  role: string
}

function handlePing(req: Request): Response {
  return successResponse<PingResponse>(req, { status: 'ok', role: 'admin' })
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
  req: Request,
  body: { email?: string; full_name?: string },
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { email, full_name } = body as CreateUserRequest

  if (!email || !full_name) {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  // Basic email format check (server-side defense-in-depth)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return errorResponse(req, 400, 'INVALID_EMAIL', 'Email không hợp lệ')
  }

  // Create auth user — Supabase sends invite email automatically
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (authError) {
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      return errorResponse(req, 409, 'USER_EXISTS', 'Email đã tồn tại trong hệ thống')
    }
    console.error('[admin-api] createUser error:', authError)
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Không thể tạo tài khoản')
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


  return successResponse<CreateUserResponseData>(req, {
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
  req: Request,
  body: { page?: number; perPage?: number; search?: string },
  supabaseAuth: ReturnType<typeof createClient>
): Promise<Response> {
  const page = body.page ?? 1
  const perPage = Math.min(body.perPage ?? 25, 100)
  const search = body.search?.trim() ?? ''

  // PERF-002: Single RPC call replaces 2-query merge + client-side filter
  // Uses supabaseAuth (JWT client) so RPC's SECURITY DEFINER admin check works
  // (auth.uid() resolves to the admin user → role check passes)
  // Fixes: search across ALL users (not just current page), accurate total count
  const { data, error: rpcError } = await supabaseAuth.rpc('get_admin_users', {
    page_num: page,
    page_size: perPage,
    search_query: search,
  })

  if (rpcError) {
    console.error('[admin-api] get_admin_users RPC error:', rpcError)
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Không thể tải danh sách')
  }

  // Window function count(*) OVER() returns total in every row
  const total = data?.[0]?.total_count ?? 0
  const users: ListUsersResponseItem[] = (data ?? []).map(
    (u: {
      id: string
      email: string
      full_name: string | null
      role: string
      created_at: string
      last_sign_in_at: string | null
      is_disabled: boolean
    }) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role ?? 'user',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      is_disabled: u.is_disabled,
    })
  )


  return successResponse<ListUsersResponseData>(req, {
    users,
    total: Number(total),
  })
}

// ============================================================================
// delete_user — Permanently delete user and all associated data
// ============================================================================

interface DeleteUserResponseData {
  user_id: string
  deleted: boolean
}

async function handleDeleteUser(
  req: Request,
  body: { user_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  currentAdminId: string
): Promise<Response> {
  const { user_id } = body

  if (!user_id) {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Thiếu thông tin người dùng')
  }

  // Self-deletion guard — admin cannot delete themselves
  if (user_id === currentAdminId) {
    return errorResponse(req, 403, 'FORBIDDEN', 'Không thể xóa tài khoản của chính mình')
  }

  // Check if user exists and what role they have
  const { data: targetProfile, error: profileFetchError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', user_id)
    .single()

  if (profileFetchError || !targetProfile) {
    return errorResponse(req, 404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng')
  }

  // Block deletion of admin accounts
  if (targetProfile.role === 'admin') {
    return errorResponse(req, 403, 'FORBIDDEN', 'Không thể xóa tài khoản admin')
  }

  // Clean up storage files for all notebooks owned by this user
  const { data: userNotebooks } = await supabaseAdmin
    .from('notebooks')
    .select('id')
    .eq('user_id', user_id)

  if (userNotebooks && userNotebooks.length > 0) {
    for (const notebook of userNotebooks) {
      // Delete source files from storage
      const { data: sources } = await supabaseAdmin
        .from('sources')
        .select('file_path')
        .eq('notebook_id', notebook.id)

      const filesToDelete = sources
        ?.filter((s: { file_path: string | null }) => s.file_path)
        .map((s: { file_path: string | null }) => s.file_path) || []

      if (filesToDelete.length > 0) {
        await supabaseAdmin.storage.from('sources').remove(filesToDelete)
      }

      // Delete audio files from storage
      const { data: audioFiles } = await supabaseAdmin.storage
        .from('audio')
        .list(notebook.id)

      if (audioFiles && audioFiles.length > 0) {
        const audioPaths = audioFiles.map((f: { name: string }) => `${notebook.id}/${f.name}`)
        await supabaseAdmin.storage.from('audio').remove(audioPaths)
      }
    }
  }

  // Delete auth user — cascades to profiles → notebooks → sources/notes/documents
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)

  if (deleteError) {
    if (deleteError.message?.includes('not found')) {
      return errorResponse(req, 404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng')
    }
    console.error('[admin-api] deleteUser error:', deleteError)
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Không thể xóa tài khoản')
  }

  return successResponse<DeleteUserResponseData>(req, { user_id, deleted: true })
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
  req: Request,
  body: BulkCreateUserRequest,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { users } = body;

  if (!Array.isArray(users) || users.length === 0) {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Vui lòng cung cấp danh sách người dùng cần tạo');
  }

  if (users.length > 100) {
    return errorResponse(req, 400, 'PAYLOAD_TOO_LARGE', 'Chỉ hỗ trợ tối đa 100 người dùng mỗi lượt');
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


  return successResponse<BulkCreateUserResponseData>(req, {
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
  req: Request,
  body: { title?: string; visibility?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<Response> {
  const { title } = body
  const visibility = body.visibility ?? 'public'

  if (!title || title.trim() === '') {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Vui lòng nhập tên notebook')
  }

  if (!['public', 'private'].includes(visibility)) {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Chế độ hiển thị không hợp lệ (public hoặc private)')
  }

  const { data, error } = await supabaseAdmin
    .from('notebooks')
    .insert({
      title: title.trim(),
      user_id: userId,
      visibility
    })
    .select('id')
    .single()

  if (error) {
    console.error('[admin-api] createPublicNotebook error:', error)
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Không thể tạo public notebook')
  }


  return successResponse<CreatePublicNotebookResponseData>(req, {
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
  req: Request,
  body: { notebook_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Response> {
  const { notebook_id } = body

  if (!notebook_id) {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Vui lòng cung cấp ID của notebook')
  }

  // 1. Verify notebook exists and is public
  const { data: notebook, error: fetchError } = await supabaseAdmin
    .from('notebooks')
    .select('id, visibility')
    .eq('id', notebook_id)
    .single()

  if (fetchError || !notebook) {
    return errorResponse(req, 404, 'NOT_FOUND', 'Không tìm thấy notebook')
  }

  if (notebook.visibility !== 'public') {
    return errorResponse(req, 403, 'FORBIDDEN', 'Chỉ có thể xoá public notebook qua API này')
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
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Không xoá được notebook')
  }


  return successResponse<DeletePublicNotebookResponseData>(req, {
    success: true
  })
}

// ============================================================================
// toggle_visibility — Toggle notebook visibility (public/private)
// ============================================================================

interface ToggleVisibilityResponseData {
  notebook_id: string
  visibility: string
}

async function handleToggleVisibility(
  req: Request,
  body: { notebook_id?: string; visibility?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  adminUserId: string
): Promise<Response> {
  const { notebook_id, visibility } = body

  if (!notebook_id || !visibility || !['public', 'private'].includes(visibility)) {
    return errorResponse(req, 400, 'INVALID_INPUT', 'Thiếu thông tin hoặc giá trị không hợp lệ')
  }

  // Verify notebook exists AND admin is the owner
  const { data: notebook, error: fetchError } = await supabaseAdmin
    .from('notebooks')
    .select('id, visibility, user_id')
    .eq('id', notebook_id)
    .single()

  if (fetchError || !notebook) {
    return errorResponse(req, 404, 'NOT_FOUND', 'Không tìm thấy notebook')
  }

  // Ownership check — admin can only toggle visibility on notebooks they own
  if (notebook.user_id !== adminUserId) {
    return errorResponse(req, 403, 'FORBIDDEN', 'Bạn chỉ có thể thay đổi chế độ hiển thị notebook do mình tạo')
  }

  if (notebook.visibility === visibility) {
    // Already in desired state, return success idempotently
    return successResponse<ToggleVisibilityResponseData>(req, {
      notebook_id,
      visibility
    })
  }

  const { error: updateError } = await supabaseAdmin
    .from('notebooks')
    .update({ visibility })
    .eq('id', notebook_id)

  if (updateError) {
    console.error('[admin-api] toggleVisibility error:', updateError)
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Không thể cập nhật chế độ hiển thị')
  }


  return successResponse<ToggleVisibilityResponseData>(req, {
    notebook_id,
    visibility
  })
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    // ============ 1. AUTHORIZATION CHECK ============
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse(req, 401, 'UNAUTHORIZED', 'Vui lòng đăng nhập')
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
      return errorResponse(req, 401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn')
    }


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
      return errorResponse(req, 403, 'FORBIDDEN', 'Bạn không có quyền truy cập')
    }

    if (profile.role !== 'admin') {
      console.warn('[admin-api] Non-admin access attempt:', { userId: user.id, role: profile.role })
      return errorResponse(req, 403, 'FORBIDDEN', 'Bạn không có quyền truy cập')
    }


    // ============ 3. PARSE ACTION ============
    const body = await req.json()
    const { action } = body as { action: string }

    if (!action) {
      return errorResponse(req, 400, 'INVALID_ACTION', 'Hành động không hợp lệ')
    }

    // ============ 4. ACTION DISPATCH ============
    switch (action) {
      case 'ping':
        return handlePing(req)

      case 'create_user':
        return await handleCreateUser(req, body, supabaseAdmin)

      case 'list_users':
        return await handleListUsers(req, body, supabaseAuth)

      case 'delete_user':
        return await handleDeleteUser(req, body, supabaseAdmin, user.id)

      case 'bulk_create_users':
        return await handleBulkCreateUsers(req, body as unknown as BulkCreateUserRequest, supabaseAdmin)

      case 'create_public_notebook':
        return await handleCreatePublicNotebook(req, body, supabaseAdmin, user.id)

      case 'delete_public_notebook':
        return await handleDeletePublicNotebook(req, body, supabaseAdmin)

      case 'toggle_visibility':
        return await handleToggleVisibility(req, body, supabaseAdmin, user.id)

      default:
        return errorResponse(req, 400, 'INVALID_ACTION', 'Hành động không hợp lệ')
    }

  } catch (error) {
    console.error('[admin-api] Unhandled error:', error)
    return errorResponse(req, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }
})
