import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// AEGIS semantic variants (FRONTEND_04_DEPENDENCIES.md Step 6) — the
// confidence system (success/warning/danger) and document-status variants
// (active/deprecated/processing/failed/pending) replace shadcn's generic
// slate defaults, which never got overridden when this file was first
// generated (confirmed still stock as of F05).
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-bg-tertiary text-text-secondary border-border-primary",
        outline: "bg-transparent text-text-primary border-border-secondary",

        // Confidence system — AEGIS core semantic colors, never decorative.
        success: "bg-success-bg text-success-text border-success-border",
        warning: "bg-warning-bg text-warning-text border-warning-border",
        danger: "bg-danger-bg text-danger-text border-danger-border",

        // Info and mode colors
        info: "bg-info-bg text-info-text border-info-border",
        purple: "bg-purple-bg text-purple-text border-purple-border",

        // Document status (admin portal)
        active: "bg-success-bg text-success-text border-success-border",
        deprecated: "bg-bg-tertiary text-text-tertiary border-border-primary",
        processing: "bg-info-bg text-info-text border-info-border",
        failed: "bg-danger-bg text-danger-text border-danger-border",
        pending: "bg-warning-bg text-warning-text border-warning-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const DOT_COLOR: Record<string, string> = {
  success: "bg-success",
  active: "bg-success",
  warning: "bg-warning",
  pending: "bg-warning",
  danger: "bg-danger",
  failed: "bg-danger",
  info: "bg-info",
  processing: "bg-info",
  purple: "bg-purple",
}

function Badge({
  className,
  variant = "default",
  dot = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot && (
        <span
          className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", DOT_COLOR[variant ?? "default"] ?? "bg-text-tertiary")}
        />
      )}
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants }
