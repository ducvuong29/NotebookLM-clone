import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// Types
// ============================================================================

export type ActivityActionType =
  | 'member_invited'
  | 'member_accepted'
  | 'member_removed'
  | 'role_changed'
  | 'source_added'
  | 'source_deleted'
  | 'source_updated'
  | 'note_updated';

export interface ActivityLogEntry {
  id: string;
  notebook_id: string;
  actor_id: string;
  action_type: ActivityActionType;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
  target_actor?: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

export interface ActivityLogPage {
  entries: ActivityLogEntry[];
  nextCursor: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 20;

// ============================================================================
// Fetcher — Cursor-based pagination via created_at
// ============================================================================
// Uses the composite index (notebook_id, created_at DESC) for O(log N) performance.
// Cursor = created_at of last item → next page fetches rows < cursor.

async function fetchActivityPage(
  notebookId: string,
  cursor?: string,
): Promise<ActivityLogPage> {
  let query = supabase
    .from('activity_log')
    .select('id, notebook_id, actor_id, action_type, metadata, created_at')
    .eq('notebook_id', notebookId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1); // Fetch one extra to determine if there's a next page

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) throw error;

  const entries = (data ?? []) as ActivityLogEntry[];
  const hasMore = entries.length > PAGE_SIZE;

  // Trim the extra row and extract next cursor
  if (hasMore) entries.pop();
  const nextCursor = hasMore && entries.length > 0
    ? entries[entries.length - 1].created_at
    : null;

  // Batch-load profiles (resolving N+1 issue)
  if (entries.length > 0) {
    const actorIds = [...new Set(entries.map((e) => e.actor_id))];
    const targetUserIds = entries
      .map(e => e.metadata?.target_user_id as string | undefined)
      .filter(Boolean) as string[];
    const allProfileIds = [...new Set([...actorIds, ...targetUserIds])];

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, email')
      .in('id', allProfileIds);

    const profileMap = new Map(profilesData?.map((p) => [p.id, p]));
    
    for (const entry of entries) {
      entry.actor = profileMap.get(entry.actor_id) || null;
      if (entry.metadata?.target_user_id) {
        entry.target_actor = profileMap.get(entry.metadata.target_user_id as string) || null;
      }
    }
  }

  return { entries, nextCursor };
}

// ============================================================================
// Hook — useActivityLog
// ============================================================================
// Uses TanStack Query's useInfiniteQuery for:
// - Cursor-based pagination (no offset → no skipped/duplicated rows)
// - Automatic cache management (staleTime: 2 min)
// - Built-in loading/error states
// - getNextPageParam for lazy "Load More" pattern

export function useActivityLog(notebookId: string | undefined) {
  const queryClient = useQueryClient();

  // Setup Realtime subscription
  useEffect(() => {
    if (!notebookId) return;

    const channel = supabase
      .channel(`activity-log-${notebookId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
          filter: `notebook_id=eq.${notebookId}`,
        },
        () => {
          // Invalidate and refetch the activity log when new entries occur
          queryClient.invalidateQueries({
            queryKey: ['activity-log', notebookId],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notebookId, queryClient]);

  return useInfiniteQuery({
    queryKey: ['activity-log', notebookId],
    queryFn: ({ pageParam }) =>
      fetchActivityPage(notebookId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!notebookId,
    staleTime: 60 * 1000, 
    refetchOnWindowFocus: false,
  });
}
