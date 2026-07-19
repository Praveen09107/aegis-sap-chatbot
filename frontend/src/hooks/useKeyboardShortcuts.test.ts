import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useKeyboardShortcuts } from "./useKeyboardShortcuts"

// Defaults to document.body, not document itself — real keydown events
// always target an Element (document.activeElement, which defaults to
// <body> when nothing is focused); dispatching on document directly is a
// test-only case the hook doesn't need to handle for real browser usage.
function fireKey(init: Partial<KeyboardEventInit> & { key: string }, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe("useKeyboardShortcuts", () => {
  it("fires the handler when meta+key matches (Mac convention)", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "k", meta: true, handler }]))

    fireKey({ key: "k", metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("also fires on ctrl+key when meta:true (Windows convention)", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "k", meta: true, handler }]))

    fireKey({ key: "k", ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("does not fire when no modifier is pressed but meta is required", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "k", meta: true, handler }]))

    fireKey({ key: "k" })
    expect(handler).not.toHaveBeenCalled()
  })

  it("requires ctrl specifically when ctrl:true is set (not satisfied by meta alone)", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "s", ctrl: true, handler }]))

    fireKey({ key: "s", metaKey: true })
    expect(handler).not.toHaveBeenCalled()

    fireKey({ key: "s", ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("fires plain keys like Escape with no modifiers", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "Escape", handler }]))

    fireKey({ key: "Escape" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("does not fire while focus is inside an input, by default", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "k", meta: true, handler }]))

    const input = document.createElement("input")
    document.body.appendChild(input)
    fireKey({ key: "k", metaKey: true }, input)
    document.body.removeChild(input)

    expect(handler).not.toHaveBeenCalled()
  })

  it("fires inside an input when ignoreInInput is explicitly false", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "Enter", ignoreInInput: false, handler }]))

    const input = document.createElement("input")
    document.body.appendChild(input)
    fireKey({ key: "Enter" }, input)
    document.body.removeChild(input)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("calls preventDefault only when preventDefault: true", () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: "k", meta: true, preventDefault: true, handler }]))

    const event = fireKey({ key: "k", metaKey: true })
    expect(event.defaultPrevented).toBe(true)
  })

  it("picks up updated shortcuts without needing to re-mount", () => {
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    const { rerender } = renderHook(({ shortcuts }) => useKeyboardShortcuts(shortcuts), {
      initialProps: { shortcuts: [{ key: "k", meta: true, handler: handlerA }] },
    })

    rerender({ shortcuts: [{ key: "k", meta: true, handler: handlerB }] })
    fireKey({ key: "k", metaKey: true })

    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).toHaveBeenCalledTimes(1)
  })
})
