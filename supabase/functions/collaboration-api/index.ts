import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsResponse } from "../_shared/cors.ts"
import { authenticateRequest } from "../_shared/auth.ts"

// ============================================================================
// Response Helpers — Unified API response format (mirrors admin-api)
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
// Authorization Helper — Direct queries, NOT via RPC
// ============================================================================
// ⚠️ DO NOT use supabaseAdmin.rpc('get_notebook_role', ...) — auth.uid()
// returns NULL in service_role context. Must replicate logic with direct queries.

async function checkNotebookRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  notebookId: string
): Promise<string | null> {
  // 1. Check admin via profiles
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', userId).single()
  if (profile?.role === 'admin') return 'admin'

  // 2. Check notebook owner
  const { data: notebook } = await supabaseAdmin
    .from('notebooks').select('user_id').eq('id', notebookId).single()
  if (!notebook) return null
  if (notebook.user_id === userId) return 'owner'

  // 3. Check notebook_members (uses composite index on notebook_id, user_id)
  const { data: member } = await supabaseAdmin
    .from('notebook_members')
    .select('role, status')
    .eq('notebook_id', notebookId)
    .eq('user_id', userId)
    .single()
  if (member?.status === 'accepted') return member.role
  return null
}

// ============================================================================
// Action: invite_member
// Owner sends { notebook_id, email, role } → inserts notebook_members row
// ============================================================================

interface InviteMemberResponseData {
  member_id: string
  notebook_id: string
  user_id: string
  role: string
  status: string
}

