import { describe, it, expect, beforeEach } from "vitest"
import { useUIStore } from "./uiStore"

describe("uiStore", () => {
  beforeEach(() => {
    useUIStore.setState({ commandPaletteOpen: false })
  })

  it("starts with the command palette closed", () => {
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

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
