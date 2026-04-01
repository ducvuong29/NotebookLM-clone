import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface NotebookMember {
  id: string;
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  invited_by: string | null;
  created_at: string;
}

interface CollaborationApiError {
  error: true;
  code: string;
  message: string;
}

interface InviteMemberPayload {
  notebook_id: string;
  email: string;
  role: string;
}

interface InviteMemberResponse {
  member_id: string;
  notebook_id: string;
  user_id: string;
  role: string;
}

interface RemoveMemberPayload {
  member_id: string;
  notebook_id: string; // needed for cache invalidation
}

interface RemoveMemberResponse {
  success: boolean;
}

interface UpdateMemberRolePayload {
  member_id: string;
  role: string;
  notebook_id: string; // needed for cache invalidation
}

interface UpdateMemberRoleResponse {
  member_id: string;
  role: string;
}

interface ListMembersResponse {
  members: NotebookMember[];
  notebook_id: string;
}

// ============================================================================
// Helper — invoke collaboration-api and unwrap response
// ============================================================================

async function invokeCollaborationApi<T>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<
    { data: T } | CollaborationApiError
  >('collaboration-api', {
    body: { action, ...payload } as Record<string, unknown>,
  });

  // Nếu Edge Function trả về mã lỗi HTTP 4xx, supabase-js sẽ gán vào `error` dưới dạng FunctionsHttpError.
  // Thử trích xuất nội dung lỗi thực tế do Backend trả về qua error.context (Response object).
  if (error) {
    let errorMessage = 'Không thể kết nối đến máy chủ';
    if (error.name === 'FunctionsHttpError' && 'context' in error) {
      try {
        const contextResponse = (error as any /* eslint-disable-line @typescript-eslint/no-explicit-any */).context as Response;
        const errData = await contextResponse.json();
        if (errData && errData.error && errData.message) {
          errorMessage = errData.message;
        }
      } catch (e) {
        // Bỏ qua lỗi parse JSON, giữ nguyên errorMessage mặc định
      }
    }
    throw new Error(errorMessage);
  }

  if (data && 'error' in data && data.error === true) {
    const apiError = data as CollaborationApiError;
    throw new Error(apiError.message);
  }

  const successData = data as { data: T };
  return successData.data;
}

// ============================================================================
// useNotebookMembers — Query members list for a notebook
// ============================================================================

export function useNotebookMembers(notebookId: string | undefined) {
  return useQuery<NotebookMember[]>({
    queryKey: ['notebook-members', notebookId],
    queryFn: async (): Promise<NotebookMember[]> => {
      if (!notebookId) return [];

      const result = await invokeCollaborationApi<ListMembersResponse>('list_members', {
        notebook_id: notebookId,
      });

      return result.members;
    },
    enabled: !!notebookId,
    staleTime: 30_000, // 30s — matches admin-api pattern
  });
}

// ============================================================================
// useInviteMember — Mutation to invite a user to a notebook
// ============================================================================

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation<InviteMemberResponse, Error, InviteMemberPayload>({
    mutationFn: async (payload: InviteMemberPayload): Promise<InviteMemberResponse> => {
      return invokeCollaborationApi<InviteMemberResponse>('invite_member', payload);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notebook-members', variables.notebook_id] });
      toast.success('✅ Đã thêm thành viên thành công!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}


// ============================================================================
// useRemoveMember — Mutation to remove a member from a notebook
// ============================================================================

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation<RemoveMemberResponse, Error, RemoveMemberPayload>({
    mutationFn: async (payload: RemoveMemberPayload): Promise<RemoveMemberResponse> => {
      // Only send member_id to the API (notebook_id is for cache invalidation)
      return invokeCollaborationApi<RemoveMemberResponse>('remove_member', {
        member_id: payload.member_id,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notebook-members', variables.notebook_id] });
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
      queryClient.invalidateQueries({ queryKey: ['my-memberships'] });
      toast.success('✅ Đã xoá thành viên khỏi notebook');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================================
// useUpdateMemberRole — Mutation to change a member's role
// ============================================================================

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation<UpdateMemberRoleResponse, Error, UpdateMemberRolePayload>({
    mutationFn: async (payload: UpdateMemberRolePayload): Promise<UpdateMemberRoleResponse> => {
      // Only send member_id and role to the API
      return invokeCollaborationApi<UpdateMemberRoleResponse>('update_member_role', {
        member_id: payload.member_id,
        role: payload.role,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notebook-members', variables.notebook_id] });
      toast.success('✅ Đã cập nhật vai trò thành viên');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================================
// useSearchUsers — Query users by email or full_name via RPC
// ============================================================================

export interface SearchUserResult {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function useSearchUsers(searchTerm: string) {
  return useQuery<SearchUserResult[]>({
    queryKey: ['search-users', searchTerm],
    queryFn: async (): Promise<SearchUserResult[]> => {
      if (!searchTerm || searchTerm.trim().length === 0) return [];

      const { data, error } = await supabase.rpc('search_users', {
        search_query: searchTerm.trim(),
        limit_count: 5,
      });

      if (error) {
        console.error('Error searching users:', error);
        throw new Error('Lỗi khi tìm kiếm người dùng. Vui lòng thử lại sau.');
      }

      return (data as SearchUserResult[]) || [];
    },
    enabled: searchTerm.trim().length > 0,
    staleTime: 60_000,
  });
}
