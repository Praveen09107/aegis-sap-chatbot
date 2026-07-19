"use client"

import React from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Optional custom fallback. Receives the error. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  /** Optional label for the section (e.g., "metrics panel") for error message */
  section?: string
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
