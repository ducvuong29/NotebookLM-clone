import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UseIsAdminResult {
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useIsAdmin(): UseIsAdminResult {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const {
    data: isAdmin = false,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin-status', user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;

      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (queryError) {
        console.error('[useIsAdmin] Profile query error:', queryError);
        throw queryError;
      }

      return data?.role === 'admin';
    },
    enabled: isAuthenticated && !authLoading && !!user,
    staleTime: 5 * 60 * 1000, // 5 min cache — admin status rarely changes
    retry: (failureCount, err) => {
      // Don't retry on auth errors
      if (err?.message?.includes('JWT') || err?.message?.includes('auth')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  return {
    isAdmin,
    isLoading: authLoading || isLoading,
    error: error?.message || null,
  };
}
