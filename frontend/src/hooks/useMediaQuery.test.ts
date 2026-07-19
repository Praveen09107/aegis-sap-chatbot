import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useMediaQuery, useIsOptimalWidth, usePrefersReducedMotion } from "./useMediaQuery"

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(e: MediaQueryListEvent) => void>()

  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  }

  window.matchMedia = vi.fn().mockReturnValue(mql)

  return {
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))
    },
  }
}

describe("useMediaQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reflects the current match state", () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery("(min-width: 1440px)"))
    expect(result.current).toBe(true)
  })

  it("updates when the media query's match state changes", () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery("(min-width: 1440px)"))
    expect(result.current).toBe(false)

    act(() => media.setMatches(true))
    expect(result.current).toBe(true)
  })
})

describe("useIsOptimalWidth", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("queries the optimal AEGIS breakpoint (1440px)", () => {
    mockMatchMedia(true)
    renderHook(() => useIsOptimalWidth())
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1440px)")
  })
})

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("queries prefers-reduced-motion", () => {
    mockMatchMedia(false)
    renderHook(() => usePrefersReducedMotion())
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
  })
})
