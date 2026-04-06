import * as React from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

export const SkeletonChatMessage = React.memo(function SkeletonChatMessage({
  isUser,
  className
}: { isUser?: boolean, className?: string }) {
  return (
    <div className={cn("flex w-full gap-4 py-4", isUser ? "flex-row-reverse" : "flex-row", className)}>
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className={cn("flex flex-col gap-2 max-w-[80%]", isUser ? "items-end" : "items-start")}>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
        {!isUser && <Skeleton className="h-4 w-40" />}
      </div>
    </div>
  )
})
