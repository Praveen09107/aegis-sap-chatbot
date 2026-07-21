import { describe, it, expect, beforeEach } from "vitest"
import { STORAGE_KEYS } from "@/lib/constants"
import { usePanelStore } from "./panelStore"

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
    usePanelStore.setState({ collapsed: false, activeTab: "source" })
  })

  it("starts expanded, on the 'source' tab, by default", () => {
    expect(usePanelStore.getState().collapsed).toBe(false)
    expect(usePanelStore.getState().activeTab).toBe("source")
  })

  it("toggle() flips collapsed and persists it to localStorage", () => {
    usePanelStore.getState().toggle()
    expect(usePanelStore.getState().collapsed).toBe(true)

    const raw = window.localStorage.getItem(STORAGE_KEYS.PANEL_COLLAPSED)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toMatchObject({ state: { collapsed: true } })

    usePanelStore.getState().toggle()
    expect(usePanelStore.getState().collapsed).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.PANEL_COLLAPSED)!)).toMatchObject({
      state: { collapsed: false },
    })
  })

  it("setCollapsed() sets an explicit value", () => {
    usePanelStore.getState().setCollapsed(true)
    expect(usePanelStore.getState().collapsed).toBe(true)
  })

  it("setActiveTab() switches between 'source' and 'scores'", () => {
    usePanelStore.getState().setActiveTab("scores")
    expect(usePanelStore.getState().activeTab).toBe("scores")
  })

  it("still flips in-memory state (no throw) when localStorage.setItem throws (e.g. private browsing quota)", () => {
    // zustand's persist middleware itself does NOT catch storage errors —
    // its wrapped set() calls storage.setItem() synchronously right after
    // updating in-memory state, and an uncaught throw there would propagate
    // out of toggle() into whatever called it. safeLocalStorage.ts is what
    // actually prevents that; this test is what would catch a regression if
    // that safety wrapper were ever removed.
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

  it("defaults to null (not a crash) when localStorage.getItem throws on rehydration", () => {
    withThrowingLocalStorage(
      {
        getItem: () => {
          throw new DOMException("SecurityError")
        },
      },
      () => {
        expect(() => usePanelStore.persist.rehydrate()).not.toThrow()
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
})
