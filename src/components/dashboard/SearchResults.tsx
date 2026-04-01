import React from 'react';
import { SearchX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div key={i} className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    ))}
  </div>
);

// [rendering-hoist-jsx] Empty state hoisted
const SearchEmptyState = ({ query }: { query: string }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 animate-in fade-in duration-500">
    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
      <SearchX className="h-8 w-8 text-muted-foreground/60" />
    </div>
    <p className="text-muted-foreground text-sm font-medium mb-1">
      Không tìm thấy notebook phù hợp
    </p>
    <p className="text-muted-foreground/60 text-xs">
      Thử tìm kiếm với từ khóa khác cho "{query}"
    </p>
  </div>
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
