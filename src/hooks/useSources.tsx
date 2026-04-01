
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotebookGeneration } from './useNotebookGeneration';
import { useEffect } from 'react';

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
      
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('notebook_id', notebookId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!notebookId,
  });

  // Set up Realtime subscription for sources table
  useEffect(() => {
    if (!notebookId || !user) return;

    // [perf] Channel name is unique per notebook — prevents race conditions when
    // multiple tabs or notebooks are open simultaneously sharing the same channel.
    const channel = supabase
      .channel(`sources-changes-${notebookId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'sources',
          filter: `notebook_id=eq.${notebookId}`
        },
        (payload: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
          // Update the query cache based on the event type
          queryClient.setQueryData(['sources', notebookId], (oldSources: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] = []) => {
            switch (payload.eventType) {
              case 'INSERT': {
                const newSource = payload.new as any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
                const existsInsert = oldSources.some(source => source.id === newSource?.id);
                // Deduplicate: Realtime may fire after optimistic insert from addSource.onSuccess
                if (existsInsert) return oldSources;
                return [newSource, ...oldSources];
              }

              case 'UPDATE': {
                const updatedSource = payload.new as any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
                return oldSources.map(source =>
                  source.id === updatedSource?.id ? updatedSource : source
                );
              }

              case 'DELETE': {
                const deletedSource = payload.old as any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
                return oldSources.filter(source => source.id !== deletedSource?.id);
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
      type: 'pdf' | 'text' | 'website' | 'youtube' | 'audio';
      content?: string;
      url?: string;
      file_path?: string;
      file_size?: number;
      processing_status?: string;
      metadata?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('sources')
        .insert({
          notebook_id: sourceData.notebookId,
          title: sourceData.title,
          type: sourceData.type,
          content: sourceData.content,
          url: sourceData.url,
          file_path: sourceData.file_path,
          file_size: sourceData.file_size,
          processing_status: sourceData.processing_status,
          metadata: sourceData.metadata || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (newSource) => {
      console.log('Source added successfully:', newSource);
      
      // Immediately update the query cache so the UI reflects the new source instantly
      queryClient.setQueryData(['sources', notebookId], (oldSources: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] = []) => {
        // Only add if it doesn't exist
        if (!oldSources.some(s => s.id === newSource.id)) {
          return [newSource, ...oldSources];
        }
        return oldSources;
      });
      
      // The Realtime subscription will ALSO handle updating the cache, but this avoids race conditions
      const currentSources = queryClient.getQueryData(['sources', notebookId]) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] || [];
      const isFirstSource = currentSources.length === 1; // It includes the newly added source now
      
      if (isFirstSource && notebookId) {
        console.log('This is the first source, checking notebook generation status...');
        
        // Check notebook generation status
        const { data: notebook } = await supabase
          .from('notebooks')
          .select('generation_status')
          .eq('id', notebookId)
          .single();
        
        if (notebook?.generation_status === 'pending') {
          console.log('Triggering notebook content generation...');
          
          // Determine if we can trigger generation based on source type and available data
          const canGenerate = 
            (newSource.type === 'pdf' && newSource.file_path) ||
            (newSource.type === 'text' && newSource.content) ||
            (newSource.type === 'website' && newSource.url) ||
            (newSource.type === 'youtube' && newSource.url) ||
            (newSource.type === 'audio' && newSource.file_path);
          
          if (canGenerate) {
            try {
              // Fire and forget, don't block mutation
              generateNotebookContentAsync({
                notebookId,
                filePath: newSource.file_path || newSource.url,
                sourceType: newSource.type
              }).catch(error => {
                console.error('Failed to generate notebook content:', error);
              });
            } catch (error) {
              console.error('Failed to start generating notebook content:', error);
            }
          } else {
            console.log('Source not ready for generation yet - missing required data');
          }
        }
      }
    },
  });

  const updateSource = useMutation({
    mutationFn: async ({ sourceId, updates }: { 
      sourceId: string; 
      updates: { 
        title?: string;
        file_path?: string;
        processing_status?: string;
      }
    }) => {
      const { data, error } = await supabase
        .from('sources')
        .update(updates)
        .eq('id', sourceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (updatedSource) => {
      // Immediately update the query cache
      queryClient.setQueryData(['sources', notebookId], (oldSources: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] = []) => {
        return oldSources.map(source => 
          source.id === updatedSource.id ? { ...source, ...updatedSource } : source
        );
      });
      
      // If file_path was added and this is the first source, trigger generation
      if (updatedSource.file_path && notebookId) {
        const currentSources = queryClient.getQueryData(['sources', notebookId]) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */[] || [];
        const isFirstSource = currentSources.length === 1;
        
        if (isFirstSource) {
          const { data: notebook } = await supabase
            .from('notebooks')
            .select('generation_status')
            .eq('id', notebookId)
            .single();
          
          if (notebook?.generation_status === 'pending') {
            console.log('File path updated, triggering notebook content generation...');
            
            try {
              // Fire and forget
              generateNotebookContentAsync({
                notebookId,
                filePath: updatedSource.file_path,
                sourceType: updatedSource.type
              }).catch(error => {
                console.error('Failed to generate notebook content:', error);
              });
            } catch (error) {
              console.error('Failed to start generating notebook content:', error);
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
