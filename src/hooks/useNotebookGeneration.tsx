import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useNotebookGeneration = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const generateNotebookContent = useMutation({
    mutationFn: async ({
      notebookId,
      filePath,
      sourceType,
    }: {
      notebookId: string;
      filePath?: string;
      sourceType: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-notebook-content', {
        body: {
          notebookId,
          filePath,
          sourceType,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
      queryClient.invalidateQueries({ queryKey: ['notebook'] });

      toast({
        title: "\u0110\u00e3 t\u1ea1o n\u1ed9i dung",
        description: "Ti\u00eau \u0111\u1ec1 v\u00e0 m\u00f4 t\u1ea3 notebook \u0111\u00e3 \u0111\u01b0\u1ee3c t\u1ea1o th\u00e0nh c\u00f4ng.",
      });
    },
    onError: (error) => {
      console.error('Notebook generation failed:', error);

      toast({
        title: "T\u1ea1o th\u1ea5t b\u1ea1i",
        description: "Kh\u00f4ng th\u1ec3 t\u1ea1o n\u1ed9i dung notebook. Vui l\u00f2ng th\u1eed l\u1ea1i.",
        variant: "destructive",
      });
    },
  });

  return {
    generateNotebookContent: generateNotebookContent.mutate,
    generateNotebookContentAsync: generateNotebookContent.mutateAsync,
    isGenerating: generateNotebookContent.isPending,
  };
};
