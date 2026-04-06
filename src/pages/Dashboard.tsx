import React, { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import NotebookGrid from "@/components/dashboard/NotebookGrid";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import SearchBar from "@/components/dashboard/SearchBar";
import { SkeletonScreen } from "@/components/ui/SkeletonScreen";
import { useNotebooks } from "@/hooks/useNotebooks";
import { useRealtimeMembership } from "@/hooks/useRealtimeMembership";
import { useNotebookSearch } from "@/hooks/useNotebookSearch";
import { useAuth } from "@/contexts/AuthContext";

// [bundle-dynamic-imports] Lazy-load SearchResults — only imported when search mode active
const SearchResults = lazy(() => import("@/components/dashboard/SearchResults"));

import { SkeletonCard } from "@/components/ui/SkeletonCard";

// [rendering-hoist-jsx] Skeleton fallback hoisted to module level
const SearchSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

const Dashboard = () => {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { notebooks, isLoading, error, isError } = useNotebooks();
  const hasNotebooks = notebooks && notebooks.length > 0;
  const navigate = useNavigate();

  // [search state preservation via URL] Persist search query as ?q=... URL parameter
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isLoading: searchLoading,
    isStale: searchIsStale,
    isSearching,
    clearSearch,
  } = useNotebookSearch(initialQuery);

  // Sync search query to URL param (replace to avoid polluting history)
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchParams({ q: searchQuery }, { replace: true });
    } else {
      // Remove q param when cleared
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('q');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchQuery, setSearchParams, searchParams]);

  // Listen to realtime membership changes (added/removed from notebooks)
  useRealtimeMembership();

  const handleSearchClear = () => {
    clearSearch();
    setSearchParams({}, { replace: true });
  };

  const handleResultClick = (id: string) => {
    navigate(`/notebook/${id}`, { state: { fromSearch: searchQuery } });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userEmail={user?.email} />

      <main id="main-content" className="max-w-7xl mx-auto px-6 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-medium text-foreground mb-2 font-heading tracking-tight md:text-5xl">
            Chào mừng đến InsightsLM
          </h1>
        </div>

        {/* Search Bar — always visible below heading */}
        <div className="mb-8">
          <SearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClear={handleSearchClear}
            isLoading={searchLoading}
            isStale={searchIsStale}
            resultCount={searchResults.length}
            isSearching={isSearching}
          />
        </div>

        {authLoading || isLoading ? (
          <SkeletonScreen />
        ) : authError || (isError && error) ? (
          <div className="text-center py-16 animate-in slide-in-from-bottom-4 fade-in">
            <p className="text-destructive mb-4">Lỗi: {authError || error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all active:scale-95 shadow-sm"
            >
              Thử lại
            </button>
          </div>
        ) : isSearching ? (
          // [rendering-conditional-render] Ternary for state branching
          <Suspense fallback={<SearchSkeleton />}>
            <SearchResults
              results={searchResults}
              isLoading={searchLoading}
              query={searchQuery}
              onResultClick={handleResultClick}
            />
          </Suspense>
        ) : (
          hasNotebooks ? <NotebookGrid /> : <EmptyDashboard />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
