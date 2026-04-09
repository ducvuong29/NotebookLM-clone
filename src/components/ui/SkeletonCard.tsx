import * as React from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

// No React.memo — skeleton cards are ephemeral loading placeholders, never in stable lists.
// Render cost (handful of divs) is cheaper than memo's shallowEqual comparison.
export function SkeletonCard({
  className
}: { className?: string }) {
  return (
    <div 
      className={cn("flex flex-col p-6 rounded-xl border bg-card shadow-sm gap-4", className)}
      style={{ contentVisibility: 'auto' }}
    >
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex items-center gap-2 mt-auto pt-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  )
}
