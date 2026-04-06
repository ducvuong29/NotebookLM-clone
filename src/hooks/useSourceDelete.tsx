import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type SourceDeletionRow = Pick<
  Database['public']['Tables']['sources']['Row'],
  'id' | 'title' | 'file_path' | 'type' | 'notebook_id'
>;

export const useSourceDelete = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteSource = useMutation({
    mutationFn: async (sourceId: string) => {
      try {
        const { data: source, error: fetchError } = await supabase
          .from('sources')
          .select('id, title, file_path, type, notebook_id')
          .eq('id', sourceId)
          .single();

        if (fetchError) {
          console.error('Error fetching source:', fetchError);
          throw new Error('Failed to find source');
        }

        const existingSource = source as SourceDeletionRow;

        if (existingSource.file_path) {
          const { error: storageError } = await supabase.storage
            .from('sources')
            .remove([existingSource.file_path]);

          if (storageError) {
            console.error('Error deleting file from storage:', storageError);
          }
        }

        const { error: deleteError } = await supabase
          .from('sources')
          .delete()
          .eq('id', sourceId);

        if (deleteError) {
          console.error('Error deleting source from database:', deleteError);
          throw deleteError;
        }

        return existingSource;
      } catch (error) {
        console.error('Error in source deletion process:', error);
        throw error;
      }
    },
    onSuccess: (deletedSource) => {
      queryClient.invalidateQueries({ queryKey: ['sources', deletedSource?.notebook_id] });
      toast({
        title: "\u0110\u00e3 x\u00f3a ngu\u1ed3n",
        description: `"${deletedSource?.title || 'Ngu\u1ed3n'}" \u0111\u00e3 \u0111\u01b0\u1ee3c x\u00f3a th\u00e0nh c\u00f4ng.`,
      });
    },
    onError: (error: Error & { code?: string }) => {
      console.error('Delete mutation error:', error);

      let errorMessage = "Kh\u00f4ng th\u1ec3 x\u00f3a ngu\u1ed3n. Vui l\u00f2ng th\u1eed l\u1ea1i.";

      if (error?.code === 'PGRST116') {
        errorMessage = "Kh\u00f4ng t\u00ecm th\u1ea5y ngu\u1ed3n ho\u1eb7c b\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n x\u00f3a.";
      } else if (error?.message?.includes('foreign key')) {
        errorMessage = "Kh\u00f4ng th\u1ec3 x\u00f3a ngu\u1ed3n do c\u00f3 d\u1eef li\u1ec7u li\u00ean quan. Vui l\u00f2ng li\u00ean h\u1ec7 h\u1ed7 tr\u1ee3.";
      } else if (error?.message?.includes('network')) {
        errorMessage = "L\u1ed7i m\u1ea1ng. Vui l\u00f2ng ki\u1ec3m tra k\u1ebft n\u1ed1i v\u00e0 th\u1eed l\u1ea1i.";
      }

      toast({
        title: "L\u1ed7i",
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
