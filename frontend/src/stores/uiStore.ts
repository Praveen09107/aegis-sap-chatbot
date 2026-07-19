import { create } from "zustand"

/**
 * uiStore — STUB version (FRONTEND_09_LAYOUT_COMPONENTS.md's layout
 * components need commandPaletteOpen at minimum). Full implementation
 * (dark mode, shortcuts overlay, toast queue): FRONTEND_10_ZUSTAND_STORES.md
 * (session F08). Do NOT rename these exports — the employee and admin
 * layouts already import them.
 */
interface UIState {
  commandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void
}

export const useUIStore = create<UIState>()((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}))
