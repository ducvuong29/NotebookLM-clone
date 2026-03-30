
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ============================================================================
// useRealtimeInvitations — Subscribe to new invitations via Supabase Realtime
// Single channel per user session (client-event-listeners)
// Listens for INSERT on notebook_members filtered by current user
// ============================================================================

export function useRealtimeInvitations() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    console.log('[useRealtimeInvitations] Setting up subscription for user:', user.id);

    const channel = supabase
      .channel(`invitations-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notebook_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useRealtimeInvitations] New invitation received:', payload);

          // Invalidate invitations query to refetch
          queryClient.invalidateQueries({ queryKey: ['invitations'] });

          // Show toast notification
          toast.info('📩 Bạn có lời mời mới!', {
            description: 'Kiểm tra phần lời mời cộng tác trên dashboard',
          });
        }
      )
      .subscribe((status) => {
        console.log('[useRealtimeInvitations] Subscription status:', status);
      });

    return () => {
      console.log('[useRealtimeInvitations] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAuthenticated, queryClient]);
}
