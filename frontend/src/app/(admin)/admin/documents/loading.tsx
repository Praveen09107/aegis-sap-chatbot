import { Skeleton } from "@/components/ui/skeleton"

export default function DocumentsLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      {/* Upload zone skeleton */}
      <Skeleton className="h-36 w-full rounded-xl" />
      {/* Filters */}
      <div className="flex gap-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-lg" />
        ))}
        <Skeleton className="h-8 flex-1 max-w-xs rounded-lg ml-auto" />
      </div>
      {/* Table */}
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <div className="bg-bg-secondary px-4 py-3 flex gap-8">
          {["Document ID", "Name", "Module", "Status", "Chunks", "Verified"].map((h) => (
            <Skeleton key={h} className="h-2.5 w-16" />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-t border-border-primary flex gap-8 items-center">
            <Skeleton className="h-2.5 w-20 font-mono" />
            <Skeleton className="h-2.5 w-44" />
            <Skeleton className="h-5 w-8 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
