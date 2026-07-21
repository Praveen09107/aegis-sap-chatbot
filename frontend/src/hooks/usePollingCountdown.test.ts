import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { usePollingCountdown } from "./usePollingCountdown"

describe("usePollingCountdown", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("computes secondsSince and secondsUntilNext immediately on mount", () => {
    vi.useFakeTimers()
    const now = Date.parse("2026-07-20T00:00:10Z")
    vi.setSystemTime(now)
    const dataUpdatedAt = Date.parse("2026-07-20T00:00:05Z") // 5s ago

    const { result } = renderHook(() => usePollingCountdown(dataUpdatedAt, 30_000))

    expect(result.current.secondsSince).toBe(5)
    expect(result.current.secondsUntilNext).toBe(25)
  })

  it("ticks secondsSince up every second and counts secondsUntilNext down", () => {
    vi.useFakeTimers()
    const start = Date.parse("2026-07-20T00:00:00Z")
    vi.setSystemTime(start)
    const dataUpdatedAt = start

    const { result } = renderHook(() => usePollingCountdown(dataUpdatedAt, 30_000))
    expect(result.current.secondsSince).toBe(0)
    expect(result.current.secondsUntilNext).toBe(30)

    act(() => {
      vi.advanceTimersByTime(7_000)
    })

    expect(result.current.secondsSince).toBe(7)
    expect(result.current.secondsUntilNext).toBe(23)
  })

  it("clamps secondsUntilNext at 0 once the interval has fully elapsed (error/edge path — a slow poll)", () => {
    vi.useFakeTimers()
    const start = Date.parse("2026-07-20T00:00:00Z")
    vi.setSystemTime(start)

    const { result } = renderHook(() => usePollingCountdown(start, 30_000))

    act(() => {
      vi.advanceTimersByTime(45_000)
    })

    expect(result.current.secondsSince).toBe(45)
    expect(result.current.secondsUntilNext).toBe(0)
  })

  it("resets the countdown when dataUpdatedAt changes (a fresh poll landed)", () => {
    vi.useFakeTimers()
    const start = Date.parse("2026-07-20T00:00:00Z")
    vi.setSystemTime(start)

    const { result, rerender } = renderHook(({ dataUpdatedAt }) => usePollingCountdown(dataUpdatedAt, 30_000), {
      initialProps: { dataUpdatedAt: start },
    })

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.secondsSince).toBe(10)

    // A new poll just resolved — dataUpdatedAt moves forward to "now".
    rerender({ dataUpdatedAt: start + 10_000 })
    expect(result.current.secondsSince).toBe(0)
  })

  it("clears its interval on unmount (no timer leak)", () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(global, "clearInterval")
    const { unmount } = renderHook(() => usePollingCountdown(Date.now(), 30_000))

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
