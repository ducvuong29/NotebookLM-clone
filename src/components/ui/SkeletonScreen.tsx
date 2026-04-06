import * as React from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

export const SkeletonScreen = React.memo(function SkeletonScreen({
  className
}: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 p-8 w-full", className)}>
      <Skeleton className="h-10 w-1/3 mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full hidden md:block" />
        <Skeleton className="h-48 w-full hidden lg:block" />
      </div>
    </div>
  )
})
