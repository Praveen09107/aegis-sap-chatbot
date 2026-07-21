import { Skeleton } from "@/components/ui/skeleton"

export default function ConfigLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-52" />
      </div>
      <div className="flex gap-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <div className="bg-bg-secondary px-4 py-3 flex gap-6">
          {["Category", "Key", "Current value", "Staleness", "Last verified", ""].map((h) => (
            <Skeleton key={h} className="h-2.5 w-20" />
          ))}
        </div>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-t border-border-primary flex gap-6 items-center">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-40 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
