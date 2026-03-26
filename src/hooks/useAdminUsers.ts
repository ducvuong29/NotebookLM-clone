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
  is_disabled: boolean;
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
    throw new Error('Không thể kết nối đến máy chủ');
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
      const result = await invokeAdminApi<ListUsersResponse>('list_users', {
        page,
        perPage: pageSize,
        search: searchQuery,
      });

      return {
        users: result.users,
        totalCount: result.total,
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
      const { count: total, error: totalError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (totalError) throw new Error('Không thể tải dữ liệu');

      const { count: admins, error: adminError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (adminError) throw new Error('Không thể tải dữ liệu');

      return { total: total ?? 0, admins: admins ?? 0 };
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================================================
// useToggleUserStatus — Enable/disable user via admin-api
// ============================================================================

interface ToggleUserStatusPayload {
  user_id: string;
  enabled: boolean;
}

interface ToggleUserStatusResponse {
  user_id: string;
  enabled: boolean;
}

export function useToggleUserStatus() {
  const queryClient = useQueryClient();

  return useMutation<ToggleUserStatusResponse, Error, ToggleUserStatusPayload>({
    mutationFn: async (payload: ToggleUserStatusPayload): Promise<ToggleUserStatusResponse> => {
      return invokeAdminApi<ToggleUserStatusResponse>('toggle_user_status', payload);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (variables.enabled) {
        toast.success('✅ Tài khoản đã được kích hoạt lại');
      } else {
        toast.success('⛔ Tài khoản đã bị vô hiệu hóa');
      }
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

