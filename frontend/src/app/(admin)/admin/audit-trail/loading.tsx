import { Skeleton } from "@/components/ui/skeleton"

export default function AuditTrailLoading() {
  return (
    <div className="px-6 py-5 max-w-[1200px] space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="flex items-center gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-lg" />
        ))}
      </div>
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <Skeleton className="h-9 w-full rounded-none" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-4 py-2.5 border-t border-border-primary">
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
