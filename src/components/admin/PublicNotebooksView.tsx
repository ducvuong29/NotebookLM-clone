import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Newspaper, Plus, Loader2, Book, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// Types & API Call
// ============================================================================

interface CreatePublicNotebookPayload {
  title: string;
}

interface CreatePublicNotebookResponse {
  notebook_id: string;
}

interface AdminApiError {
  error: true;
  code: string;
  message: string;
}

async function createPublicNotebook(payload: CreatePublicNotebookPayload): Promise<CreatePublicNotebookResponse> {
  const { data, error } = await supabase.functions.invoke<
    { data: CreatePublicNotebookResponse } | AdminApiError
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

  const successData = data as { data: CreatePublicNotebookResponse };
  return successData.data;
}

interface DeletePublicNotebookPayload {
  notebook_id: string;
}

interface DeletePublicNotebookResponse {
  success: boolean;
}

async function deletePublicNotebook(payload: DeletePublicNotebookPayload): Promise<DeletePublicNotebookResponse> {
  const { data, error } = await supabase.functions.invoke<
    { data: DeletePublicNotebookResponse } | AdminApiError
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

  const successData = data as { data: DeletePublicNotebookResponse };
  return successData.data;
}

// ============================================================================
// Hook
// ============================================================================

function useCreatePublicNotebook() {
  const queryClient = useQueryClient();

  return useMutation<CreatePublicNotebookResponse, Error, CreatePublicNotebookPayload>({
    mutationFn: createPublicNotebook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-notebooks'] });
      toast.success('✅ Tạo notebook public thành công!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Có lỗi xảy ra khi tạo notebook');
    },
  });
}

function useDeletePublicNotebook() {
  const queryClient = useQueryClient();

  return useMutation<DeletePublicNotebookResponse, Error, DeletePublicNotebookPayload>({
    mutationFn: deletePublicNotebook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-notebooks'] });
      toast.success('✅ Đã xóa notebook public!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Có lỗi xảy ra khi xoá notebook');
    },
  });
}

function usePublicNotebooks() {
  return useQuery({
    queryKey: ['public-notebooks'],
    queryFn: async () => {
      // Vì đang trong trang Admin, có thể RLS sẽ cần Admin-API nếu policy không cho phép.
      // Nhưng ta sẽ thử gọi trực tiếp trước, nếu RLS chặn thì sẽ dùng admin-api
      const { data, error } = await supabase
        .from('notebooks')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error('Lỗi load danh sách public notebooks: ' + error.message);
      }
      return data || [];
    }
  });
}

// ============================================================================
// Component
// ============================================================================

const PublicNotebooksView: React.FC = () => {
  const [title, setTitle] = useState('');
  const { mutate, isPending } = useCreatePublicNotebook();
  const { data: notebooks, isLoading } = usePublicNotebooks();
  const { mutate: deletePublicNb, isPending: isDeleting } = useDeletePublicNotebook();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Vui lòng nhập tên notebook');
      return;
    }

    mutate({ title }, {
      onSuccess: () => setTitle('') // Clear form on success
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa Public Notebook này? Toàn bộ dữ liệu liên quan sẽ bị xóa.")) {
      deletePublicNb({ notebook_id: id });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">
          Public Notebooks
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
        <h2 className="text-xl font-semibold text-foreground">Danh sách đã tạo</h2>
        
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
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
                
                <div className="pt-4 mt-4 border-t border-border/50 flex justify-end gap-2">
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
                    className="flex-1 justify-center group-hover:bg-primary group-hover:text-primary-foreground"
                    onClick={() => navigate(`/notebook/${nb.id}`)}
                  >
                    Truy cập <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted/20 border border-dashed rounded-xl">
            <Newspaper className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-medium text-foreground">Chưa có Notebook Public</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1">
              Notebook dùng chung tạo ở trên sẽ xuất hiện tại đây.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicNotebooksView;
