import { Skeleton } from "@/components/ui/skeleton"

export default function RegistryLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 flex-1 max-w-sm rounded-lg ml-auto" />
      </div>
      {/* Pending section */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="surface-card p-4 flex items-center gap-4">
            <Skeleton className="flex-1 h-3" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
      {/* Active table */}
      <div className="rounded-xl border border-border-primary overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border-primary last:border-0 flex gap-4">
            <Skeleton className="flex-1 h-3" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
