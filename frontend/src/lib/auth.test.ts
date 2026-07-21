import { describe, it, expect, afterEach, vi } from "vitest"
import {
  isAuthenticated,
  getUserRole,
  getAuthState,
  getAccessToken,
  loginWithCredentials,
  refreshAccessToken,
  logout,
} from "./auth"
import { useSessionStore } from "@/stores/sessionStore"
import { usePanelStore } from "@/stores/panelStore"
import { useAdminStore } from "@/stores/adminStore"

function setCookie(value: string) {
  document.cookie = value
}

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim()
    if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  })
}

describe("isAuthenticated", () => {
  afterEach(clearCookies)

  it("returns false with no user_role cookie", () => {
    expect(isAuthenticated()).toBe(false)
  })

  it("returns true once user_role cookie is present", () => {
    setCookie("user_role=employee")
    expect(isAuthenticated()).toBe(true)
  })
})

describe("getUserRole", () => {
  afterEach(clearCookies)

  it("returns null with no cookie", () => {
    expect(getUserRole()).toBeNull()
  })

  it("returns 'employee' when cookie says employee", () => {
    setCookie("user_role=employee")
    expect(getUserRole()).toBe("employee")
  })

  it("returns 'it-admin' when cookie says it-admin", () => {
    setCookie("user_role=it-admin")
    expect(getUserRole()).toBe("it-admin")
  })
})

describe("getAuthState", () => {
  afterEach(clearCookies)

  it("reports unauthenticated with no cookie", () => {
    expect(getAuthState()).toEqual({ isAuthenticated: false, role: null })
  })

  it("reports authenticated with the correct role once the cookie is set", () => {
    setCookie("user_role=it-admin")
    expect(getAuthState()).toEqual({ isAuthenticated: true, role: "it-admin" })
  })
})

describe("getAccessToken", () => {
  it("always returns null — the access token is an HttpOnly cookie, never readable from JS", () => {
    expect(getAccessToken()).toBeNull()
  })
})

describe("loginWithCredentials", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns success on a 200 response from /api/auth/login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    )
    const result = await loginWithCredentials("jdoe", "hunter2")
    expect(result).toEqual({ success: true })
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("surfaces the server's error message on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, error: "Invalid credentials." }),
      })
    )
    const result = await loginWithCredentials("jdoe", "wrong")
    expect(result).toEqual({ success: false, error: "Invalid credentials." })
  })

  it("returns a connection-error result if the fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const result = await loginWithCredentials("jdoe", "hunter2")
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/connection error/i)
  })
})

describe("refreshAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns true when /api/auth/refresh responds ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    expect(await refreshAccessToken()).toBe(true)
  })

  it("returns false when the refresh endpoint rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    expect(await refreshAccessToken()).toBe(false)
  })

  it("returns false (not throw) on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    expect(await refreshAccessToken()).toBe(false)
  })
})

describe("logout", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls the DELETE cookie-clear endpoint before redirecting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const original = window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, href: "" },
    })

    await logout()

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/set-token", { method: "DELETE" })
    expect(window.location.href).toBe("/login")

    Object.defineProperty(window, "location", { configurable: true, value: original })
  })

  it("clears persisted store state (pinned sessions, panel prefs, admin selections) so it can't leak into the next user's session", async () => {
    // sessionStore and panelStore persist to localStorage — on a shared
    // machine, a stale pinnedIds/activeSessionId left over from a previous
    // user would otherwise show up for whoever logs in next.
    useSessionStore.setState({
      sessions: [{ id: "s1" } as never],
      activeSessionId: "s1",
      searchQuery: "vl150",
      pinnedIds: new Set(["s1"]),
    })
    usePanelStore.setState({ collapsed: true })
    useAdminStore.setState({ selectedDocumentIds: new Set(["d1"]) })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const original = window.location
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, href: "" } })

    await logout()

    expect(useSessionStore.getState().sessions).toEqual([])
    expect(useSessionStore.getState().activeSessionId).toBeNull()
    expect(useSessionStore.getState().pinnedIds.size).toBe(0)
    expect(usePanelStore.getState().collapsed).toBe(false)
    expect(useAdminStore.getState().selectedDocumentIds.size).toBe(0)

    Object.defineProperty(window, "location", { configurable: true, value: original })
  })
})
