import { Skeleton } from "@/components/ui/skeleton"

export default function TicketsLoading() {
  return (
    <div className="px-6 py-5 max-w-[1200px]">
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["Open", "In Progress", "Resolved"].map((col) => (
          <div key={col} className="bg-bg-secondary rounded-xl border border-border-primary border-t-2">
            <div className="flex justify-between px-4 py-3 border-b border-border-primary">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="p-3 space-y-2.5">
              {[...Array(col === "Open" ? 3 : 2)].map((_, i) => (
                <div key={i} className="surface-card p-3 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
