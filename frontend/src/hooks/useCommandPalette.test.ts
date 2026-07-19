import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useCommandPalette, useCommandHistory } from "./useCommandPalette"

describe("useCommandPalette", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useCommandPalette())
    expect(result.current.isOpen).toBe(false)
  })

  it("open/close/toggle control isOpen", () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)

    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)

    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(false)
  })
})

describe("useCommandHistory", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("starts with an empty history", () => {
    const { result } = renderHook(() => useCommandHistory())
    expect(result.current.getHistory()).toEqual([])
  })

  it("adds a command to the front of history", () => {
    const { result } = renderHook(() => useCommandHistory())
    act(() => result.current.addToHistory("action:new-chat"))
    act(() => result.current.addToHistory("action:history"))
    expect(result.current.getHistory()).toEqual(["action:history", "action:new-chat"])
  })

  it("moves a re-selected command back to the front instead of duplicating it", () => {
    const { result } = renderHook(() => useCommandHistory())
    act(() => result.current.addToHistory("a"))
    act(() => result.current.addToHistory("b"))
    act(() => result.current.addToHistory("a"))
    expect(result.current.getHistory()).toEqual(["a", "b"])
  })

  it("caps history at LIMITS.MAX_RECENT_COMMANDS (5)", () => {
    const { result } = renderHook(() => useCommandHistory())
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      act(() => result.current.addToHistory(id))
    }
    expect(result.current.getHistory()).toHaveLength(5)
    expect(result.current.getHistory()).toEqual(["f", "e", "d", "c", "b"])
  })
})
