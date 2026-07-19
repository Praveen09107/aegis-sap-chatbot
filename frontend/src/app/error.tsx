"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Global error boundary caught:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
      <div className="max-w-md w-full mx-4">
        <div className="bg-bg-card border border-border-primary rounded-xl p-8 text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-danger-bg border border-danger-border flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-danger" />
          </div>

          <h1 className="text-xl font-semibold text-text-primary mb-2">Something went wrong</h1>

          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            An unexpected error occurred. If this continues, please contact IT support.
          </p>

          {process.env.NODE_ENV === "development" && (
            <div className="bg-bg-sunken border border-border-primary rounded-lg p-3 mb-6 text-left">
              <p className="text-xs font-mono text-danger truncate">{error.message}</p>
              {error.digest && <p className="text-xs text-text-tertiary mt-1">ID: {error.digest}</p>}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>

            <Link
              href="/"
              className="px-4 py-2 border border-border-primary text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-secondary transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
