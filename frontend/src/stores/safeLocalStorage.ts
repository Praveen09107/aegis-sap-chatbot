import type { StateStorage } from "zustand/middleware"

/**
 * localStorage adapter for zustand's persist middleware, safe for both SSR
 * and a throwing localStorage (private browsing quota, disabled storage).
 *
 * zustand's persist middleware does not catch storage errors itself — its
 * wrapped `set` calls storage.setItem() synchronously right after updating
 * in-memory state, and a throw there propagates straight out of whatever
 * store action was called (e.g. `toggle()`), all the way into the calling
 * component's event handler. Swallowing failures here, at the storage
 * adapter boundary, is what actually stops that: the in-memory update
 * already happened either way, so a failed write just means "this session's
 * preference won't survive a reload," not a crash.
 */
export function createSafeLocalStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null
      try {
        return window.localStorage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") return
      try {
        window.localStorage.setItem(name, value)
      } catch {
        // ignore — the in-memory state update already succeeded
      }
    },
    removeItem: (name) => {
      if (typeof window === "undefined") return
      try {
        window.localStorage.removeItem(name)
      } catch {
        // ignore
      }
    },
  }
}
