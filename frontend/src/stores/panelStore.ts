import { create } from "zustand"
import { STORAGE_KEYS } from "@/lib/constants"

/**
 * panelStore — STUB version (FRONTEND_09_LAYOUT_COMPONENTS.md's
 * AttributionPanelShell needs collapsed/toggle at minimum). Full
 * implementation (active panel tab): FRONTEND_10_ZUSTAND_STORES.md
 * (session F08). Do NOT rename these exports.
 */
interface PanelState {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

// Exported only so its SSR guard and localStorage-failure catch branch —
// both only exercised once, at module load, on the real store — can be
// unit tested directly instead of relying on fragile module-cache-busting.
export function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEYS.PANEL_COLLAPSED) === "true"
  } catch {
    return false
  }
}

export const usePanelStore = create<PanelState>()((set, get) => ({
  collapsed: readInitialCollapsed(),
  toggle: () => {
    const next = !get().collapsed
    set({ collapsed: next })
    try {
      window.localStorage.setItem(STORAGE_KEYS.PANEL_COLLAPSED, String(next))
    } catch {
      // localStorage unavailable — collapse state just won't persist
    }
  },
  setCollapsed: (collapsed) => set({ collapsed }),
}))
