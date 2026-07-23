import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAutoSave } from "./useAutoSave"

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not save on the interval if nothing changed since mount", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAutoSave({ enabled: true, intervalMs: 1000, onSave, dependencies: ["a"] }))

    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(onSave).not.toHaveBeenCalled()
  })

  it("saves on the next interval tick after a dependency changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ deps }) => useAutoSave({ enabled: true, intervalMs: 1000, onSave, dependencies: deps }), {
      initialProps: { deps: ["a"] },
    })

    rerender({ deps: ["b"] })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("does not save again on the following tick if nothing changed since the last save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ deps }) => useAutoSave({ enabled: true, intervalMs: 1000, onSave, dependencies: deps }), {
      initialProps: { deps: ["a"] },
    })

    rerender({ deps: ["b"] })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(onSave).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("reports saving -> saved status, then idles out after 3s", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = renderHook(({ deps }) => useAutoSave({ enabled: true, intervalMs: 1000, onSave, dependencies: deps }), {
      initialProps: { deps: ["a"] },
    })

    rerender({ deps: ["b"] })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(result.current.saveStatus).toBe("saved")

    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(result.current.saveStatus).toBe("idle")
  })

  it("marks dirty again on failure so the next tick retries the save", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined)
    const { result, rerender } = renderHook(({ deps }) => useAutoSave({ enabled: true, intervalMs: 1000, onSave, dependencies: deps }), {
      initialProps: { deps: ["a"] },
    })

    rerender({ deps: ["b"] })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(result.current.saveStatus).toBe("error")
    expect(onSave).toHaveBeenCalledTimes(1)

    // No new dependency change — the retry must come from the dirty flag
    // being re-set on failure, not from a fresh edit.
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(result.current.saveStatus).toBe("saved")
  })

  it("never saves while disabled", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ deps }) => useAutoSave({ enabled: false, intervalMs: 1000, onSave, dependencies: deps }), {
      initialProps: { deps: ["a"] },
    })

    rerender({ deps: ["b"] })
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(onSave).not.toHaveBeenCalled()
  })
})
