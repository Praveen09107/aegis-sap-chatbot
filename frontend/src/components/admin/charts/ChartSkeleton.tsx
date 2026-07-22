"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Shared loading fallback for the dynamic-import chart barrel (index.tsx) —
 * shown while a chart's own chunk is still downloading, before its real
 * component (and its own internal isLoading skeleton) ever mounts. Mirrors
 * `.chart-card`'s dimensions so there's no layout shift once the real
 * component takes over.
 */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("chart-card", className)}>
      <Skeleton className="h-3 w-40 mb-4" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
