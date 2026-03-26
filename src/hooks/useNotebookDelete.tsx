
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export const useNotebookDelete = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const deleteNotebook = useMutation({
    mutationFn: async (notebookId: string) => {
      console.log('Starting notebook deletion process for:', notebookId);
      
      try {
        // First, get the notebook details for better error reporting
        const { data: notebook, error: fetchError } = await supabase
          .from('notebooks')
          .select('id, title')
          .eq('id', notebookId)
          .single();

        if (fetchError) {
          console.error('Error fetching notebook:', fetchError);
          throw new Error('Failed to find notebook');
        }

        console.log('Found notebook to delete:', notebook.title);

        // Get all sources for this notebook to delete their files
        const { data: sources, error: sourcesError } = await supabase
          .from('sources')
          .select('id, title, file_path, type')
          .eq('notebook_id', notebookId);

        if (sourcesError) {
          console.error('Error fetching sources for notebook:', sourcesError);
          throw new Error('Failed to fetch sources for cleanup');
        }

        console.log(`Found ${sources?.length || 0} sources to clean up`);

        // Delete all files from storage for sources that have file_path
        const filesToDelete = sources?.filter(source => source.file_path).map(source => source.file_path) || [];
        
        if (filesToDelete.length > 0) {
          console.log('Deleting files from storage:', filesToDelete);
          
          const { error: storageError } = await supabase.storage
            .from('sources')
            .remove(filesToDelete);

          if (storageError) {
            console.error('Error deleting files from storage:', storageError);
            // Don't throw here - we still want to delete the notebook
            // even if some files can't be deleted (they might already be gone)
          } else {
            console.log('All files deleted successfully from storage');
          }
        } else {
          console.log('No files to delete from storage (URL-based sources or no file_paths)');
        }

        // Delete the notebook - this will cascade delete all sources
        const { error: deleteError } = await supabase
          .from('notebooks')
          .delete()
          .eq('id', notebookId);

        if (deleteError) {
          console.error('Error deleting notebook:', deleteError);
          throw deleteError;
        }
        
        console.log('Notebook deleted successfully with cascade deletion');
        return notebook;
      } catch (error) {
        console.error('Error in deletion process:', error);
        throw error;
      }
    },
    onSuccess: (deletedNotebook, notebookId) => {
      console.log('Delete mutation success, invalidating queries');
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['notebooks', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['public-notebooks'] });
      queryClient.invalidateQueries({ queryKey: ['sources', notebookId] });
      queryClient.invalidateQueries({ queryKey: ['notebook', notebookId] });
      
      toast({
        title: "Đã xóa notebook",
        description: `"${deletedNotebook?.title || 'Notebook'}" và toàn bộ nguồn đã được xóa thành công.`,
      });
    },
    onError: (error: any) => {
      console.error('Delete mutation error:', error);
      
      let errorMessage = "Không thể xóa notebook. Vui lòng thử lại.";
      
      // Provide more specific error messages based on the error type
      if (error?.code === 'PGRST116') {
        errorMessage = "Không tìm thấy notebook hoặc bạn không có quyền xóa.";
      } else if (error?.message?.includes('foreign key')) {
        errorMessage = "Không thể xóa notebook do có dữ liệu liên quan. Vui lòng liên hệ hỗ trợ.";
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
    deleteNotebook: deleteNotebook.mutate,
    isDeleting: deleteNotebook.isPending,
  };
};