async function handleInviteMember(
  body: { notebook_id?: string; email?: string; role?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string
): Promise<Response> {
  const { notebook_id, email, role } = body

  if (!notebook_id || !email || !role) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  // Validate role — cannot invite as 'owner'
  if (!['editor', 'viewer'].includes(role)) {
    return errorResponse(400, 'INVALID_ROLE', 'Vai trò không hợp lệ (editor hoặc viewer)')
  }

  // Authorization: caller must be owner or admin
  const callerRole = await checkNotebookRole(supabaseAdmin, callerId, notebook_id)
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
  }

  // Find user by email using auth.admin API
  const { data: usersResult, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 1,
  })

  if (usersError) {
    console.error('[collaboration-api] listUsers error:', usersError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }

  // Search through all users to find by email (auth API doesn't support email filter directly)
  // Use a targeted approach: list users and filter, or use a more efficient method
  let targetUserId: string | null = null

  // More efficient: query profiles + auth to find user by email
  // The auth.admin API doesn't have a getByEmail, so we use listUsers with pagination
  // For better performance, do a paginated search
  let page = 1
  const perPage = 100
  let found = false

  while (!found) {
    const { data: batch, error: batchError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (batchError || !batch.users || batch.users.length === 0) break

    const matchedUser = batch.users.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    )

    if (matchedUser) {
      targetUserId = matchedUser.id
      found = true
    }

    // If we got fewer than perPage results, we've reached the end
    if (batch.users.length < perPage) break
    page++
  }

  if (!targetUserId) {
    return errorResponse(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng với email này')
  }

  // Cannot invite yourself
  if (targetUserId === callerId) {
    return errorResponse(400, 'SELF_INVITE', 'Không thể mời chính bạn')
  }

  // Insert member row — unique constraint (notebook_id, user_id) catches duplicates
  const { data: memberData, error: insertError } = await supabaseAdmin
    .from('notebook_members')
    .insert({
      notebook_id,
      user_id: targetUserId,
      role,
      status: 'pending',
      invited_by: callerId,
    })
    .select('id, notebook_id, user_id, role, status')
    .single()

  if (insertError) {
    // PostgreSQL error code 23505 = unique violation
    if (insertError.code === '23505') {
      return errorResponse(409, 'ALREADY_MEMBER', 'Người dùng đã được mời hoặc đã là thành viên')
    }
    console.error('[collaboration-api] invite_member insert error:', insertError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }

  console.log('[collaboration-api] Member invited:', {
    member_id: memberData.id,
    notebook_id,
    user_id: targetUserId,
    role,
  })

  return successResponse<InviteMemberResponseData>({
    member_id: memberData.id,
    notebook_id: memberData.notebook_id,
    user_id: memberData.user_id,
    role: memberData.role,
    status: memberData.status,
  })
}

// ============================================================================
// Action: respond_invitation — SECURITY-CRITICAL
// Invited user sends { member_id, response: 'accepted'|'declined' }
// ONLY updates 'status' column. NEVER touches 'role'.
// ============================================================================

interface RespondInvitationResponseData {
  member_id: string
  status: string
}

async function handleRespondInvitation(
  body: { member_id?: string; response?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string
): Promise<Response> {
  const { member_id, response } = body

  if (!member_id || !response) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  if (!['accepted', 'declined'].includes(response)) {
    return errorResponse(400, 'INVALID_INPUT', 'Phản hồi không hợp lệ (accepted hoặc declined)')
  }

  // Lookup the invitation
  const { data: member, error: fetchError } = await supabaseAdmin
    .from('notebook_members')
    .select('id, user_id, status')
    .eq('id', member_id)
    .single()

  if (fetchError || !member) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy lời mời')
  }

  // SECURITY: Verify caller IS the invited user
  if (member.user_id !== callerId) {
    return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
  }

  // Check invitation hasn't already been responded to
  if (member.status !== 'pending') {
    return errorResponse(400, 'ALREADY_RESPONDED', 'Lời mời đã được phản hồi trước đó')
  }

  // SECURITY-CRITICAL: ONLY update 'status', NEVER 'role'
  const { error: updateError } = await supabaseAdmin
    .from('notebook_members')
    .update({ status: response })
    .eq('id', member_id)

  if (updateError) {
    console.error('[collaboration-api] respond_invitation update error:', updateError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }

  console.log('[collaboration-api] Invitation responded:', { member_id, response, user_id: callerId })

  return successResponse<RespondInvitationResponseData>({
    member_id,
    status: response,
  })
}

// ============================================================================
// Action: remove_member
// Owner sends { member_id } → deletes notebook_members row
// ============================================================================

interface RemoveMemberResponseData {
  success: boolean
}

async function handleRemoveMember(
  body: { member_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string
): Promise<Response> {
  const { member_id } = body

  if (!member_id) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  // Lookup the member row to get notebook_id and user_id
  const { data: member, error: fetchError } = await supabaseAdmin
    .from('notebook_members')
    .select('id, notebook_id, user_id')
    .eq('id', member_id)
    .single()

  if (fetchError || !member) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy thành viên')
  }

  // Cannot remove self
  if (member.user_id === callerId) {
    return errorResponse(400, 'CANNOT_REMOVE_SELF', 'Không thể xoá chính bạn khỏi notebook')
  }

  // Authorization: caller must be owner or admin
  const callerRole = await checkNotebookRole(supabaseAdmin, callerId, member.notebook_id)
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
  }

  // Delete the member row
  const { error: deleteError } = await supabaseAdmin
    .from('notebook_members')
    .delete()
    .eq('id', member_id)

  if (deleteError) {
    console.error('[collaboration-api] remove_member delete error:', deleteError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }

  console.log('[collaboration-api] Member removed:', { member_id, notebook_id: member.notebook_id })

  return successResponse<RemoveMemberResponseData>({ success: true })
}

// ============================================================================
// Action: update_member_role
// Owner sends { member_id, role: 'editor'|'viewer' } → updates role
// Cannot set 'owner'
// ============================================================================

interface UpdateMemberRoleResponseData {
  member_id: string
  role: string
}

async function handleUpdateMemberRole(
  body: { member_id?: string; role?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string
): Promise<Response> {
  const { member_id, role } = body

  if (!member_id || !role) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  // Cannot set 'owner' — owner is determined by notebooks.user_id
  if (!['editor', 'viewer'].includes(role)) {
    return errorResponse(400, 'INVALID_ROLE', 'Vai trò không hợp lệ (editor hoặc viewer)')
  }

  // Lookup the member row
  const { data: member, error: fetchError } = await supabaseAdmin
    .from('notebook_members')
    .select('id, notebook_id, user_id')
    .eq('id', member_id)
    .single()

  if (fetchError || !member) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy thành viên')
  }

  // Cannot change own role
  if (member.user_id === callerId) {
    return errorResponse(400, 'CANNOT_CHANGE_OWN_ROLE', 'Không thể thay đổi vai trò của chính bạn')
  }

  // Authorization: caller must be owner or admin
  const callerRole = await checkNotebookRole(supabaseAdmin, callerId, member.notebook_id)
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
  }

  // Update role
  const { error: updateError } = await supabaseAdmin
    .from('notebook_members')
    .update({ role })
    .eq('id', member_id)

  if (updateError) {
    console.error('[collaboration-api] update_member_role error:', updateError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }

  console.log('[collaboration-api] Member role updated:', { member_id, role })

  return successResponse<UpdateMemberRoleResponseData>({ member_id, role })
}

// ============================================================================
// Action: list_members
// Any notebook participant sends { notebook_id } → returns members list
// Batch-loads profiles to avoid N+1 queries (per data-n-plus-one.md)
// ============================================================================

interface MemberItem {
  id: string
  user_id: string
  role: string
  status: string
  email: string | null
  full_name: string | null
  invited_by: string | null
  created_at: string
}

interface ListMembersResponseData {
  members: MemberItem[]
  notebook_id: string
}

async function handleListMembers(
  body: { notebook_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string
): Promise<Response> {
  const { notebook_id } = body

  if (!notebook_id) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng nhập đầy đủ thông tin')
  }

  // Authorization: caller must be a participant (any role including pending)
  const callerRole = await checkNotebookRole(supabaseAdmin, callerId, notebook_id)

  // Also check if caller has a pending invitation (checkNotebookRole returns null for pending)
  let isPending = false
  if (!callerRole) {
    const { data: pendingMember } = await supabaseAdmin
      .from('notebook_members')
      .select('id')
      .eq('notebook_id', notebook_id)
      .eq('user_id', callerId)
      .eq('status', 'pending')
      .single()

    if (!pendingMember) {
      return errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này')
    }
    isPending = true
  }

  // Fetch all member rows for this notebook (uses idx_notebook_members_notebook_id)
  const { data: members, error: membersError } = await supabaseAdmin
    .from('notebook_members')
    .select('id, user_id, role, status, invited_by, created_at')
    .eq('notebook_id', notebook_id)

  if (membersError) {
    console.error('[collaboration-api] list_members query error:', membersError)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }

  if (!members || members.length === 0) {
    return successResponse<ListMembersResponseData>({
      members: [],
      notebook_id,
    })
  }

  // Batch-load profiles — collect user_ids, single .in() query (anti N+1)
  const userIds = members.map((m: { user_id: string }) => m.user_id)
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  const profileMap = new Map<string, { full_name: string | null }>(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p])
  )

  // Batch-load emails from auth admin API
  const emailMap = new Map<string, string>()

  // Fetch in batches of 20 to handle large member lists without overwhelming the database
  for (let i = 0; i < userIds.length; i += 20) {
    const batch = userIds.slice(i, i + 20)
    
    // Fetch users in parallel for this batch
    const userPromises = batch.map((id: string) => supabaseAdmin.auth.admin.getUserById(id))
    const results = await Promise.all(userPromises)
    
    // Process results
    results.forEach((res: any, index: number) => {
      if (!res.error && res.data?.user?.email) {
        emailMap.set(batch[index], res.data.user.email)
      }
    })
  }

  // Merge data
  const memberItems: MemberItem[] = members.map(
    (m: { id: string; user_id: string; role: string; status: string; invited_by: string | null; created_at: string }) => {
      const profile = profileMap.get(m.user_id)
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        email: emailMap.get(m.user_id) ?? null,
        full_name: profile?.full_name ?? null,
        invited_by: m.invited_by,
        created_at: m.created_at,
      }
    }
  )

  // Also include the notebook owner in the list
  const { data: notebook } = await supabaseAdmin
    .from('notebooks')
    .select('user_id')
    .eq('id', notebook_id)
    .single()

  if (notebook) {
    const ownerIsAlreadyInList = memberItems.some(m => m.user_id === notebook.user_id)
    if (!ownerIsAlreadyInList) {
      const ownerProfile = profileMap.get(notebook.user_id)
      // If owner profile wasn't in the batch, fetch it
      let ownerFullName = ownerProfile?.full_name ?? null
      let ownerEmail = emailMap.get(notebook.user_id) ?? null

      if (!ownerProfile) {
        const { data: ownerProf } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', notebook.user_id)
          .single()
        ownerFullName = ownerProf?.full_name ?? null
      }

      if (!ownerEmail) {
        // Try to find owner's email from already-fetched auth data
        // or skip — the owner info is supplementary
        const { data: ownerAuth } = await supabaseAdmin.auth.admin.getUserById(notebook.user_id)
        ownerEmail = ownerAuth?.user?.email ?? null
      }

      memberItems.unshift({
        id: 'owner',
        user_id: notebook.user_id,
        role: 'owner',
        status: 'accepted',
        email: ownerEmail,
        full_name: ownerFullName,
        invited_by: null,
        created_at: '', // Owner doesn't have a membership created_at
      })
    }
  }

  console.log('[collaboration-api] list_members:', { notebook_id, count: memberItems.length })

  return successResponse<ListMembersResponseData>({
    members: memberItems,
    notebook_id,
  })
}

