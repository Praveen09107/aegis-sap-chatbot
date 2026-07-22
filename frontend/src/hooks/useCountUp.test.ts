import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useCountUp } from "./useCountUp"

const usePrefersReducedMotionMock = vi.fn(() => false)
vi.mock("@/hooks/useMediaQuery", () => ({
  usePrefersReducedMotion: () => usePrefersReducedMotionMock(),
}))

describe("useCountUp", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    usePrefersReducedMotionMock.mockReturnValue(false)
  })

  // tick() lazily captures its own start timestamp from the FIRST rAF
  // callback invocation's `now` argument (not performance.now()) — so
  // reaching "N ms elapsed" needs two ticks: one to establish t=0, one at
  // t=N to compute elapsed.

  it("starts at 0 and animates up to the target via requestAnimationFrame", () => {
    let rafCallback: FrameRequestCallback = () => {}
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })

    const { result } = renderHook(() => useCountUp({ target: 100, duration: 700 }))
    expect(result.current).toBe(0)

    act(() => rafCallback(0)) // establishes the start timestamp
    act(() => rafCallback(700)) // full duration elapsed
    expect(result.current).toBe(100)
  })

  it("advances partway through the animation with an eased value between 0 and target", () => {
    let rafCallback: FrameRequestCallback = () => {}
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })

    const { result } = renderHook(() => useCountUp({ target: 100, duration: 700 }))
    act(() => rafCallback(0))
    act(() => rafCallback(350))

    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(100)
  })

  it("jumps straight to target with no animation when enabled is false", () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame")
    const { result } = renderHook(() => useCountUp({ target: 42, enabled: false }))
    expect(result.current).toBe(42)
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it("jumps straight to target when prefers-reduced-motion is on, without calling requestAnimationFrame", () => {
    usePrefersReducedMotionMock.mockReturnValue(true)
    const rafSpy = vi.spyOn(window, "requestAnimationFrame")

    const { result } = renderHook(() => useCountUp({ target: 88 }))
    expect(result.current).toBe(88)
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it("re-animates from the previous value when target changes", () => {
    let rafCallback: FrameRequestCallback = () => {}
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })

    const { result, rerender } = renderHook(({ target }) => useCountUp({ target, duration: 700 }), {
      initialProps: { target: 100 },
    })
    act(() => rafCallback(0))
    act(() => rafCallback(700))
    expect(result.current).toBe(100)

    rerender({ target: 250 })
    act(() => rafCallback(1000)) // establishes a new start timestamp for the second animation
    act(() => rafCallback(1700))
    expect(result.current).toBe(250)
  })
})
