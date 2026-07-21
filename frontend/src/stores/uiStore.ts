import { create } from "zustand"

interface UIState {
  // ── Command palette ───────────────────────────────────────
  commandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void

  // ── Keyboard shortcuts overlay ────────────────────────────
  shortcutsOverlayOpen: boolean
  openShortcutsOverlay: () => void
  closeShortcutsOverlay: () => void

  // ── Onboarding ────────────────────────────────────────────
  onboardingVisible: boolean
  setOnboardingVisible: (visible: boolean) => void

  // ── Global loading ────────────────────────────────────────
  /**
   * True during initial auth check on app load, per this store's own spec
   * (FRONTEND_10_ZUSTAND_STORES.md). The employee/admin layouts built in F07
   * gate on useAuth()'s own `initializing` (a useSyncExternalStore-based
   * hydration flag, not this field) since that's what actually reflects the
   * real cookie read — nothing currently calls setInitializing() here. Kept
   * as a real, working field for whatever future session was meant to wire
   * it up, not removed, since it's not this session's job to resolve the
   * overlap between the two.
   */
  initializing: boolean
  setInitializing: (initializing: boolean) => void

  // ── Offline state ─────────────────────────────────────────
  isOffline: boolean
  setIsOffline: (offline: boolean) => void
}

/**
 * Global UI state — not persisted (reset on page reload).
 * Used by layouts to coordinate overlays and global state.
 */
export const useUIStore = create<UIState>()((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  shortcutsOverlayOpen: false,
  openShortcutsOverlay: () => set({ shortcutsOverlayOpen: true }),
  closeShortcutsOverlay: () => set({ shortcutsOverlayOpen: false }),

  onboardingVisible: false,
  setOnboardingVisible: (onboardingVisible) => set({ onboardingVisible }),

  initializing: true,
  setInitializing: (initializing) => set({ initializing }),

  isOffline: false,
  setIsOffline: (isOffline) => set({ isOffline }),
}))
