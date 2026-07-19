import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

// AEGIS variant colors (FRONTEND_04_DEPENDENCIES.md Step 6) — replaces the
// shadcn-scaffolded slate/primary defaults, which never got overridden when
// this file was first generated (confirmed still stock as of F05).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-white shadow-sm hover:bg-accent-hover active:bg-accent-pressed",
        outline:
          "border-border-primary bg-transparent text-text-primary hover:bg-bg-secondary hover:border-border-secondary aria-expanded:bg-bg-secondary",
        secondary:
          "bg-bg-tertiary text-text-primary border-border-primary hover:bg-bg-secondary aria-expanded:bg-bg-secondary",
        ghost: "text-text-secondary hover:bg-bg-secondary hover:text-text-primary aria-expanded:bg-bg-secondary",
        destructive: "bg-danger text-white shadow-sm hover:bg-danger/90",
        success: "bg-success-bg text-success-text border-success-border hover:bg-success/10",
        link: "text-accent underline-offset-4 hover:underline hover:text-accent-hover h-auto px-0",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  // asChild delegates rendering to a single wrapped child (e.g.
  // AlertDialogAction) — Radix's Slot.Root requires exactly one child to
  // merge props onto, so the loading spinner can't be injected as a
  // sibling there. loading isn't meaningful for that composition pattern
  // anyway (the wrapped element owns its own children).
  if (asChild) {
    return (
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled}
        {...props}
      >
        {children}
      </Comp>
    )
  }

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <Spinner
          size="xs"
          color={variant === "outline" || variant === "ghost" || variant === "secondary" ? "default" : "white"}
        />
      )}
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
