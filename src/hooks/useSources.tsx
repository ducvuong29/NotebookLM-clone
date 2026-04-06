import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotebookGeneration } from './useNotebookGeneration';
import { useEffect } from 'react';
import type { Database, Json } from '@/integrations/supabase/types';

type SourceRow = Database['public']['Tables']['sources']['Row'];
type SourceInsert = Database['public']['Tables']['sources']['Insert'];
type SourceUpdate = Database['public']['Tables']['sources']['Update'];
type SourceType = Database['public']['Enums']['source_type'];
type SourceRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: SourceRow;
  old: SourceRow;
};

export const useSources = (notebookId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { generateNotebookContentAsync } = useNotebookGeneration();

  const {
    data: sources = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sources', notebookId],
    queryFn: async () => {
      if (!notebookId) return [];

      const { data, error: queryError } = await supabase
        .from('sources')
        .select('*')
        .eq('notebook_id', notebookId)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      return (data ?? []) as SourceRow[];
    },
    enabled: !!notebookId,
  });

  useEffect(() => {
    if (!notebookId || !user) return;

    const channel = supabase
      .channel(`sources-changes-${notebookId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sources',
          filter: `notebook_id=eq.${notebookId}`,
        },
        (payload) => {
          const sourcePayload = payload as unknown as SourceRealtimePayload;

          queryClient.setQueryData<SourceRow[]>(['sources', notebookId], (oldSources = []) => {
            switch (sourcePayload.eventType) {
              case 'INSERT': {
                const newSource = sourcePayload.new;
                const existsInsert = oldSources.some((source) => source.id === newSource.id);
                if (existsInsert) return oldSources;
                return [newSource, ...oldSources];
              }

              case 'UPDATE': {
                const updatedSource = sourcePayload.new;
                return oldSources.map((source) =>
                  source.id === updatedSource.id ? updatedSource : source
                );
              }

              case 'DELETE': {
                const deletedSource = sourcePayload.old;
                return oldSources.filter((source) => source.id !== deletedSource.id);
              }

              default:
                return oldSources;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notebookId, user, queryClient]);

  const addSource = useMutation({
    mutationFn: async (sourceData: {
      notebookId: string;
      title: string;
      type: SourceType;
      content?: string;
      url?: string;
      file_path?: string;
      file_size?: number;
      processing_status?: string;
      metadata?: Json;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const insertPayload: SourceInsert = {
        notebook_id: sourceData.notebookId,
        title: sourceData.title,
        type: sourceData.type,
        content: sourceData.content,
        url: sourceData.url,
        file_path: sourceData.file_path,
        file_size: sourceData.file_size,
        processing_status: sourceData.processing_status,
        metadata: sourceData.metadata || {},
      };

      const { data, error: mutationError } = await supabase
        .from('sources')
        .insert(insertPayload)
        .select()
        .single();

      if (mutationError) throw mutationError;
      return data as SourceRow;
    },
    onSuccess: async (newSource) => {
      queryClient.setQueryData<SourceRow[]>(['sources', notebookId], (oldSources = []) => {
        if (!oldSources.some((source) => source.id === newSource.id)) {
          return [newSource, ...oldSources];
        }
        return oldSources;
      });

      const currentSources = queryClient.getQueryData<SourceRow[]>(['sources', notebookId]) || [];
      const isFirstSource = currentSources.length === 1;

      if (isFirstSource && notebookId) {
        const { data: notebook } = await supabase
          .from('notebooks')
          .select('generation_status')
          .eq('id', notebookId)
          .single();

        if (notebook?.generation_status === 'pending') {
          const canGenerate =
            (newSource.type === 'pdf' && newSource.file_path) ||
            (newSource.type === 'text' && newSource.content) ||
            (newSource.type === 'website' && newSource.url) ||
            (newSource.type === 'youtube' && newSource.url) ||
            (newSource.type === 'audio' && newSource.file_path);

          if (canGenerate) {
            try {
              generateNotebookContentAsync({
                notebookId,
                filePath: newSource.file_path || newSource.url || undefined,
                sourceType: newSource.type,
              }).catch((generationError) => {
                console.error('Failed to generate notebook content:', generationError);
              });
            } catch (generationError) {
              console.error('Failed to start generating notebook content:', generationError);
            }
          }
        }
      }
    },
  });

  const updateSource = useMutation({
    mutationFn: async ({
      sourceId,
      updates,
    }: {
      sourceId: string;
      updates: {
        title?: string;
        file_path?: string;
        processing_status?: string;
      };
    }) => {
      const updatePayload: SourceUpdate = updates;
      const { data, error: mutationError } = await supabase
        .from('sources')
        .update(updatePayload)
        .eq('id', sourceId)
        .select()
        .single();

      if (mutationError) throw mutationError;
      return data as SourceRow;
    },
    onSuccess: async (updatedSource) => {
      queryClient.setQueryData<SourceRow[]>(['sources', notebookId], (oldSources = []) =>
        oldSources.map((source) =>
          source.id === updatedSource.id ? { ...source, ...updatedSource } : source
        )
      );

      if (updatedSource.file_path && notebookId) {
        const currentSources = queryClient.getQueryData<SourceRow[]>(['sources', notebookId]) || [];
        const isFirstSource = currentSources.length === 1;

        if (isFirstSource) {
          const { data: notebook } = await supabase
            .from('notebooks')
            .select('generation_status')
            .eq('id', notebookId)
            .single();

          if (notebook?.generation_status === 'pending') {
            try {
              generateNotebookContentAsync({
                notebookId,
                filePath: updatedSource.file_path,
                sourceType: updatedSource.type,
              }).catch((generationError) => {
                console.error('Failed to generate notebook content:', generationError);
              });
            } catch (generationError) {
              console.error('Failed to start generating notebook content:', generationError);
            }
          }
        }
      }
    },
  });

  return {
    sources,
    isLoading,
    error,
    addSource: addSource.mutate,
    addSourceAsync: addSource.mutateAsync,
    isAdding: addSource.isPending,
    updateSource: updateSource.mutate,
    isUpdating: updateSource.isPending,
  };
};
