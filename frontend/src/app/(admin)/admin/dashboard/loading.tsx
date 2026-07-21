import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-3 w-40" />
            <div className="flex items-end gap-1.5 h-40">
              {[...Array(7)].map((_, j) => (
                <Skeleton key={j} className="flex-1" style={{ height: `${50 + j * 6}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="surface-card p-4 space-y-3">
          <Skeleton className="h-3 w-32" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
          ))}
        </div>
        <div className="surface-card p-4 col-span-2 space-y-2">
          <Skeleton className="h-3 w-40" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="w-2 h-2 rounded-full shrink-0" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
