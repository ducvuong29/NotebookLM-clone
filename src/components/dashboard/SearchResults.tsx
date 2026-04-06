import React from 'react';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { EMPTY_STATE } from '@/lib/empty-state-content';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import SearchResultCard from './SearchResultCard';
import type { SearchResult } from '@/hooks/useNotebookSearch';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  query: string;
  onResultClick: (id: string) => void;
}

// [rendering-hoist-jsx] Skeleton component hoisted — static layout
const SearchSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

// [rendering-hoist-jsx] Empty state hoisted
const SearchEmptyState = ({ query }: { query: string }) => (
  <EmptyState
    icon={<SearchX className="h-10 w-10 text-muted-foreground/50" />}
    title={EMPTY_STATE.search.title}
    description={`${EMPTY_STATE.search.description} ("${query}")`}
  />
);

const SearchResults = ({ results, isLoading, query, onResultClick }: SearchResultsProps) => {
  // [rendering-conditional-render] Use ternary for state branching — NOT &&
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {isLoading ? (
        <SearchSkeleton />
      ) : results.length === 0 ? (
        <SearchEmptyState query={query} />
      ) : (
        <div role="list" aria-label="Kết quả tìm kiếm" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((r, i) => (
            <SearchResultCard
              key={r.id}
              result={r}
              onClick={onResultClick}
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchResults;
