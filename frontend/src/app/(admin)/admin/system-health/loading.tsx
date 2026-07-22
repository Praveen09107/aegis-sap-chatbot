import { Skeleton } from "@/components/ui/skeleton"

export default function HealthLoading() {
  return (
    <div className="px-6 py-5 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Overall banner */}
      <Skeleton className="h-10 w-full rounded-xl" />
      {/* Categories */}
      {[3, 2, 5, 2, 3, 2, 2].map((count, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-2.5 w-28" />
          <div className={`grid gap-3 ${count <= 3 ? "grid-cols-3" : "grid-cols-5"}`}>
            {[...Array(count)].map((_, j) => (
              <Skeleton key={j} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
      {/* New real-data sections */}
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
