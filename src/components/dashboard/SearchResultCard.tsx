import React from 'react';
import { FileText, Globe, Lock, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SearchResult } from '@/hooks/useNotebookSearch';

// [rendering-hoist-jsx] Hoisted to module level — stable across renders
const VISIBILITY_CONFIG = {
  public: {
    label: 'Công khai',
    icon: Globe,
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50',
  },
  private: {
    label: 'Riêng tư',
    icon: Lock,
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700/50',
  },
} as const;

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/30',
  green: 'bg-green-100 dark:bg-green-900/30',
  purple: 'bg-purple-100 dark:bg-purple-900/30',
  rose: 'bg-rose-100 dark:bg-rose-900/30',
  amber: 'bg-amber-100 dark:bg-amber-900/30',
  gray: 'bg-gray-100 dark:bg-gray-800/40',
  indigo: 'bg-indigo-100 dark:bg-indigo-900/30',
  pink: 'bg-pink-100 dark:bg-pink-900/30',
  teal: 'bg-teal-100 dark:bg-teal-900/30',
  orange: 'bg-orange-100 dark:bg-orange-900/30',
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface SearchResultCardProps {
  result: SearchResult;
  onClick: (id: string) => void;
  style?: React.CSSProperties;
}

// [rerender-no-inline-components] Extracted as separate module-level component
const SearchResultCard = ({ result, onClick, style }: SearchResultCardProps) => {
  const visConfig = VISIBILITY_CONFIG[result.visibility];
  const VisIcon = visConfig.icon;
  const iconBg = COLOR_MAP[result.color ?? 'gray'] || COLOR_MAP.gray;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(result.id);
    }
  };

  return (
    <div
      role="listitem"
      tabIndex={0}
      onClick={() => onClick(result.id)}
      onKeyDown={handleKeyDown}
      style={style}
      className={cn(
        'search-result-card',
        'rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 cursor-pointer',
        'hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
      )}
    >
      {/* Top row: Icon + Title + Visibility */}
      <div className="flex items-start gap-3 mb-2">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
          <span className="text-xl leading-none">{result.icon || '📝'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground line-clamp-1 text-[0.95rem] leading-snug">
            {result.title}
          </h3>
          {result.description ? (
            <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5 leading-relaxed">
              {result.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Content snippet — the killer feature */}
      {result.source_snippet ? (
        <div className="mt-2 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/30 relative overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <BookOpen className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" />
            <span className="text-[0.7rem] font-medium text-muted-foreground/70 line-clamp-1">
              {result.source_title || 'Nguồn tài liệu'}
            </span>
          </div>
          <p
            className="text-xs text-muted-foreground leading-relaxed line-clamp-3 content-snippet"
            dangerouslySetInnerHTML={{ __html: result.source_snippet }}
          />
        </div>
      ) : null}

      {/* Bottom row: Metadata */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/30">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className={cn('text-xs gap-1 font-medium', visConfig.className)}>
            <VisIcon className="h-3 w-3" />
            {visConfig.label}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {result.match_count} nguồn khớp
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(result.updated_at)}
        </span>
      </div>
    </div>
  );
};

export default SearchResultCard;
