import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePolling, usePollingCountdown } from "./usePolling"
import type { ReactNode } from "react"

function makeWrapper() {
  const queryClient = new QueryClient()
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, invalidateSpy }
}

describe("usePolling", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("invalidates the given query key on each interval tick", () => {
    vi.useFakeTimers()
    const { Wrapper, invalidateSpy } = makeWrapper()

    renderHook(() => usePolling({ queryKey: ["admin", "metrics"], intervalMs: 1000 }), {
      wrapper: Wrapper,
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "metrics"] })
    act(() => vi.advanceTimersByTime(1000))
    expect(invalidateSpy).toHaveBeenCalledTimes(2)
  })

  it("does not poll when enabled is false", () => {
    vi.useFakeTimers()
    const { Wrapper, invalidateSpy } = makeWrapper()

    renderHook(() => usePolling({ queryKey: ["admin", "metrics"], intervalMs: 1000, enabled: false }), {
      wrapper: Wrapper,
    })

    act(() => vi.advanceTimersByTime(5000))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("stops polling on unmount", () => {
    vi.useFakeTimers()
    const { Wrapper, invalidateSpy } = makeWrapper()

    const { unmount } = renderHook(() => usePolling({ queryKey: ["admin", "metrics"], intervalMs: 1000 }), {
      wrapper: Wrapper,
    })

    unmount()
    act(() => vi.advanceTimersByTime(5000))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe("usePollingCountdown", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("counts down to the next poll and wraps back to the full interval", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePollingCountdown(30_000))

    const first = result.current()
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThanOrEqual(30)

    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current()).toBeLessThanOrEqual(1)
  })
})
