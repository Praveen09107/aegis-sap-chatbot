import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { STORAGE_KEYS } from "@/lib/constants"
import { createSafeLocalStorage } from "./safeLocalStorage"

interface PanelState {
  // ── Source attribution panel (right panel in employee chat) ──
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void

  // ── Active panel tab ─────────────────────────────────────
  /** 'source' = document reference | 'scores' = breakdown bars */
  activeTab: "source" | "scores"
  setActiveTab: (tab: "source" | "scores") => void
}

/**
 * Panel collapse state is persisted to localStorage.
 * Users' preference is remembered across sessions.
 */
export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      collapsed: false,
      activeTab: "source",

      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    {
      name: STORAGE_KEYS.PANEL_COLLAPSED,
      storage: createJSONStorage(createSafeLocalStorage),
      partialize: (state) => ({
        collapsed: state.collapsed,
        activeTab: state.activeTab,
      }),
    }
  )
)
