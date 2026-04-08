import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseFlowchartAIParams {
  instruction: string;
  current_mermaid_code: string;
  source_id?: string;
  notebook_id?: string;
}

interface UseFlowchartAIResponse {
  mermaid_code: string;
}

export function useFlowchartAI() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: UseFlowchartAIParams) => {
      const { data, error } = await supabase.functions.invoke<UseFlowchartAIResponse>(
        'edit-flowchart',
        {
          body: params,
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.mermaid_code) {
        throw new Error('Không nhận được mã Mermaid hợp lệ từ AI');
      }

      return data.mermaid_code;
    },
    onError: (error) => {
      console.error('Lỗi khi chỉnh sửa sơ đồ bằng AI:', error);
      toast({
        title: 'Lỗi khi chỉnh sửa sơ đồ',
        description: error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Hãy thử lại sau.',
        variant: 'destructive',
      });
    },
  });
}
