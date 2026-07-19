import { cn } from "@/lib/utils"

interface SkeletonProps extends React.ComponentProps<"div"> {
  /** Rounded pill shape — useful for badge placeholders */
  pill?: boolean
  /** Circle shape — useful for avatar placeholders */
  circle?: boolean
}

function Skeleton({ className, pill, circle, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse bg-bg-tertiary",
        pill || circle ? "rounded-full" : "rounded-md",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

/**
 * Shimmer variant with a gradient sweep animation (F04's .shimmer utility)
 * — use for skeleton loading states that need more visual activity than
 * the plain pulse.
 */
function SkeletonShimmer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("shimmer rounded-md", className)} aria-hidden="true" {...props} />
}

export { Skeleton, SkeletonShimmer }