// ============================================================================
// Main Handler — Action dispatch switch (mirrors admin-api pattern)
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsResponse()
  }

  try {
    // ============ 1. AUTHENTICATION (shared helper) ============
    const { user, error: authError } = await authenticateRequest(req)
    if (authError) {
      return authError
    }
    if (!user) {
      return errorResponse(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn')
    }

    console.log('[collaboration-api] Authenticated user:', user.id)

    // ============ 2. SERVICE ROLE CLIENT ============
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ============ 3. PARSE ACTION ============
    const body = await req.json()
    const { action } = body as { action: string }

    if (!action) {
      return errorResponse(400, 'INVALID_ACTION', 'Hành động không hợp lệ')
    }

    // ============ 4. ACTION DISPATCH ============
    // NOTE: Per-action authorization — NOT a global admin guard like admin-api
    switch (action) {
      case 'invite_member':
        return await handleInviteMember(body, supabaseAdmin, user.id)

      case 'respond_invitation':
        return await handleRespondInvitation(body, supabaseAdmin, user.id)

      case 'remove_member':
        return await handleRemoveMember(body, supabaseAdmin, user.id)

      case 'update_member_role':
        return await handleUpdateMemberRole(body, supabaseAdmin, user.id)

      case 'list_members':
        return await handleListMembers(body, supabaseAdmin, user.id)

      default:
        return errorResponse(400, 'INVALID_ACTION', 'Hành động không hợp lệ')
    }

  } catch (error) {
    console.error('[collaboration-api] Unhandled error:', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống')
  }
})
