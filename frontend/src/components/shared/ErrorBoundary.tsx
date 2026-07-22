"use client"

import React from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Optional custom fallback. Receives the error. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  /** Optional label for the section (e.g., "metrics panel") for error message */
  section?: string
  /**
   * 'section' (default) = compact inline fallback for a page subsection.
   * 'page' = larger, more prominent fallback for wrapping a page's entire
   * content area (still inside the portal's own layout/nav — for a true
   * route-level crash, Next.js's own error.tsx takes over instead; this is
   * for sections large enough to want page-style treatment without being
   * a full route boundary).
   */
  variant?: "section" | "page"
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React class-based error boundary. Wrap individual page sections to
 * isolate failures — pages use the global error.tsx for full-page errors.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children

    const { error } = this.state

    if (this.props.fallback && error) {
      return this.props.fallback(error, this.reset)
    }

    if (this.props.variant === "page") {
      return <PageErrorFallback section={this.props.section} error={error} onReset={this.reset} />
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-border-primary bg-bg-secondary min-h-[120px]">
        <div className="flex items-center gap-2 text-text-secondary">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-sm">
            {this.props.section ? `Could not load ${this.props.section}` : "An error occurred in this section"}
          </p>
        </div>

        <button
          onClick={this.reset}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Try again
        </button>
      </div>
    )
  }
}

// ── Page-variant fallback ────────────────────────────────────────

interface PageErrorFallbackProps {
  section?: string
  error: Error | null
  onReset: () => void
}

function PageErrorFallback({ section, error, onReset }: PageErrorFallbackProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center min-h-[400px] gap-5",
        "bg-danger-bg/30 rounded-xl border border-danger-border/40"
      )}
      role="alert"
    >
      <div className="w-10 h-10 rounded-full bg-danger-bg border border-danger-border flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-danger" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-text-primary text-base">{section ? `Failed to load ${section}` : "Something went wrong"}</p>
        <p className="text-text-secondary text-sm">
          {process.env.NODE_ENV === "development" && error?.message ? error.message : "An unexpected error occurred in this section."}
        </p>
      </div>

      <Button variant="outline" size="default" onClick={onReset} className="gap-2 border-danger-border/50">
        <RefreshCw className="w-3.5 h-3.5" />
        Try again
      </Button>
    </div>
  )
}
