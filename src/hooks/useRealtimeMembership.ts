import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ============================================================================
// useRealtimeMembership â€” Subscribe to membership changes via Supabase Realtime
// Single channel per user session (client-event-listeners)
// Listens for INSERT/DELETE on notebook_members filtered by current user
// ============================================================================

export function useRealtimeMembership() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    const channel = supabase
      .channel(`membership-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notebook_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['notebooks'] });
          queryClient.invalidateQueries({ queryKey: ['my-memberships'] });

          if (payload.eventType === 'INSERT') {
            toast.info('\ud83d\udcc1 \u0110\u01b0\u1ee3c th\u00eam v\u00e0o Notebook m\u1edbi!', {
              description: 'M\u1ed9t ng\u01b0\u1eddi d\u00f9ng \u0111\u00e3 th\u00eam b\u1ea1n v\u00e0o chia s\u1ebb notebook.',
            });
          } else if (payload.eventType === 'DELETE') {
            toast.info('\ud83d\udeab M\u1ea5t quy\u1ec1n truy c\u1eadp!', {
              description: 'B\u1ea1n \u0111\u00e3 b\u1ecb xo\u00e1 kh\u1ecfi m\u1ed9t notebook chia s\u1ebb.',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAuthenticated, queryClient]);
}
