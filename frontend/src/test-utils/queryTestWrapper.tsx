import { afterEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

/**
 * Shared TanStack Query test wrapper. Also registers an afterEach that
 * clears the most recently created QueryClient.
 *
 * Real, non-obvious reason this matters: without it, a query's cache entry
 * from an earlier "success" test can still be considered active when a
 * later test in the same file reconfigures the shared api mock to reject.
 * Something in that leftover query's lifecycle (observed via jsdom + React
 * 19 + Vitest 4 here) fires one more fetch against the now-rejecting mock
 * with no live subscriber to receive the error, and Vitest's unhandled-
 * rejection tracking attributes that stray rejection to whatever test
 * happens to be running — a real, reproducible failure, not flakiness.
 * queryClient.clear() between tests removes the stale cache entry before
 * that can happen.
 */
let lastCreatedClient: QueryClient | undefined

afterEach(() => {
  lastCreatedClient?.clear()
})

export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  lastCreatedClient = queryClient

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { Wrapper, queryClient }
}
