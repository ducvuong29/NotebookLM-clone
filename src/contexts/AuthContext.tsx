
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateAuthState = (newSession: Session | null) => {
    console.log('AuthContext: Updating auth state:', newSession?.user?.email || 'No session');
    setSession(newSession);
    setUser(newSession?.user ?? null);
    
    // Clear any previous errors on successful auth
    if (newSession && error) {
      setError(null);
    }
  };

  const clearAuthState = () => {
    console.log('AuthContext: Clearing auth state');
    setSession(null);
    setUser(null);
    setError(null);
  };

  const signOut = async () => {
    try {
      console.log('AuthContext: Starting logout process...');
      
      // Clear local state immediately to provide instant feedback
      clearAuthState();
      
      // Attempt to sign out from server
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.log('AuthContext: Logout error:', error);
        
        // If session is invalid on server, we've already cleared local state
        if (error.message.includes('session_not_found') || 
            error.message.includes('Session not found') ||
            error.status === 403) {
          console.log('AuthContext: Session already invalid on server');
          return;
        }
        
        // For other errors, still ensure local session is cleared
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }
      
      console.log('AuthContext: Logout successful');
    } catch (err) {
      console.error('AuthContext: Unexpected logout error:', err);
      
      // Even if there's an error, try to clear local session
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (localError) {
        console.error('AuthContext: Failed to clear local session:', localError);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        
        console.log('AuthContext: Auth state changed:', event, newSession?.user?.email || 'No session');
        
        // Handle sign out events
        if (event === 'SIGNED_OUT') {
          clearAuthState();
          setLoading(false);
          return;
        }
        
        // Handle sign in events
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          updateAuthState(newSession);
          setLoading(false);
          return;
        }
        
        // For other events, update state if there's an actual change
        if (session?.access_token !== newSession?.access_token) {
          updateAuthState(newSession);
          if (loading) setLoading(false);
        }
      }
    );

    const initializeAuth = async () => {
      try {
        console.log('AuthContext: Initializing auth...');
        
        // Get initial session
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('AuthContext: Error getting initial session:', sessionError);
          
          // If the session is invalid, clear local state
          if (sessionError.message.includes('session_not_found') || 
              sessionError.message.includes('Session not found')) {
            console.log('AuthContext: Session not found on server, clearing local session');
            await supabase.auth.signOut({ scope: 'local' });
            if (mounted) {
              clearAuthState();
              setLoading(false);
            }
            return;
          }
          
          if (mounted) {
            setError(sessionError.message);
            setLoading(false);
          }
          return;
        }
        
        if (mounted) {
          console.log('AuthContext: Initial session:', initialSession?.user?.email || 'No session');
          updateAuthState(initialSession);
          setLoading(false);
        }
      } catch (err) {
        console.error('AuthContext: Auth initialization error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Authentication error');
          setLoading(false);
        }
      }
    };

    // Initialize auth state after setting up listener
    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array to run only once

  const value: AuthContextType = {
    user,
    session,
    loading,
    error,
    isAuthenticated: !!user && !!session,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
