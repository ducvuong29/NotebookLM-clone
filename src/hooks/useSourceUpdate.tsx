
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export const useSourceUpdate = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const updateSource = useMutation({
    mutationFn: async ({ sourceId, title }: { sourceId: string; title: string }) => {
      console.log('Updating source:', sourceId, 'with title:', title);
      
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
      
      console.log('Source updated successfully');
      return data;
    },
    onSuccess: () => {
      console.log('Update mutation success, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      toast({
        title: "Đã đổi tên nguồn",
        description: "Nguồn đã được đổi tên thành công.",
      });
    },
    onError: (error) => {
      console.error('Update mutation error:', error);
      toast({
        title: "Lỗi",
        description: "Không thể đổi tên nguồn. Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  return {
    updateSource: updateSource.mutate,
    isUpdating: updateSource.isPending,
  };
};
