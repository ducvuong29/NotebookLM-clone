import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useSourceUpdate = (notebookId?: string) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateSource = useMutation({
    mutationFn: async ({ sourceId, title }: { sourceId: string; title: string }) => {
      const { data, error } = await supabase
        .from('sources')
        .update({ title })
        .eq('id', sourceId)
        .select()
        .single();

      if (error) {
        console.error('Error updating source:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notebookId ? ['sources', notebookId] : ['sources'] });
      toast({
        title: "\u0110\u00e3 \u0111\u1ed5i t\u00ean ngu\u1ed3n",
        description: "Ngu\u1ed3n \u0111\u00e3 \u0111\u01b0\u1ee3c \u0111\u1ed5i t\u00ean th\u00e0nh c\u00f4ng.",
      });
    },
    onError: (error) => {
      console.error('Update mutation error:', error);
      toast({
        title: "L\u1ed7i",
        description: "Kh\u00f4ng th\u1ec3 \u0111\u1ed5i t\u00ean ngu\u1ed3n. Vui l\u00f2ng th\u1eed l\u1ea1i.",
        variant: "destructive",
      });
    },
  });

  return {
    updateSource: updateSource.mutate,
    isUpdating: updateSource.isPending,
  };
};
