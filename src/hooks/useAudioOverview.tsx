
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useAudioOverview = (notebookId?: string) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Set up realtime subscription for notebook updates
  useEffect(() => {
    if (!notebookId) return;

    const channel = supabase
      .channel('notebook-audio-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notebooks',
          filter: `id=eq.${notebookId}`
        },
        (payload) => {
          console.log('Notebook updated:', payload);
          const newData = payload.new as any;
          
          if (newData.audio_overview_generation_status) {
            setGenerationStatus(newData.audio_overview_generation_status);
            
            if (newData.audio_overview_generation_status === 'completed' && newData.audio_overview_url) {
              setIsGenerating(false);
              toast({
                title: "Tổng quan Âm thanh đã sẵn sàng!",
                description: "Cuộc trò chuyện chuyên sâu đã sẵn sàng để phát!",
              });
              
              // Invalidate queries to refresh the UI
              queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            } else if (newData.audio_overview_generation_status === 'failed') {
              setIsGenerating(false);
              toast({
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
  }, [notebookId, toast, queryClient]);

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
    onSuccess: (data, notebookId) => {
      console.log('Audio generation started successfully:', data);
    },
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
    onSuccess: (data, variables) => {
      console.log('Audio URL refreshed successfully:', data);
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
      console.log('Audio URL expired, auto-refreshing...');
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
