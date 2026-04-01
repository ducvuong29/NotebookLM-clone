import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useDeferredValue, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SEARCH_DEBOUNCE_MS = 300;

export interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  visibility: 'public' | 'private';
  updated_at: string;
  source_title: string | null;
  source_snippet: string | null;
  match_count: number;
}

export const useNotebookSearch = (initialQuery = '') => {
  const [rawQuery, setRawQuery] = useState(initialQuery);
  // [rerender-use-deferred-value] Keep input responsive during heavy result rendering
  const deferredQuery = useDeferredValue(rawQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Debounce: 300ms after user stops typing
  // [rerender-move-effect-to-event] — debounce in effect since it's time-based, not event-based
  useEffect(() => {
    if (!deferredQuery.trim()) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(deferredQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [deferredQuery]);

  const { data: results = [], isLoading, error } = useQuery({
    queryKey: ['notebook-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      // [query-missing-indexes] Uses GIN index idx_sources_content_search
      // RPC search_notebook_content: FTS on sources.content + ts_headline snippets
      // RLS applies automatically (SECURITY INVOKER function)
      const { data, error } = await supabase.rpc('search_notebook_content', {
        search_query: debouncedQuery,
        max_results: 50,
      });

      if (error) throw error;
      if (!data?.length) return [];

      return data.map((row: {
        notebook_id: string;
        notebook_title: string;
        notebook_description: string | null;
        notebook_icon: string | null;
        notebook_color: string | null;
        notebook_visibility: string;
        notebook_updated_at: string;
        source_title: string | null;
        source_snippet: string | null;
        match_count: number;
        match_rank: number;
      }) => ({
        id: row.notebook_id,
        title: row.notebook_title,
        description: row.notebook_description,
        icon: row.notebook_icon,
        color: row.notebook_color,
        visibility: (row.notebook_visibility as 'public' | 'private') || 'private',
        updated_at: row.notebook_updated_at,
        source_title: row.source_title,
        source_snippet: row.source_snippet,
        match_count: row.match_count ?? 0,
      }));
    },
    enabled: debouncedQuery.length >= 2, // Minimum 2 chars to trigger search
    staleTime: 60_000, // 1min — search results unlikely to change rapidly
  });

  const isSearching = debouncedQuery.length >= 2;
  const isStale = rawQuery !== debouncedQuery; // Shows typing indicator

  // [rerender-functional-setstate] Stable callback reference
  const clearSearch = useCallback(() => setRawQuery(''), []);

  return {
    query: rawQuery,
    setQuery: setRawQuery,
    results,
    isLoading: isLoading && isSearching,
    isStale,
    isSearching,
    error: error?.message ?? null,
    clearSearch,
  };
};
