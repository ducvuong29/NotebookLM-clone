import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { ToastAction } from '@/components/ui/toast';
import React from 'react';

export const useGenerateFlowchart = (notebookId?: string) => {
  const { toast } = useToast();

  const generateFlowchart = useMutation({
    mutationFn: async ({ sourceId, force = false }: { sourceId: string; force?: boolean }) => {
      if (!notebookId) throw new Error('notebookId is required');
      const { data, error } = await supabase.functions.invoke('generate-flowchart', {
        body: { notebook_id: notebookId, source_id: sourceId, force },
      });
      if (error) {
        throw error;
      }
      return data as { flowchart_id: string; status: string; message?: string };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any, variables) => {
      console.error("Flowchart generation error:", error);
      
      const status = error?.context?.status;
      const body = error?.context?.body;
      const message = body?.error || error.message;

      if (status === 409 && body?.status === 'generating') {
        toast({
          title: "Đang tạo sơ đồ",
          description: "Sơ đồ đang được tạo. Vui lòng chờ.",
          variant: "default",
        });
      } else if (status === 409 && body?.status === 'exists') {
        toast({
          title: "Sơ đồ đã tồn tại",
          description: "Sơ đồ này đã được tạo trước đó.",
          variant: "default",
        });
      } else if (status === 400 && body?.error === 'Source is not processed yet') {
        toast({
          title: "Tài liệu chưa xử lý",
          description: "Tài liệu chưa xử lý xong. Vui lòng chờ.",
          variant: "destructive",
        });
      } else if (status === 403) {
        toast({
          title: "Không có quyền",
          description: "Bạn không có quyền tạo sơ đồ cho notebook này.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Lỗi tạo sơ đồ",
          description: message || "Không thể tạo sơ đồ. Vui lòng thử lại.",
          variant: "destructive",
          action: (
            <ToastAction altText="Thử lại" onClick={() => generateFlowchart.mutate(variables)}>
              Thử lại
            </ToastAction>
          ),
        });
      }
    },
  });

  return {
    generateFlowchart: generateFlowchart.mutate,
    generateFlowchartAsync: generateFlowchart.mutateAsync,
    isGenerating: generateFlowchart.isPending,
  };
};
