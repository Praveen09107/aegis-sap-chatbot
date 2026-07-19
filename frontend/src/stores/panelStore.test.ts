import { describe, it, expect, beforeEach } from "vitest"
import { STORAGE_KEYS } from "@/lib/constants"
import { usePanelStore, readInitialCollapsed } from "./panelStore"

// jsdom's localStorage is a WHATWG "legacy platform object" — attempting to
// vi.spyOn its instance methods (getItem/setItem) is silently absorbed by
// its custom [[DefineOwnProperty]] behavior rather than actually shadowing
// them, so a spy never intercepts real calls. The only reliable way to
// simulate a throwing localStorage (private browsing, quota exceeded,
// disabled storage) is to swap out `window.localStorage` itself for a
// plain object with real throwing methods, then restore the original.
// Storage's real methods live on its prototype (non-enumerable), so a
// naive `{ ...original, ...methods }` spread would silently drop them —
// every method the stub needs is listed explicitly instead.
function withThrowingLocalStorage(methods: Partial<Storage>, run: () => void) {
  const original = window.localStorage
  const stub: Partial<Storage> = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    ...methods,
  }
  Object.defineProperty(window, "localStorage", { configurable: true, value: stub })
  try {
    run()
  } finally {
    Object.defineProperty(window, "localStorage", { configurable: true, value: original })
  }
}

describe("panelStore", () => {
  beforeEach(() => {
    window.localStorage.clear()
    usePanelStore.setState({ collapsed: false })
  })

  it("starts expanded by default", () => {
    expect(usePanelStore.getState().collapsed).toBe(false)
  })

  it("toggle() flips collapsed and persists it to localStorage", () => {
    usePanelStore.getState().toggle()
    expect(usePanelStore.getState().collapsed).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEYS.PANEL_COLLAPSED)).toBe("true")

    usePanelStore.getState().toggle()
    expect(usePanelStore.getState().collapsed).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEYS.PANEL_COLLAPSED)).toBe("false")
  })

  it("setCollapsed() sets an explicit value", () => {
    usePanelStore.getState().setCollapsed(true)
    expect(usePanelStore.getState().collapsed).toBe(true)
  })

  it("still flips in-memory state when localStorage.setItem throws (e.g. private browsing quota)", () => {
    withThrowingLocalStorage(
      {
        setItem: () => {
          throw new DOMException("QuotaExceededError")
        },
      },
      () => {
        expect(() => usePanelStore.getState().toggle()).not.toThrow()
        expect(usePanelStore.getState().collapsed).toBe(true)
      }
    )
  })

  it("resolves correctly when two toggles fire in the same tick (no lost update)", () => {
    // Each toggle() reads get().collapsed fresh rather than closing over a
    // stale value, so two toggles back-to-back must net out to the
    // original state, not double-apply or skip one.
    const { toggle } = usePanelStore.getState()
    toggle()
    toggle()
    expect(usePanelStore.getState().collapsed).toBe(false)
  })

  it("readInitialCollapsed() defaults to false when localStorage.getItem throws", () => {
    withThrowingLocalStorage(
      {
        getItem: () => {
          throw new DOMException("SecurityError")
        },
      },
      () => {
        expect(readInitialCollapsed()).toBe(false)
      }
    )
  })

  it("readInitialCollapsed() reads a persisted 'true' value back correctly", () => {
    window.localStorage.setItem(STORAGE_KEYS.PANEL_COLLAPSED, "true")
    expect(readInitialCollapsed()).toBe(true)
  })
})
