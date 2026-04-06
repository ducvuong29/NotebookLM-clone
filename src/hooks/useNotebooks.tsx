import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useNotebooks = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: notebooks = [],
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: ['notebooks', user?.id],
    queryFn: async () => {
      if (!user) {
        return [];
      }

      // PERF-001: Single query with embedded source count (eliminates N+1 pattern)
      // PostgREST uses FK sources.notebook_id â†’ notebooks.id for LEFT JOIN + GROUP BY
      // Returns: { ...notebook, sources: [{ count: N }] } â€” same shape as before
      // RLS handles visibility scoping:
      // - Owner sees own notebooks (user_id = auth.uid())
      // - All authenticated users see public notebooks (visibility = 'public')
      const { data, error: notebooksError } = await supabase
        .from('notebooks')
        .select('*, sources(count)')
        .order('updated_at', { ascending: false });

      if (notebooksError) {
        console.error('Error fetching notebooks:', notebooksError);
        throw notebooksError;
      }

      return data || [];
    },
    enabled: isAuthenticated && !authLoading,
    retry: (failureCount, queryError) => {
      if (queryError?.message?.includes('JWT') || queryError?.message?.includes('auth')) {
        return false;
      }

      return failureCount < 3;
    },
  });

  const { data: myMemberships } = useQuery({
    queryKey: ['my-memberships', user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();

      const { data } = await supabase
        .from('notebook_members')
        .select('notebook_id')
        .eq('user_id', user.id);

      return new Set(data?.map((membership) => membership.notebook_id) ?? []);
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    const channel = supabase
      .channel('notebooks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notebooks',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notebooks', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAuthenticated, queryClient]);

  const createNotebook = useMutation({
    mutationFn: async (notebookData: { title: string; description?: string }) => {
      if (!user) {
        console.error('User not authenticated');
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('notebooks')
        .insert({
          title: notebookData.title,
          description: notebookData.description,
          user_id: user.id,
          generation_status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating notebook:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks', user?.id] });
    },
    onError: (mutationError) => {
      console.error('Mutation error:', mutationError);
    },
  });

  return {
    notebooks,
    myMemberships,
    isLoading: authLoading || isLoading,
    error: error?.message || null,
    isError,
    createNotebook: createNotebook.mutate,
    isCreating: createNotebook.isPending,
  };
};
