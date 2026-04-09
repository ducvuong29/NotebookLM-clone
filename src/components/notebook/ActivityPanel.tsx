import React, { useMemo } from 'react';
import { useActivityLog, ActivityLogEntry } from '@/hooks/useActivityLog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  UserPlus, UserMinus, Shield, FilePlus, FileX, Pencil,
  ChevronDown, Activity, AlertCircle, FileEdit,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

// ============================================================================
// Action Config — icon, color, label mapping
// ============================================================================

interface ActionConfig {
  icon: React.ElementType;
  label: string;
  colorClass: string;     // Tailwind text color for icon
  bgClass: string;        // Tailwind bg for icon circle
}

const ACTION_MAP: Record<string, ActionConfig> = {
  member_invited: {
    icon: UserPlus,
    label: 'đã mời thành viên',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
  },
  member_removed: {
    icon: UserMinus,
    label: 'đã xoá thành viên',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  role_changed: {
    icon: Shield,
    label: 'đã thay đổi vai trò',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
  },
  source_added: {
    icon: FilePlus,
    label: 'đã thêm nguồn',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
  },
  source_deleted: {
    icon: FileX,
    label: 'đã xoá nguồn',
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-500/10',
  },
  note_updated: {
    icon: Pencil,
    label: 'đã cập nhật ghi chú',
    colorClass: 'text-violet-500',
    bgClass: 'bg-violet-500/10',
  },
  source_updated: {
    icon: FileEdit,
    label: 'đã đổi tên nguồn',
    colorClass: 'text-indigo-500',
    bgClass: 'bg-indigo-500/10',
  },
};

const DEFAULT_ACTION: ActionConfig = {
  icon: Activity,
  label: 'hoạt động không xác định',
  colorClass: 'text-gray-500',
  bgClass: 'bg-gray-500/10',
};

// ============================================================================
// Helpers
// ============================================================================

function getActionConfig(actionType: string): ActionConfig {
  return ACTION_MAP[actionType] ?? DEFAULT_ACTION;
}

function formatActionText(entry: ActivityLogEntry, config: ActionConfig): string {
  const meta = entry.metadata;

  const targetName = entry.target_actor?.full_name 
    || entry.target_actor?.email 
    || meta?.target_email 
    || 'người dùng';

  switch (entry.action_type) {
    case 'member_invited':
      return `đã mời ${targetName} làm ${meta?.role || 'thành viên'}`;
    case 'role_changed':
      return `đã thay đổi vai trò của ${targetName} sang ${meta?.new_role || 'vai trò mới'}`;
    case 'member_removed':
      return `đã xoá ${targetName} khỏi sổ tay`;
    case 'source_deleted':
      return `đã xoá nguồn "${meta?.source_title || 'không rõ'}"`;
    case 'source_added':
      return `đã thêm nguồn "${meta?.source_title || 'không rõ'}" ${meta?.source_type ? `(${meta.source_type})` : ''}`;
    case 'source_updated':
      return `đã đổi tên nguồn thành "${meta?.new_title}"`;
    case 'note_updated':
      return config.label; // uses default "đã cập nhật ghi chú"
    default:
      return config.label;
  }
}

function formatTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi });
  } catch {
    return '';
  }
}

// ============================================================================
// Day grouping for visual separation
// ============================================================================

interface DayGroup {
  label: string;
  entries: ActivityLogEntry[];
}

function groupByDay(entries: ActivityLogEntry[]): DayGroup[] {
  const groups: Map<string, ActivityLogEntry[]> = new Map();

  for (const entry of entries) {
    const d = new Date(entry.created_at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) {
      label = 'Hôm nay';
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = 'Hôm qua';
    } else {
      label = d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }

  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

// ============================================================================
// Sub-components
// ============================================================================

// [perf] React.memo prevents each ActivityItem from re-rendering when the parent
// ActivityPanel re-renders (e.g., new entries arrive, accordion toggle).
// Each item only re-renders when its own `entry` or `index` prop changes.
const ActivityItem = React.memo(function ActivityItem({ entry, index }: { entry: ActivityLogEntry; index: number }) {
  const config = getActionConfig(entry.action_type);
  const Icon = config.icon;
  
  const actorName = entry.actor?.full_name || entry.actor?.email || 'Người dùng';
  const initial = actorName.charAt(0).toUpperCase();

  return (
    <div 
      className="flex items-start gap-3 py-2.5 px-1 group animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Icon & Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="w-8 h-8 rounded-full border border-border/50 shadow-sm transition-transform group-hover:scale-105">
          <AvatarImage src={entry.actor?.avatar_url || ''} />
          <AvatarFallback className="text-[10px] font-medium bg-secondary/50 text-secondary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        
        {/* Action Badge */}
        <div className={cn(
          "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
          config.bgClass
        )}>
          <Icon className={cn("h-2.5 w-2.5", config.colorClass)} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm text-foreground leading-snug">
          <span className="font-medium mr-1">{actorName}</span>
          <span className="text-muted-foreground">{formatActionText(entry, config)}</span>
        </p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          {formatTime(entry.created_at)}
        </p>
      </div>
    </div>
  );
});

function ActivitySkeleton() {
  return (
    <div className="space-y-3 p-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-[70%]" />
            <Skeleton className="h-3 w-[40%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Activity className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">Chưa có hoạt động nào</p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        Các thay đổi sẽ được ghi lại tại đây
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground">Không thể tải hoạt động</p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface ActivityPanelProps {
  notebookId: string | undefined;
}

export default function ActivityPanel({ notebookId }: ActivityPanelProps) {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useActivityLog(notebookId);

  // Flatten all pages into a single list, then group by day
  const allEntries = useMemo(
    () => data?.pages.flatMap((p) => p.entries) ?? [],
    [data],
  );
  const dayGroups = useMemo(() => groupByDay(allEntries), [allEntries]);

  if (isLoading) return <ActivitySkeleton />;
  if (isError) return <ErrorState />;
  if (allEntries.length === 0) return <EmptyState />;

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-2 space-y-4">
        {dayGroups.map((group) => (
          <div key={group.label}>
            {/* Day divider */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Entries */}
            <div className="space-y-0.5">
              {group.entries.map((entry, idx) => (
                <ActivityItem key={entry.id} entry={entry} index={idx} />
              ))}
            </div>
          </div>
        ))}

        {/* Load More */}
        {hasNextPage && (
          <div className="flex justify-center pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              {isFetchingNextPage ? (
                <>
                  <span className="animate-spin w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
                  Đang tải...
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Xem thêm
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
