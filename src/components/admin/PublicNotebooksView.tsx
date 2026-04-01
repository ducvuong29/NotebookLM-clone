import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Newspaper, Plus, Loader2, Book, ExternalLink, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// Types & API Calls
// ============================================================================

interface CreateNotebookPayload {
  title: string;
  visibility?: 'public' | 'private';
}

interface CreateNotebookResponse {
  notebook_id: string;
}

interface AdminApiError {
  error: true;
  code: string;
  message: string;
}

async function createNotebook(payload: CreateNotebookPayload): Promise<CreateNotebookResponse> {
  const { data, error } = await supabase.functions.invoke<
    { data: CreateNotebookResponse } | AdminApiError
  >('admin-api', {
    body: { action: 'create_public_notebook', ...payload },
  });

  if (error) {
    throw new Error('Không thể kết nối đến máy chủ');
  }

  if (data && 'error' in data && data.error === true) {
    const apiError = data as AdminApiError;
    throw new Error(apiError.message);
  }

  const successData = data as { data: CreateNotebookResponse };
  return successData.data;
}

interface DeleteNotebookPayload {
  notebook_id: string;
}

interface DeleteNotebookResponse {
  success: boolean;
}

async function deleteNotebook(payload: DeleteNotebookPayload): Promise<DeleteNotebookResponse> {
  const { data, error } = await supabase.functions.invoke<
    { data: DeleteNotebookResponse } | AdminApiError
  >('admin-api', {
    body: { action: 'delete_public_notebook', ...payload },
  });

  if (error) {
    throw new Error('Không thể kết nối đến máy chủ');
  }

  if (data && 'error' in data && data.error === true) {
    const apiError = data as AdminApiError;
    throw new Error(apiError.message);
  }

  const successData = data as { data: DeleteNotebookResponse };
  return successData.data;
}

interface ToggleVisibilityPayload {
  notebook_id: string;
  visibility: 'public' | 'private';
}

interface ToggleVisibilityResponse {
  notebook_id: string;
  visibility: string;
}

async function toggleVisibility(payload: ToggleVisibilityPayload): Promise<ToggleVisibilityResponse> {
  const { data, error } = await supabase.functions.invoke<
    { data: ToggleVisibilityResponse } | AdminApiError
  >('admin-api', {
    body: { action: 'toggle_visibility', ...payload },
  });

  if (error) {
    throw new Error('Không thể kết nối đến máy chủ');
  }

  if (data && 'error' in data && data.error === true) {
    const apiError = data as AdminApiError;
    throw new Error(apiError.message);
  }

  const successData = data as { data: ToggleVisibilityResponse };
  return successData.data;
}

// ============================================================================
// Hooks
// ============================================================================

function useCreateNotebook() {
  const queryClient = useQueryClient();

  return useMutation<CreateNotebookResponse, Error, CreateNotebookPayload>({
    mutationFn: createNotebook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notebooks'] });
      toast.success('✅ Tạo notebook thành công!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Có lỗi xảy ra khi tạo notebook');
    },
  });
}

function useDeleteNotebook() {
  const queryClient = useQueryClient();

  return useMutation<DeleteNotebookResponse, Error, DeleteNotebookPayload>({
    mutationFn: deleteNotebook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notebooks'] });
      toast.success('✅ Đã xóa notebook!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Có lỗi xảy ra khi xoá notebook');
    },
  });
}

function useToggleVisibility() {
  const queryClient = useQueryClient();

  return useMutation<ToggleVisibilityResponse, Error, ToggleVisibilityPayload, { previousNotebooks: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ }>({
    mutationFn: toggleVisibility,
    onMutate: async (payload) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['admin-notebooks'] });

      // Snapshot the previous value
      const previousNotebooks = queryClient.getQueryData(['admin-notebooks']);

      // Optimistically update to the new value
      queryClient.setQueryData(['admin-notebooks'], (old: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
        if (!old) return old;
        return old.map((nb: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => 
          nb.id === payload.notebook_id 
            ? { ...nb, visibility: payload.visibility }
            : nb
        );
      });

      return { previousNotebooks };
    },
    onError: (err, payload, context) => {
      if (context?.previousNotebooks) {
        queryClient.setQueryData(['admin-notebooks'], context.previousNotebooks);
      }
      toast.error(err.message || 'Có lỗi xảy ra khi cập nhật');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure synchronization
      queryClient.invalidateQueries({ queryKey: ['admin-notebooks'] });
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
    },
    onSuccess: () => {
      toast.success('Đã cập nhật chế độ hiển thị');
    },
  });
}

