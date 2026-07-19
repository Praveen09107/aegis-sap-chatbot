import { Skeleton } from "@/components/ui/skeleton"

/**
 * Next.js loading.tsx for the employee portal root route (/). Shown while
 * the chat page component mounts — must match the three-panel layout
 * structure of the real chat interface (built in F09).
 */
export default function ChatLoading() {
  return (
    <div className="flex h-screen bg-bg-secondary">
      {/* Sessions sidebar skeleton */}
      <div className="w-[180px] border-r border-border-primary bg-bg-tertiary p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-5 rounded-md" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-1.5 p-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>

      {/* Main chat area skeleton */}
      <div className="flex-1 flex flex-col bg-bg-card">
        <Skeleton className="h-[52px] w-full rounded-none border-b border-border-primary" />
        <div className="flex-1 p-5 space-y-4">
          <div className="flex justify-end">
            <Skeleton className="h-16 w-2/3 rounded-xl rounded-tr-sm" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-32 w-4/5 rounded-xl rounded-tl-sm" />
            <Skeleton className="h-5 w-48 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-[64px] w-full rounded-none border-t border-border-primary" />
      </div>

      {/* Source panel skeleton */}
      <div className="w-[210px] border-l border-border-primary bg-bg-tertiary p-4 space-y-4">
        <Skeleton className="h-3 w-16" />
        <div className="rounded-xl border border-border-primary p-3 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
