"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Global defaults — override per-query as needed
            staleTime: 30_000, // 30 seconds before refetch
            gcTime: 5 * 60 * 1000, // 5 minutes cache retention
            retry: 2, // Retry failed requests twice
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