function useAdminNotebooks(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-notebooks', userId],
    queryFn: async () => {
      if (!userId) return [];

      // Only fetch notebooks owned by the current admin user
      // This ensures admin cannot see/toggle shared notebooks they don't own
      const { data, error } = await supabase
        .from('notebooks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error('Lỗi load danh sách notebooks: ' + error.message);
      }
      return data || [];
    },
    enabled: !!userId,
  });
}

// ============================================================================
// Component
// ============================================================================

const PublicNotebooksView: React.FC = () => {
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const { user } = useAuth();
  const { mutate, isPending } = useCreateNotebook();
  const { data: notebooks, isLoading } = useAdminNotebooks(user?.id);
  const { mutate: deleteNb, isPending: isDeleting } = useDeleteNotebook();
  const { mutate: toggleVis, isPending: isToggling } = useToggleVisibility();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Vui lòng nhập tên notebook');
      return;
    }

    mutate({ title, visibility }, {
      onSuccess: () => {
        setTitle('');
        setVisibility('public');
      },
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa Notebook này? Toàn bộ dữ liệu liên quan sẽ bị xóa.")) {
      deleteNb({ notebook_id: id });
    }
  };

  const handleToggleVisibility = (notebookId: string, currentVisibility: string) => {
    const newVisibility = currentVisibility === 'public' ? 'private' : 'public';
    toggleVis({ notebook_id: notebookId, visibility: newVisibility });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">
          Quản lý Notebooks
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tạo và quản lý các notebook dùng chung cho toàn bộ công ty (SOP, Policies)
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-sm max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
            <Newspaper className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-medium text-foreground">Tạo Notebook Mới</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Tên Notebook</Label>
            <Input
              id="title"
              placeholder="VD: Sổ tay Nhân viên 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
              maxLength={100}
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Chế độ hiển thị</Label>
            <Select
              value={visibility}
              onValueChange={(value: 'public' | 'private') => setVisibility(value)}
              disabled={isPending}
            >
              <SelectTrigger id="visibility" className="bg-background/50">
                <SelectValue placeholder="Chọn chế độ hiển thị" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <span className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-500" />
                    Public — Toàn bộ công ty có thể xem
                  </span>
                </SelectItem>
                <SelectItem value="private">
                  <span className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                    Private — Chỉ admin có thể xem
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={isPending || !title.trim()} className="w-full sm:w-auto">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang tạo...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Tạo Notebook
              </>
            )}
          </Button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Danh sách Notebooks</h2>
        
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : notebooks && notebooks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notebooks.map((nb) => (
              <div 
                key={nb.id} 
                className="group relative flex flex-col justify-between bg-card hover:bg-muted/50 transition-colors border border-border/50 rounded-xl p-5 shadow-sm overflow-hidden"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                      <Book className="h-5 w-5" />
                    </div>
                    <Badge
                      variant={nb.visibility === 'public' ? 'default' : 'secondary'}
                      className={
                        nb.visibility === 'public'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      {nb.visibility === 'public' ? (
                        <><Eye className="h-3 w-3 mr-1" /> Public</>
                      ) : (
                        <><EyeOff className="h-3 w-3 mr-1" /> Private</>
                      )}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                    {nb.title}
                  </h3>
                  {nb.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {nb.description}
                    </p>
                  )}
                </div>
                
                <div className="pt-4 mt-4 border-t border-border/50 flex items-center justify-between gap-2">
                  {/* Visibility Toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`visibility-${nb.id}`}
                      checked={nb.visibility === 'public'}
                      disabled={isToggling}
                      onCheckedChange={() => handleToggleVisibility(nb.id, nb.visibility)}
                      aria-label={`Toggle visibility for ${nb.title}`}
                    />
                    <Label htmlFor={`visibility-${nb.id}`} className="text-xs text-muted-foreground cursor-pointer">
                      {nb.visibility === 'public' ? 'Public' : 'Private'}
                    </Label>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground px-3"
                      onClick={() => handleDelete(nb.id)}
                      disabled={isDeleting}
                      title="Xóa notebook"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="group-hover:bg-primary group-hover:text-primary-foreground"
                      onClick={() => navigate(`/notebook/${nb.id}`)}
                    >
                      Truy cập <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted/20 border border-dashed rounded-xl">
            <Newspaper className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-medium text-foreground">Chưa có Notebook</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1">
              Notebook tạo ở trên sẽ xuất hiện tại đây.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicNotebooksView;
