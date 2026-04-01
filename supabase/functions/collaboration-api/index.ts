import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";

// ============================================================================
// Response Helpers — Unified API response format (mirrors admin-api)
// Updated for no-jwt-verify
// ============================================================================

interface ErrorResponseBody {
  error: true;
  code: string;
  message: string;
}

interface SuccessResponseBody<T = unknown> {
  data: T;
}

function errorResponse(
  req: Request,
  status: number,
  code: string,
  message: string,
): Response {
  const body: ErrorResponseBody = { error: true, code, message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function successResponse<T>(req: Request, data: T): Response {
  const body: SuccessResponseBody<T> = { data };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ============================================================================
// Authorization Helper — Direct queries, NOT via RPC
// ============================================================================
// ⚠️ DO NOT use supabaseAdmin.rpc('get_notebook_role', ...) — auth.uid()
// returns NULL in service_role context. Must replicate logic with direct queries.

async function checkNotebookRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  notebookId: string,
): Promise<string | null> {
  // 1. Check admin via profiles
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role === "admin") return "admin";

  // 2. Check notebook owner
  const { data: notebook } = await supabaseAdmin
    .from("notebooks")
    .select("user_id")
    .eq("id", notebookId)
    .single();
  if (!notebook) return null;
  if (notebook.user_id === userId) return "owner";

  // 3. Check notebook_members (uses composite index on notebook_id, user_id)
  const { data: member } = await supabaseAdmin
    .from("notebook_members")
    .select("role")
    .eq("notebook_id", notebookId)
    .eq("user_id", userId)
    .single();
  if (member) return member.role;
  return null;
}

// ============================================================================
// Activity Log Helper — Awaited audit trail
// ============================================================================
// Awaited: Deno Edge runtime can terminate isolates after the response is sent,
// which silently drops in-flight fire-and-forget promises.
// This was previously fixed in process-document/index.ts (line 81) with await.
// Inserts via service_role (bypasses RLS).

async function logActivity(
  supabaseAdmin: ReturnType<typeof createClient>,
  notebookId: string,
  actorId: string,
  actionType: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("activity_log")
    .insert({
      notebook_id: notebookId,
      actor_id: actorId,
      action_type: actionType,
      metadata,
    });

  if (error) {
    console.error("[activity-log] Insert failed:", error.message, {
      notebookId,
      actionType,
    });
  }
}

// ============================================================================
// Action: invite_member
// Owner sends { notebook_id, email, role } → inserts notebook_members row
// ============================================================================

interface InviteMemberResponseData {
  member_id: string;
  notebook_id: string;
  user_id: string;
  role: string;
}

async function handleInviteMember(
  req: Request,
  body: { notebook_id?: string; email?: string; role?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string,
): Promise<Response> {
  const { notebook_id, email, role } = body;

  if (!notebook_id || !email || !role) {
    return errorResponse(
      req,
      400,
      "INVALID_INPUT",
      "Vui lòng nhập đầy đủ thông tin",
    );
  }

  // Validate role — cannot invite as 'owner'
  if (!["editor", "viewer"].includes(role)) {
    return errorResponse(
      req,
      400,
      "INVALID_ROLE",
      "Vai trò không hợp lệ (editor hoặc viewer)",
    );
  }

  // Authorization: caller must be owner or admin
  const callerRole = await checkNotebookRole(
    supabaseAdmin,
    callerId,
    notebook_id,
  );
  if (callerRole !== "owner" && callerRole !== "admin") {
    return errorResponse(
      req,
      403,
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này",
    );
  }

  // OPTIMIZATION: Query the public.profiles table directly (O(1) instead of O(N) auth scanning)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .single();

  if (profileError || !profile) {
    return errorResponse(
      req,
      404,
      "USER_NOT_FOUND",
      "Không tìm thấy người dùng với email này",
    );
  }

  const targetUserId = profile.id;

  // Cannot invite yourself
  if (targetUserId === callerId) {
    return errorResponse(req, 400, "SELF_INVITE", "Không thể mời chính bạn");
  }

  // Insert member row — unique constraint (notebook_id, user_id) catches duplicates
  const { data: memberData, error: insertError } = await supabaseAdmin
    .from("notebook_members")
    .insert({
      notebook_id,
      user_id: targetUserId,
      role,
      invited_by: callerId,
    })
    .select("id, notebook_id, user_id, role")
    .single();

  if (insertError) {
    // PostgreSQL error code 23505 = unique violation
    if (insertError.code === "23505") {
      return errorResponse(
        req,
        409,
        "ALREADY_MEMBER",
        "Người dùng đã là thành viên của notebook này",
      );
    }
    console.error(
      "[collaboration-api] invite_member insert error:",
      insertError,
    );
    return errorResponse(req, 500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống");
  }

  // Await activity log to ensure it persists before response is sent
  await logActivity(supabaseAdmin, notebook_id, callerId, "member_invited", {
    target_user_id: targetUserId,
    target_email: email,
    role,
  });

  return successResponse<InviteMemberResponseData>(req, {
    member_id: memberData.id,
    notebook_id: memberData.notebook_id,
    user_id: memberData.user_id,
    role: memberData.role,
  });
}



// ============================================================================
// Action: remove_member
// Owner sends { member_id } → deletes notebook_members row
// ============================================================================

interface RemoveMemberResponseData {
  success: boolean;
}

async function handleRemoveMember(
  req: Request,
  body: { member_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string,
): Promise<Response> {
  const { member_id } = body;

  if (!member_id) {
    return errorResponse(
      req,
      400,
      "INVALID_INPUT",
      "Vui lòng nhập đầy đủ thông tin",
    );
  }

  // Lookup the member row to get notebook_id and user_id
  const { data: member, error: fetchError } = await supabaseAdmin
    .from("notebook_members")
    .select("id, notebook_id, user_id")
    .eq("id", member_id)
    .single();

  if (fetchError || !member) {
    return errorResponse(req, 404, "NOT_FOUND", "Không tìm thấy thành viên");
  }

  // Cannot remove self
  if (member.user_id === callerId) {
    return errorResponse(
      req,
      400,
      "CANNOT_REMOVE_SELF",
      "Không thể xoá chính bạn khỏi notebook",
    );
  }

  // Authorization: caller must be owner or admin
  const callerRole = await checkNotebookRole(
    supabaseAdmin,
    callerId,
    member.notebook_id,
  );
  if (callerRole !== "owner" && callerRole !== "admin") {
    return errorResponse(
      req,
      403,
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này",
    );
  }

  // Delete the member row
  const { error: deleteError } = await supabaseAdmin
    .from("notebook_members")
    .delete()
    .eq("id", member_id);

  if (deleteError) {
    console.error(
      "[collaboration-api] remove_member delete error:",
      deleteError,
    );
    return errorResponse(req, 500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống");
  }

  // Await activity log to ensure it persists before response is sent
  await logActivity(supabaseAdmin, member.notebook_id, callerId, "member_removed", {
    target_user_id: member.user_id,
  });

  return successResponse<RemoveMemberResponseData>(req, { success: true });
}

// ============================================================================
// Action: update_member_role
// Owner sends { member_id, role: 'editor'|'viewer' } → updates role
// Cannot set 'owner'
// ============================================================================

interface UpdateMemberRoleResponseData {
  member_id: string;
  role: string;
}

async function handleUpdateMemberRole(
  req: Request,
  body: { member_id?: string; role?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string,
): Promise<Response> {
  const { member_id, role } = body;

  if (!member_id || !role) {
    return errorResponse(
      req,
      400,
      "INVALID_INPUT",
      "Vui lòng nhập đầy đủ thông tin",
    );
  }

  // Cannot set 'owner' — owner is determined by notebooks.user_id
  if (!["editor", "viewer"].includes(role)) {
    return errorResponse(
      req,
      400,
      "INVALID_ROLE",
      "Vai trò không hợp lệ (editor hoặc viewer)",
    );
  }

  // Lookup the member row
  const { data: member, error: fetchError } = await supabaseAdmin
    .from("notebook_members")
    .select("id, notebook_id, user_id")
    .eq("id", member_id)
    .single();

  if (fetchError || !member) {
    return errorResponse(req, 404, "NOT_FOUND", "Không tìm thấy thành viên");
  }

  // Cannot change own role
  if (member.user_id === callerId) {
    return errorResponse(
      req,
      400,
      "CANNOT_CHANGE_OWN_ROLE",
      "Không thể thay đổi vai trò của chính bạn",
    );
  }

  // Authorization: caller must be owner or admin
  const callerRole = await checkNotebookRole(
    supabaseAdmin,
    callerId,
    member.notebook_id,
  );
  if (callerRole !== "owner" && callerRole !== "admin") {
    return errorResponse(
      req,
      403,
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này",
    );
  }

  // Update role
  const { error: updateError } = await supabaseAdmin
    .from("notebook_members")
    .update({ role })
    .eq("id", member_id);

  if (updateError) {
    console.error("[collaboration-api] update_member_role error:", updateError);
    return errorResponse(req, 500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống");
  }


  // Await activity log to ensure it persists before response is sent
  await logActivity(supabaseAdmin, member.notebook_id, callerId, "role_changed", {
    target_user_id: member.user_id,
    new_role: role,
  });

  return successResponse<UpdateMemberRoleResponseData>(req, { member_id, role });
}

// ============================================================================
// Action: list_members
// Any notebook participant sends { notebook_id } → returns members list
// Batch-loads profiles to avoid N+1 queries (per data-n-plus-one.md)
// ============================================================================

interface MemberItem {
  id: string;
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  invited_by: string | null;
  created_at: string;
}

interface ListMembersResponseData {
  members: MemberItem[];
  notebook_id: string;
}

async function handleListMembers(
  req: Request,
  body: { notebook_id?: string },
  supabaseAdmin: ReturnType<typeof createClient>,
  callerId: string,
): Promise<Response> {
  const { notebook_id } = body;

  if (!notebook_id) {
    return errorResponse(
      req,
      400,
      "INVALID_INPUT",
      "Vui lòng nhập đầy đủ thông tin",
    );
  }

  // Authorization: caller must be a participant (owner, editor, viewer, admin)
  const callerRole = await checkNotebookRole(
    supabaseAdmin,
    callerId,
    notebook_id,
  );

  if (!callerRole) {
    return errorResponse(
      req,
      403,
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này",
    );
  }

  // Fetch all member rows for this notebook (uses idx_notebook_members_notebook_id)
  const { data: members, error: membersError } = await supabaseAdmin
    .from("notebook_members")
    .select("id, user_id, role, invited_by, created_at")
    .eq("notebook_id", notebook_id);

  if (membersError) {
    console.error(
      "[collaboration-api] list_members query error:",
      membersError,
    );
    return errorResponse(req, 500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống");
  }

  if (!members || members.length === 0) {
    return successResponse<ListMembersResponseData>(req, {
      members: [],
      notebook_id,
    });
  }

  // Batch-load profiles — collect user_ids, single .in() query (anti N+1)
  // OPTIMIZATION: Included email in the select to avoid N+1 auth admin API queries
  const userIds = members.map((m: { user_id: string }) => m.user_id);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const profileMap = new Map<
    string,
    { full_name: string | null; email: string | null }
  >(
    (profiles ?? []).map(
      (p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p,
      ],
    ),
  );

  // Merge data
  const memberItems: MemberItem[] = members.map(
    (m: {
      id: string;
      user_id: string;
      role: string;
      invited_by: string | null;
      created_at: string;
    }) => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        email: profile?.email ?? null,
        full_name: profile?.full_name ?? null,
        invited_by: m.invited_by,
        created_at: m.created_at,
      };
    },
  );

  // Also include the notebook owner in the list
  const { data: notebook } = await supabaseAdmin
    .from("notebooks")
    .select("user_id")
    .eq("id", notebook_id)
    .single();

  if (notebook) {
    const ownerIsAlreadyInList = memberItems.some(
      (m) => m.user_id === notebook.user_id,
    );
    if (!ownerIsAlreadyInList) {
      const ownerProfile = profileMap.get(notebook.user_id);
      // If owner profile wasn't in the batch, fetch it
      let ownerFullName = ownerProfile?.full_name ?? null;
      let ownerEmail = ownerProfile?.email ?? null;

      if (!ownerProfile) {
        const { data: ownerProf } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", notebook.user_id)
          .single();
        ownerFullName = ownerProf?.full_name ?? null;
        ownerEmail = ownerProf?.email ?? null;
      }

      memberItems.unshift({
        id: "owner",
        user_id: notebook.user_id,
        role: "owner",
        email: ownerEmail,
        full_name: ownerFullName,
        invited_by: null,
        created_at: "", // Owner doesn't have a membership created_at
      });
    }
  }

  return successResponse<ListMembersResponseData>(req, {
    members: memberItems,
    notebook_id,
  });
}



// ============================================================================
// Main Handler — Action dispatch switch (mirrors admin-api pattern)
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  try {
    // ============ 1. AUTHENTICATION (shared helper) ============
    const { user, error: authError } = await authenticateRequest(req);
    if (authError) {
      return authError;
    }
    if (!user) {
      return errorResponse(req, 401, "UNAUTHORIZED", "Phiên đăng nhập đã hết hạn");
    }


    // ============ 2. SERVICE ROLE CLIENT ============
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ============ 3. PARSE ACTION ============
    const body = await req.json();
    const { action } = body as { action: string };

    if (!action) {
      return errorResponse(req, 400, "INVALID_ACTION", "Hành động không hợp lệ");
    }

    // ============ 4. ACTION DISPATCH ============
    // NOTE: Per-action authorization — NOT a global admin guard like admin-api
    switch (action) {
      case "invite_member":
        return await handleInviteMember(req, body, supabaseAdmin, user.id);

      case "remove_member":
        return await handleRemoveMember(req, body, supabaseAdmin, user.id);

      case "update_member_role":
        return await handleUpdateMemberRole(req, body, supabaseAdmin, user.id);

      case "list_members":
        return await handleListMembers(req, body, supabaseAdmin, user.id);

      default:
        return errorResponse(req, 400, "INVALID_ACTION", "Hành động không hợp lệ");
    }
  } catch (error) {
    console.error("[collaboration-api] Unhandled error:", error);
    return errorResponse(req, 500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống");
  }
});
