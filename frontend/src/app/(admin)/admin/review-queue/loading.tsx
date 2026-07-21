import { Skeleton } from "@/components/ui/skeleton"

export default function ReviewLoading() {
  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* Left panel skeleton */}
      <div className="w-72 border-r border-border-primary p-4 space-y-3">
        <Skeleton className="h-3 w-24 mb-4" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="space-y-1.5 py-1">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        ))}
      </div>
      {/* Right panel skeleton */}
      <div className="flex-1 p-6 space-y-5">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="flex gap-3 mt-auto pt-4 border-t border-border-primary">
          <Skeleton className="h-10 w-44 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
