
import React, { useState, useMemo } from 'react';
import { Check, ChevronDown, Globe, Lock } from 'lucide-react';
import NotebookCard from './NotebookCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface FormattedNotebook {
  id: string;
  title: string;
  date: string;
  updatedAt: string; // raw ISO date for sorting
  sources: number;
  icon: string;
  color: string;
  visibility?: 'public' | 'private';
  canDelete?: boolean;
}

interface NotebookSectionProps {
  title: string;
  notebooks: FormattedNotebook[];
  emptyMessage: string;
  showCreateButton?: boolean;
  onCreateNotebook?: () => void;
  isCreating?: boolean;
  onNotebookClick: (id: string, e: React.MouseEvent) => void;
  variant?: 'public' | 'private';
}

const NotebookSection = ({
  title,
  notebooks,
  emptyMessage,
  onNotebookClick,
  variant = 'private',
}: NotebookSectionProps) => {
  const [sortBy, setSortBy] = useState('Most recent');

  // Derive sorted notebooks during render (rerender-derived-state-no-effect)
  const sortedNotebooks = useMemo(() => {
    const sorted = [...notebooks];

    if (sortBy === 'Most recent') {
      sorted.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } else if (sortBy === 'Title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    }

    return sorted;
  }, [notebooks, sortBy]);

  const isPublic = variant === 'public';

  // Section icon based on variant
  const SectionIcon = isPublic ? Globe : Lock;

  return (
    <section className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg",
            isPublic
              ? "bg-emerald-100 dark:bg-emerald-900/30"
              : "bg-indigo-100 dark:bg-indigo-900/30"
          )}>
            <SectionIcon className={cn(
              "h-4 w-4",
              isPublic
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-indigo-600 dark:text-indigo-400"
            )} />
          </div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight font-heading">
            {title}
          </h2>
          {notebooks.length > 0 && (
            <span className="text-sm text-muted-foreground ml-1">
              ({notebooks.length})
            </span>
          )}
        </div>

        {/* Sort dropdown — only show when there are notebooks to sort */}
        {notebooks.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center space-x-2 bg-background rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                <span className="text-sm text-muted-foreground">{sortBy}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSortBy('Most recent')} className="flex items-center justify-between">
                Most recent
                {sortBy === 'Most recent' && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('Title')} className="flex items-center justify-between">
                Title
                {sortBy === 'Title' && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Notebook Grid or Empty State */}
      {sortedNotebooks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedNotebooks.map(notebook => (
            <div key={notebook.id} onClick={e => onNotebookClick(notebook.id, e)} className="h-full">
              <NotebookCard
                notebook={notebook}
                canDelete={notebook.canDelete ?? true}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={cn(
          "rounded-xl border-2 border-dashed py-12 px-6 text-center transition-colors",
          isPublic
            ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20"
        )}>
          <SectionIcon className={cn(
            "h-10 w-10 mx-auto mb-3",
            isPublic
              ? "text-emerald-300 dark:text-emerald-700"
              : "text-indigo-300 dark:text-indigo-700"
          )} />
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
};

export default NotebookSection;
