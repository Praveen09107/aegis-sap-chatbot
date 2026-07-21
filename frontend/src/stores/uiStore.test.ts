import { describe, it, expect, beforeEach } from "vitest"
import { useUIStore } from "./uiStore"

describe("uiStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      commandPaletteOpen: false,
      shortcutsOverlayOpen: false,
      onboardingVisible: false,
      initializing: true,
      isOffline: false,
      multiTabWarning: false,
    })
  })

  it("starts with the documented initial state", () => {
    const state = useUIStore.getState()
    expect(state.commandPaletteOpen).toBe(false)
    expect(state.shortcutsOverlayOpen).toBe(false)
    expect(state.onboardingVisible).toBe(false)
    expect(state.initializing).toBe(true)
    expect(state.isOffline).toBe(false)
    expect(state.multiTabWarning).toBe(false)
  })

  describe("command palette", () => {
    it("openCommandPalette() opens it", () => {
      useUIStore.getState().openCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    })

    it("closeCommandPalette() closes it, even if already closed", () => {
      useUIStore.getState().closeCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })

    it("toggleCommandPalette() flips the current state", () => {
      useUIStore.getState().toggleCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
      useUIStore.getState().toggleCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })

    it("resolves correctly when toggle and open fire back-to-back in the same tick (no lost update)", () => {
      // Simulates two rapid triggers (e.g. a ⌘K keydown immediately followed
      // by a click) racing against each other. Each Zustand set() call reads
      // fresh state, so the final value must reflect both calls applied in
      // order, not whichever call's closure happened to capture stale state.
      const { toggleCommandPalette, openCommandPalette } = useUIStore.getState()
      toggleCommandPalette() // false -> true
      openCommandPalette() // stays true
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    })
  })

  describe("shortcuts overlay", () => {
    it("open/closeShortcutsOverlay() toggle independently of the command palette", () => {
      useUIStore.getState().openCommandPalette()
      useUIStore.getState().openShortcutsOverlay()
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
      expect(useUIStore.getState().shortcutsOverlayOpen).toBe(true)

      useUIStore.getState().closeShortcutsOverlay()
      expect(useUIStore.getState().shortcutsOverlayOpen).toBe(false)
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    })
  })

  it("setOnboardingVisible() sets an explicit value", () => {
    useUIStore.getState().setOnboardingVisible(true)
    expect(useUIStore.getState().onboardingVisible).toBe(true)
  })

  it("setInitializing() sets an explicit value", () => {
    useUIStore.getState().setInitializing(false)
    expect(useUIStore.getState().initializing).toBe(false)
  })

  it("setIsOffline() sets an explicit value", () => {
    useUIStore.getState().setIsOffline(true)
    expect(useUIStore.getState().isOffline).toBe(true)
  })

  it("setMultiTabWarning() sets an explicit value, independent of other UI state", () => {
    useUIStore.getState().openCommandPalette()
    useUIStore.getState().setMultiTabWarning(true)

    expect(useUIStore.getState().multiTabWarning).toBe(true)
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)

    useUIStore.getState().setMultiTabWarning(false)
    expect(useUIStore.getState().multiTabWarning).toBe(false)
  })
})
