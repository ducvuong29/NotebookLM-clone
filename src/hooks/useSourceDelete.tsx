
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export const useSourceDelete = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const deleteSource = useMutation({
    mutationFn: async (sourceId: string) => {
      console.log('Starting source deletion process for:', sourceId);
      
      try {
        // First, get the source details including file information
        const { data: source, error: fetchError } = await supabase
          .from('sources')
          .select('id, title, file_path, type, notebook_id')
          .eq('id', sourceId)
          .single();

        if (fetchError) {
          console.error('Error fetching source:', fetchError);
          throw new Error('Failed to find source');
        }

        console.log('Found source to delete:', source.title, 'with file_path:', source.file_path);

        // Delete the file from storage if it exists
        if (source.file_path) {
          console.log('Deleting file from storage:', source.file_path);
          
          const { error: storageError } = await supabase.storage
            .from('sources')
            .remove([source.file_path]);

          if (storageError) {
            console.error('Error deleting file from storage:', storageError);
            // Don't throw here - we still want to delete the database record
            // even if the file deletion fails (file might already be gone)
          } else {
            console.log('File deleted successfully from storage');
          }
        } else {
          console.log('No file to delete from storage (URL-based source or no file_path)');
        }

        // Delete the source record from the database
        const { error: deleteError } = await supabase
          .from('sources')
          .delete()
          .eq('id', sourceId);

        if (deleteError) {
          console.error('Error deleting source from database:', deleteError);
          throw deleteError;
        }
        
        console.log('Source deleted successfully from database');
        return source;
      } catch (error) {
        console.error('Error in source deletion process:', error);
        throw error;
      }
    },
    onSuccess: (deletedSource) => {
      console.log('Delete mutation success, invalidating queries');
      // BUG-03 fix: Scope invalidation to the specific notebook.
      // Before: ['sources'] matched ALL notebook source caches → 400 tabs refetch.
      // After: ['sources', notebook_id] only refreshes the affected notebook.
      queryClient.invalidateQueries({ queryKey: ['sources', deletedSource?.notebook_id] });
      toast({
        title: "Đã xóa nguồn",
        description: `"${deletedSource?.title || 'Nguồn'}" đã được xóa thành công.`,
      });
    },
    onError: (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
      console.error('Delete mutation error:', error);
      
      let errorMessage = "Không thể xóa nguồn. Vui lòng thử lại.";
      
      // Provide more specific error messages based on the error type
      if (error?.code === 'PGRST116') {
        errorMessage = "Không tìm thấy nguồn hoặc bạn không có quyền xóa.";
      } else if (error?.message?.includes('foreign key')) {
        errorMessage = "Không thể xóa nguồn do có dữ liệu liên quan. Vui lòng liên hệ hỗ trợ.";
      } else if (error?.message?.includes('network')) {
        errorMessage = "Lỗi mạng. Vui lòng kiểm tra kết nối và thử lại.";
      }
      
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  return {
    deleteSource: deleteSource.mutate,
    isDeleting: deleteSource.isPending,
  };
};
