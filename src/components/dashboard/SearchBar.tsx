import React, { useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClear: () => void;
  isLoading: boolean;
  isStale: boolean;
  resultCount: number;
  isSearching: boolean;
}

const SearchBar = ({
  query,
  onQueryChange,
  onClear,
  isLoading,
  isStale,
  resultCount,
  isSearching,
}: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount if there's an initial query (from URL param)
  useEffect(() => {
    if (query && inputRef.current) {
      inputRef.current.focus();
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    onClear();
    inputRef.current?.focus();
  };

  return (
    <div
      role="search"
      aria-label="Tìm kiếm notebook"
      aria-busy={isLoading}
      className={cn(
        'search-bar',
        'relative w-full max-w-2xl mx-auto',
        'rounded-2xl border',
        'backdrop-blur-xl bg-white/60 dark:bg-zinc-900/60',
        'border-white/30 dark:border-zinc-700/40',
        'shadow-sm',
        'transition-all duration-300 ease-out',
        // Focus glow handled by CSS class .search-bar:focus-within
      )}
    >
      <div className="flex items-center px-5 py-3.5 gap-3">
        {/* Search / Loading icon */}
        <div className="flex-shrink-0 transition-transform duration-200">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : (
            <Search className={cn(
              'h-5 w-5 transition-colors duration-200',
              query ? 'text-primary' : 'text-muted-foreground/60',
            )} />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Tìm kiếm notebook..."
          className={cn(
            'flex-1 bg-transparent border-none outline-none',
            'text-[1.05rem] text-foreground placeholder:text-muted-foreground/50',
            'font-heading tracking-tight',
          )}
          autoComplete="off"
          spellCheck="false"
        />

        {/* Right side: result count + clear button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Result count badge */}
          {isSearching && !isLoading && !isStale ? (
            <span
              id="search-result-count"
              className={cn(
                'text-xs font-heading text-muted-foreground/70 px-2.5 py-1 rounded-full',
                'bg-muted/50 dark:bg-zinc-800/50',
                'animate-in fade-in duration-200',
              )}
            >
              {resultCount} kết quả
            </span>
          ) : null}

          {/* Typing indicator */}
          {isStale && query.trim().length >= 2 ? (
            <span className="text-xs text-muted-foreground/50 animate-pulse">
              ...
            </span>
          ) : null}

          {/* Clear button */}
          {query ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Xóa tìm kiếm"
              className={cn(
                'p-1.5 rounded-lg',
                'text-muted-foreground/60 hover:text-foreground',
                'hover:bg-muted/50 dark:hover:bg-zinc-800/50',
                'transition-all duration-200',
                'animate-in fade-in slide-in-from-right-2 duration-200',
              )}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
