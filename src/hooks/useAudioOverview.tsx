
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type NotebookRow = Database['public']['Tables']['notebooks']['Row'];

export const useAudioOverview = (notebookId?: string) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // BUG-05 fix: toast creates a new ref every render → putting it in useEffect deps
  // causes subscribe/unsubscribe churn on every render, exhausting Realtime connections.
  // useRef lets callbacks access the latest toast without re-triggering the effect.
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Set up realtime subscription for notebook updates
  useEffect(() => {
    if (!notebookId) return;

    const channel = supabase
      .channel(`notebook-audio-updates-${notebookId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notebooks',
          filter: `id=eq.${notebookId}`
        },
        (payload) => {
          const newData = payload.new as NotebookRow;
          
          if (newData.audio_overview_generation_status) {
            setGenerationStatus(newData.audio_overview_generation_status);
            
            if (newData.audio_overview_generation_status === 'completed' && newData.audio_overview_url) {
              setIsGenerating(false);
              toastRef.current({
                title: "Tổng quan Âm thanh đã sẵn sàng!",
                description: "Cuộc trò chuyện chuyên sâu đã sẵn sàng để phát!",
              });
              
              // Invalidate queries to refresh the UI
              queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            } else if (newData.audio_overview_generation_status === 'failed') {
              setIsGenerating(false);
              toastRef.current({
                title: "Tạo thất bại",
                description: "Không thể tạo tổng quan âm thanh. Vui lòng thử lại.",
                variant: "destructive",
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notebookId, queryClient]);

  const generateAudioOverview = useMutation({
    mutationFn: async (notebookId: string) => {
      setIsGenerating(true);
      setGenerationStatus('generating');
      
      const { data, error } = await supabase.functions.invoke('generate-audio-overview', {
        body: { notebookId }
      });

      if (error) {
        console.error('Error starting audio generation:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => undefined,
    onError: (error) => {
      console.error('Audio generation failed to start:', error);
      setIsGenerating(false);
      setGenerationStatus(null);
      
      toast({
        title: "Không thể bắt đầu tạo",
        description: error.message || "Không thể bắt đầu tạo âm thanh. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  });

  const refreshAudioUrl = useMutation({
    mutationFn: async ({ notebookId, silent = false }: { notebookId: string; silent?: boolean }) => {
      if (!silent) {
        setIsAutoRefreshing(true);
      }

      const { data, error } = await supabase.functions.invoke('refresh-audio-url', {
        body: { notebookId }
      });

      if (error) {
        console.error('Error refreshing audio URL:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refresh the UI with new URL
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
      
      if (!variables.silent) {
        setIsAutoRefreshing(false);
      }
    },
    onError: (error, variables) => {
      console.error('Failed to refresh audio URL:', error);
      if (!variables.silent) {
        setIsAutoRefreshing(false);
        toast({
          title: "Không thể làm mới URL",
          description: "Không thể làm mới URL âm thanh. Vui lòng thử lại.",
          variant: "destructive",
        });
      }
    }
  });

  const checkAudioExpiry = (expiresAt: string | null): boolean => {
    if (!expiresAt) return true;
    return new Date(expiresAt) <= new Date();
  };

  const autoRefreshIfExpired = async (notebookId: string, expiresAt: string | null) => {
    if (checkAudioExpiry(expiresAt) && !isAutoRefreshing && !refreshAudioUrl.isPending) {
      try {
        await refreshAudioUrl.mutateAsync({ notebookId, silent: true });
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }
  };

  return {
    generateAudioOverview: generateAudioOverview.mutate,
    refreshAudioUrl: (notebookId: string) => refreshAudioUrl.mutate({ notebookId }),
    autoRefreshIfExpired,
    isGenerating: isGenerating || generateAudioOverview.isPending,
    isAutoRefreshing,
    generationStatus,
    checkAudioExpiry,
  };
};
