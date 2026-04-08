import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const FlowchartSkeleton = memo(function FlowchartSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-muted/30">
      <div className="border-b border-border px-4 py-4">
        <Skeleton className="mb-3 h-8 w-2/3" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 p-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="mb-4 h-5 w-24" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-4 w-9/12" />
            <Skeleton className="h-4 w-8/12" />
            <Skeleton className="h-4 w-7/12" />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="mb-4 h-5 w-28" />
          <Skeleton className="h-full min-h-[240px] w-full rounded-lg" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <Skeleton className="h-9 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
});
