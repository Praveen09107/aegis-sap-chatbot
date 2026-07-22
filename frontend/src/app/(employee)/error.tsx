"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Employee portal error page.
 * Shown when an unhandled error propagates to the route level within the
 * (employee) route group (/, /history, /onboarding).
 * Provides a reset (re-render attempt) and a "Go to chat" escape hatch.
 */
export default function EmployeeErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[Employee portal error]", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-danger-bg border border-danger-border flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-danger" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="text-lg font-bold text-text-primary">Something went wrong</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          An unexpected error occurred. Your chat history is safe — try refreshing or start a new session.
        </p>
        {process.env.NODE_ENV === "development" && error.message && (
          <pre className="text-left text-xs text-danger font-mono bg-danger-bg border border-danger-border rounded-lg p-3 mt-3 overflow-x-auto">
            {error.message}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button asChild className="gap-2">
          <Link href="/">
            <Home className="w-4 h-4" />
            Go to chat
          </Link>
        </Button>
      </div>
    </div>
  )
}
