import * as React from "react"

import { cn } from "@/lib/utils"

// AEGIS styling (FRONTEND_04_DEPENDENCIES.md Step 6) — bg-bg-secondary /
// border-border-primary / focus ring on border-focus, plus the error/
// errorMessage props, replace shadcn's stock input styling, which never
// got overridden when this file was first generated (confirmed still
// stock as of F05).
export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean
  errorMessage?: string
}

// Only wraps in a container when there's an inline error message to render
// underneath — InputGroupInput (components/ui/input-group.tsx) composes
// this component directly into a flex row and expects a bare <input> back;
// an unconditional wrapper div would break that layout.
function Input({ className, type, error, errorMessage, ...props }: InputProps) {
  const input = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lg border px-3 py-2",
        "bg-bg-secondary text-sm text-text-primary",
        "placeholder:text-text-tertiary",
        "transition-colors duration-[var(--duration-normal)] outline-none",
        "focus-visible:border-border-focus focus-visible:ring-1 focus-visible:ring-border-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        error
          ? "border-danger-border focus-visible:border-danger focus-visible:ring-danger"
          : "border-border-primary",
        className
      )}
      aria-invalid={error ? "true" : "false"}
      {...props}
    />
  )

  if (!error || !errorMessage) return input

  return (
    <div className="w-full">
      {input}
      <p className="mt-1.5 text-xs text-danger-text" role="alert">
        {errorMessage}
      </p>
    </div>
  )
}

export { Input }
