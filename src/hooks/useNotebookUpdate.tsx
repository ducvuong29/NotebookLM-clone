import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useNotebookUpdate = () => {
  const queryClient = useQueryClient();

  const updateNotebook = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { title?: string; description?: string };
    }) => {
      const { data, error } = await supabase
        .from('notebooks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating notebook:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notebook', data.id] });
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
    },
  });

  return {
    updateNotebook: updateNotebook.mutate,
    isUpdating: updateNotebook.isPending,
  };
};
