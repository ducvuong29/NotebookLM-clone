import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
}

interface CreateUserPayload {
  email: string;
  full_name: string;
}

interface CreateUserResponse {
  user_id: string;
  email: string;
  full_name: string;
}

interface AdminApiError {
  error: true;
  code: string;
  message: string;
}

interface ListUsersResponse {
  users: AdminUser[];
  total: number;
}

interface PaginatedUsersResult {
  users: AdminUser[];
  totalCount: number;
}

// ============================================================================
// Helper — invoke admin-api and unwrap response
// ============================================================================

async function invokeAdminApi<T>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<
    { data: T } | AdminApiError
  >('admin-api', {
    body: { action, ...payload } as Record<string, unknown>,
  });

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
        // Fallback
      }
    }
    throw new Error(errorMessage);
  }

  if (data && 'error' in data && data.error === true) {
    const apiError = data as AdminApiError;
    throw new Error(apiError.message);
  }

  const successData = data as { data: T };
  return successData.data;
}

// ============================================================================
// useAdminUsers — Paginated user list via admin-api Edge Function
// ============================================================================

interface UseAdminUsersParams {
  page: number;       // 1-indexed
  pageSize: number;   // default 25, max 100
  searchQuery: string;
}

export function useAdminUsers({ page, pageSize, searchQuery }: UseAdminUsersParams) {
  return useQuery<PaginatedUsersResult>({
    queryKey: ['admin-users', page, pageSize, searchQuery],
    queryFn: async (): Promise<PaginatedUsersResult> => {
      const { data, error } = await supabase.rpc('get_admin_users', {
        page_num: page,
        page_size: pageSize,
        search_query: searchQuery,
      });

      if (error) {
        throw new Error('Không thể tải danh sách người dùng');
      }

      // data contains an array of users, each row also includes the window function total_count
      const users = (data || []) as (AdminUser & { total_count: number })[];
      const totalCount = users.length > 0 ? Number(users[0].total_count) : 0;

      return {
        users,
        totalCount,
      };
    },
    staleTime: 30_000, // 30s — shorter for paginated data
    placeholderData: keepPreviousData, // Smooth page transitions (rerender-transitions)
  });
}

// ============================================================================
// useAdminUsersCount — Simple count for stat cards (not paginated)
// ============================================================================

export function useAdminUsersCount() {
  return useQuery<{ total: number; admins: number }>({
    queryKey: ['admin-users-count'],
    queryFn: async () => {
      const [totalRes, adminRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin')
      ]);

      if (totalRes.error || adminRes.error) {
        throw new Error('Không thể tải dữ liệu');
      }

      return { 
        total: totalRes.count ?? 0, 
        admins: adminRes.count ?? 0 
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================================================
// useDeleteUser — Permanently delete user via admin-api
// ============================================================================

interface DeleteUserPayload {
  user_id: string;
}

interface DeleteUserResponse {
  user_id: string;
  deleted: boolean;
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation<DeleteUserResponse, Error, DeleteUserPayload>({
    mutationFn: async (payload: DeleteUserPayload): Promise<DeleteUserResponse> => {
      return invokeAdminApi<DeleteUserResponse>('delete_user', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-count'] });
      toast.success('✅ Đã xóa tài khoản thành công');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================================
// useCreateUser — Mutation to create a new user via admin-api
// ============================================================================

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<CreateUserResponse, Error, CreateUserPayload>({
    mutationFn: async (payload: CreateUserPayload): Promise<CreateUserResponse> => {
      return invokeAdminApi<CreateUserResponse>('create_user', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-count'] });
      toast.success('✅ Tạo tài khoản thành công!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================================
// useBulkImportUsers — Mutation to create multiple users via admin-api
// ============================================================================

export interface BulkCreateUserPayload {
  users: Array<{ email: string; full_name?: string }>;
}

export interface BulkCreateUserResponse {
  success_count: number;
  failed_count: number;
  total: number;
  failed: Array<{ email: string; reason: string }>;
}

export function useBulkImportUsers() {
  const queryClient = useQueryClient();

  return useMutation<BulkCreateUserResponse, Error, BulkCreateUserPayload>({
    mutationFn: async (payload: BulkCreateUserPayload): Promise<BulkCreateUserResponse> => {
      return invokeAdminApi<BulkCreateUserResponse>('bulk_create_users', payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-count'] });
      if (data.failed_count === 0) {
        toast.success(`✅ Đã nhập thành công ${data.success_count} tài khoản!`);
      } else if (data.success_count === 0) {
        toast.error(`❌ Nhập thất bại tất cả ${data.failed_count} tài khoản.`);
      } else {
        toast.warning(`⚠️ Đã nhập ${data.success_count} tài khoản. ${data.failed_count} thất bại.`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Lỗi hệ thống: ${error.message}`);
    },
  });
}

