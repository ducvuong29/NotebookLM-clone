import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ============================================================================
// useRealtimeMembership — Subscribe to membership changes via Supabase Realtime
// Single channel per user session (client-event-listeners)
// Listens for INSERT/DELETE on notebook_members filtered by current user
// ============================================================================

export function useRealtimeMembership() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    console.log('[useRealtimeMembership] Setting up subscription for user:', user.id);

    const channel = supabase
      .channel(`membership-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT/DELETE/UPDATE)
          schema: 'public',
          table: 'notebook_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useRealtimeMembership] Membership change received:', payload);

          // Invalidate notebooks queries to recalculate "Shared with me"
          queryClient.invalidateQueries({ queryKey: ['notebooks'] });
          queryClient.invalidateQueries({ queryKey: ['my-memberships'] });

          if (payload.eventType === 'INSERT') {
            // Show toast notification using direct-access wording
            toast.info('📁 Được thêm vào Notebook mới!', {
              description: 'Một người dùng đã thêm bạn vào chia sẻ notebook.',
            });
          } else if (payload.eventType === 'DELETE') {
            toast.info('🚫 Mất quyền truy cập!', {
              description: 'Bạn đã bị xoá khỏi một notebook chia sẻ.',
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[useRealtimeMembership] Subscription status:', status);
      });

    return () => {
      console.log('[useRealtimeMembership] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAuthenticated, queryClient]);
}
