"use client"

import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const spinnerVariants = cva(
  "inline-block border-2 border-current border-t-transparent rounded-full animate-spin",
  {
    variants: {
      size: {
        xs: "w-3 h-3 border-[1.5px]",
        sm: "w-4 h-4 border-2",
        md: "w-5 h-5 border-2",
        lg: "w-8 h-8 border-[3px]",
        xl: "w-12 h-12 border-4",
      },
      color: {
        default: "text-text-tertiary",
        accent: "text-accent",
        white: "text-white",
        success: "text-success",
        muted: "text-border-secondary",
      },
    },
    defaultVariants: {
      size: "md",
      color: "default",
    },
  }
)

export interface SpinnerProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof spinnerVariants> {
  label?: string
}

/**
 * Inline loading spinner. Use inside buttons, data tables, and inline
 * loading states.
 */
export function Spinner({ className, size, color, label = "Loading", ...props }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} {...props}>
      <span className={cn(spinnerVariants({ size, color }), className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Full-width centered loading block. Use for page-section-level loading
 * states before data arrives (not full-page — see LoadingScreen for that).
 */
export function LoadingSpinner({
  label = "Loading...",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 min-h-[200px] w-full", className)}
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" color="accent" label={label} />
      <p className="text-sm text-text-tertiary animate-pulse">{label}</p>
    </div>
  )
}
