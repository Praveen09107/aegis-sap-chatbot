import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useDebounce } from "./useDebounce"

describe("useDebounce", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("first", 300))
    expect(result.current).toBe("first")
  })

  it("only updates after the delay, using the last value set", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "a" },
    })

    rerender({ value: "b" })
    rerender({ value: "c" })
    expect(result.current).toBe("a")

    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe("c")
  })

  it("defaults to TIMING.SEARCH_DEBOUNCE_MS (300ms) when no delay is given", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: "a" },
    })

    rerender({ value: "b" })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe("a")
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe("b")
  })
})
