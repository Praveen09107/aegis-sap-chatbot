import { Skeleton } from "@/components/ui/skeleton"

export default function KnowledgeGapsLoading() {
  return (
    <div className="px-6 py-5 max-w-[1200px] space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex items-center gap-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-lg" />
        ))}
        <Skeleton className="h-8 w-56 rounded-lg ml-auto" />
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
