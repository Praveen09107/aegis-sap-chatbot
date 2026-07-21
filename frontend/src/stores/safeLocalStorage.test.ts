import { describe, it, expect } from "vitest"
import { createSafeLocalStorage } from "./safeLocalStorage"

// jsdom's localStorage is a WHATWG "legacy platform object" — vi.spyOn on
// its instance methods is silently absorbed rather than actually shadowing
// them (see panelStore.test.tsx for the full explanation), so throwing
// methods are simulated by swapping window.localStorage itself.
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

describe("createSafeLocalStorage", () => {
  it("getItem() reads a real value back", () => {
    window.localStorage.setItem("k", "v")
    expect(createSafeLocalStorage().getItem("k")).toBe("v")
    window.localStorage.removeItem("k")
  })

  it("getItem() returns null (not a throw) when localStorage.getItem throws", () => {
    withThrowingLocalStorage(
      {
        getItem: () => {
          throw new DOMException("SecurityError")
        },
      },
      () => {
        expect(createSafeLocalStorage().getItem("k")).toBeNull()
      }
    )
  })

  it("setItem() writes a real value", () => {
    createSafeLocalStorage().setItem("k2", "v2")
    expect(window.localStorage.getItem("k2")).toBe("v2")
    window.localStorage.removeItem("k2")
  })

  it("setItem() does not throw when localStorage.setItem throws", () => {
    withThrowingLocalStorage(
      {
        setItem: () => {
          throw new DOMException("QuotaExceededError")
        },
      },
      () => {
        expect(() => createSafeLocalStorage().setItem("k", "v")).not.toThrow()
      }
    )
  })

  it("removeItem() removes a real value", () => {
    window.localStorage.setItem("k3", "v3")
    createSafeLocalStorage().removeItem("k3")
    expect(window.localStorage.getItem("k3")).toBeNull()
  })

  it("removeItem() does not throw when localStorage.removeItem throws", () => {
    withThrowingLocalStorage(
      {
        removeItem: () => {
          throw new DOMException("SecurityError")
        },
      },
      () => {
        expect(() => createSafeLocalStorage().removeItem("k")).not.toThrow()
      }
    )
  })
})
