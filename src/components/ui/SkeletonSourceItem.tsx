import * as React from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

// No React.memo — shown in small loading lists (≤10 items), renders 4 divs.
// Render cost is negligible; memo overhead not justified without stable parent.
export function SkeletonSourceItem({
  className
}: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-lg border bg-muted/30", className)}>
      <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
      <div className="flex flex-col gap-2 w-full">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}
