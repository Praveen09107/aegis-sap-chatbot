"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Admin portal error page. Shown when an unhandled error propagates to the
 * route level within the (admin) route group (any /admin/* page).
 */
export default function AdminErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[Admin portal error]", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-danger-bg border border-danger-border flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-danger" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="text-lg font-bold text-text-primary">Admin portal error</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          An unexpected error occurred in the admin panel. Navigation and other sections should still be accessible.
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-left text-xs text-danger font-mono bg-danger-bg/50 border border-danger-border rounded-lg p-3 mt-3 overflow-x-auto whitespace-pre-wrap">
            {error.message}
            {"\n"}
            {error.stack?.split("\n").slice(1, 5).join("\n")}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button asChild className="gap-2">
          <Link href="/admin/dashboard">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}
