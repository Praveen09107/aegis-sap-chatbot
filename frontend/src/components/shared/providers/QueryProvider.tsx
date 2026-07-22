"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"
import { APIError } from "@/lib/api"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Global defaults — override per-query as needed
            staleTime: 30_000, // 30 seconds before refetch
            gcTime: 5 * 60 * 1000, // 5 minutes cache retention
            // Fixed (2026-07-22, FRONTEND_26): a flat `retry: 2` retried
            // EVERY failure indiscriminately, including 401/403/404/409/422
            // — none of which ever succeed on retry, so a not-found or
            // auth-expired query just delayed its own error state by ~3s
            // for nothing. Class A (network, status 0) and Class C (5xx)
            // retry up to 2x; Class B (401) and Class D (403/404/409/422 —
            // any 4xx) fail immediately.
            retry: (failureCount, error) => {
              if (error instanceof APIError && error.status !== 0 && error.status < 500) return false
              return failureCount < 2
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: false, // Explicit polling handles this
            refetchOnReconnect: true, // Refetch on network reconnect
            throwOnError: false, // Handle errors in components
          },
          mutations: {
            retry: 0, // No retry on mutations
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
