import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

// No React.memo — receives `icon` (ReactNode) and `action` (inline object) which
// are always new references each render, making memo's shallowEqual check always fail.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-200", className)}>
      {icon && (
        <div className="mb-4 text-muted-foreground flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-[250px] sm:max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} variant="default">
          {action.icon && <span className="mr-2 flex items-center justify-center">{action.icon}</span>}
          {action.label}
        </Button>
      )}
    </div>
  )
}
