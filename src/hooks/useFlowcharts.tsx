import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useCallback } from 'react';
import { useToast } from './use-toast';
import type { Database } from '@/integrations/supabase/types';

type FlowchartRow = Database['public']['Tables']['flowcharts']['Row'];
type FlowchartRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: FlowchartRow;
  old: FlowchartRow;
};

export const useFlowcharts = (notebookId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const {
    data: flowcharts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['flowcharts', notebookId],
    queryFn: async () => {
      if (!notebookId) return [];

      const { data, error: queryError } = await supabase
        .from('flowcharts')
        .select('*')
        .eq('notebook_id', notebookId)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      return (data ?? []) as FlowchartRow[];
    },
    enabled: !!notebookId && !!user,
  });

  useEffect(() => {
    if (!notebookId || !user) return;

    const channel = supabase
      .channel(`flowcharts-changes-${notebookId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flowcharts',
          filter: `notebook_id=eq.${notebookId}`,
        },
        (payload) => {
          const fcPayload = payload as unknown as FlowchartRealtimePayload;

          queryClient.setQueryData<FlowchartRow[]>(['flowcharts', notebookId], (old = []) => {
            switch (fcPayload.eventType) {
              case 'INSERT': {
                const newFc = fcPayload.new;
                const exists = old.some((fc) => fc.id === newFc.id);
                if (exists) return old;
                return [newFc, ...old];
              }

              case 'UPDATE': {
                const updatedFc = fcPayload.new;
                const oldFc = fcPayload.old;
                
                // Toast on completion
                if (
                  oldFc.generation_status === 'generating' &&
                  updatedFc.generation_status === 'completed'
                ) {
                  toastRef.current({ title: "Sơ đồ đã tạo xong!", variant: "default" });
                } else if (
                  oldFc.generation_status === 'generating' &&
                  updatedFc.generation_status === 'failed'
                ) {
                  toastRef.current({
                    title: "Lỗi tạo sơ đồ",
                    description: updatedFc.error_message || "Không thể tạo sơ đồ. Vui lòng thử lại.",
                    variant: "destructive",
                  });
                }
                
                return old.map((fc) =>
                  fc.id === updatedFc.id ? updatedFc : fc
                );
              }

              case 'DELETE': {
                const deletedFc = fcPayload.old;
                return old.filter((fc) => fc.id !== deletedFc.id);
              }

              default:
                return old;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notebookId, user, queryClient]);

  const saveFlowchart = useMutation({
    mutationFn: async ({ id, mermaid_code, title, summary }: {
      id: string; mermaid_code: string; title?: string; summary?: string;
    }) => {
      const { error } = await supabase
        .from('flowcharts')
        .update({ mermaid_code, title, summary })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate cache sau khi lưu để đảm bảo data luôn đồng bộ với DB,
      // không phụ thuộc hoàn toàn vào Realtime subscription (có thể bị trễ/mất kết nối).
      // Điều này đặc biệt quan trọng để reset isDirty state sau khi save thành công.
      queryClient.invalidateQueries({ queryKey: ['flowcharts', notebookId] });
    },
  });

  return {
    flowcharts,
    isLoading,
    error,
    saveFlowchart,
    getFlowchartBySourceId: useCallback(
      (sourceId: string) => flowcharts.find((f) => f.source_id === sourceId) ?? null,
      [flowcharts]
    ),
  };
};
