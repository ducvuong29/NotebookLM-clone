
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
        console.log('No user found, returning empty notebooks array');
        return [];
      }
      
      console.log('Fetching notebooks for user:', user.id);
      
      // PERF-001: Single query with embedded source count (eliminates N+1 pattern)
      // PostgREST uses FK sources.notebook_id → notebooks.id for LEFT JOIN + GROUP BY
      // Returns: { ...notebook, sources: [{ count: N }] } — same shape as before
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

      console.log('Fetched notebooks:', data?.length || 0);
      return data || [];
    },
    enabled: isAuthenticated && !authLoading,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error?.message?.includes('JWT') || error?.message?.includes('auth')) {
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
      return new Set(data?.map(m => m.notebook_id) ?? []);
    },
    enabled: !!user?.id,
  });

  // Set up real-time subscription for notebooks updates
  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    console.log('Setting up real-time subscription for notebooks');

    const channel = supabase
      .channel('notebooks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notebooks',
        },
        (payload) => {
          console.log('Real-time notebook update received:', payload);
          
          // Invalidate and refetch notebooks when any change occurs
          queryClient.invalidateQueries({ queryKey: ['notebooks', user.id] });
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAuthenticated, queryClient]);

  const createNotebook = useMutation({
    mutationFn: async (notebookData: { title: string; description?: string }) => {
      console.log('Creating notebook with data:', notebookData);
      console.log('Current user:', user?.id);
      
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
      
      console.log('Notebook created successfully:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('Mutation success, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['notebooks', user?.id] });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
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
