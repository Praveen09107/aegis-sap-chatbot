import { Skeleton } from "@/components/ui/skeleton"

export default function AnalyticsLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          {["7d", "30d", "90d", "All"].map((r) => (
            <Skeleton key={r} className="h-8 w-14 rounded-lg" />
          ))}
        </div>
      </div>
      {/* 3 rows of 2 charts */}
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid grid-cols-2 gap-3">
          {[0, 1].map((col) => (
            <div key={col} className="surface-card p-4 space-y-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
