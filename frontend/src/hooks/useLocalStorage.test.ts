import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useLocalStorage } from "./useLocalStorage"

describe("useLocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("initializes from the given default when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorage("aegis:test-key", "default"))
    expect(result.current[0]).toBe("default")
  })

  it("initializes from an existing stored value", () => {
    window.localStorage.setItem("aegis:test-key", JSON.stringify("stored"))
    const { result } = renderHook(() => useLocalStorage("aegis:test-key", "default"))
    expect(result.current[0]).toBe("stored")
  })

  it("persists updates to localStorage and supports a functional updater", () => {
    const { result } = renderHook(() => useLocalStorage("aegis:counter", 0))

    act(() => result.current[1]((prev) => prev + 1))
    expect(result.current[0]).toBe(1)
    expect(JSON.parse(window.localStorage.getItem("aegis:counter")!)).toBe(1)

    act(() => result.current[1](5))
    expect(result.current[0]).toBe(5)
  })

  it("remove() clears storage and resets to the initial value", () => {
    const { result } = renderHook(() => useLocalStorage("aegis:test-key", "default"))
    act(() => result.current[1]("changed"))
    expect(result.current[0]).toBe("changed")

    act(() => result.current[2]())
    expect(result.current[0]).toBe("default")
    expect(window.localStorage.getItem("aegis:test-key")).toBeNull()
  })

  it("falls back to the default value on malformed stored JSON", () => {
    window.localStorage.setItem("aegis:test-key", "{not valid json")
    const { result } = renderHook(() => useLocalStorage("aegis:test-key", "default"))
    expect(result.current[0]).toBe("default")
  })
})
