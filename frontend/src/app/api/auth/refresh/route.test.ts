import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "./route"

function makeRequest(cookieHeader?: string) {
  return new NextRequest("http://localhost:3000/api/auth/refresh", {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })
}

function fakeJwt(roles: string[]) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ realm_access: { roles } })).toString("base64url")
  return `${header}.${payload}.sig`
}

describe("POST /api/auth/refresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns 401 with no refresh_token cookie present", async () => {
    const response = await POST(makeRequest())
    expect(response.status).toBe(401)
  })

  it("persists the ROTATED refresh_token Keycloak returns, not just the access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: fakeJwt(["employee"]),
          refresh_token: "brand-new-rotated-refresh-token",
          expires_in: 900,
        }),
      })
    )

    const response = await POST(makeRequest("refresh_token=old-refresh-token"))
    expect(response.status).toBe(200)

    const refresh = response.cookies.get("refresh_token")
    expect(refresh?.value).toBe("brand-new-rotated-refresh-token")
    expect(refresh?.httpOnly).toBe(true)
    expect(refresh?.sameSite).toBe("lax")

    const access = response.cookies.get("access_token")
    expect(access?.httpOnly).toBe(true)

    // user_role must be re-derived from the fresh token, not left stale.
    expect(response.cookies.get("user_role")?.value).toBe("employee")
  })

  it("clears all auth cookies and returns 401 when Keycloak rejects the refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    const response = await POST(makeRequest("refresh_token=expired-token"))
    expect(response.status).toBe(401)
    // NextResponse.cookies.delete() sets maxAge=0 rather than omitting the cookie.
    expect(response.cookies.get("access_token")?.value).toBe("")
    expect(response.cookies.get("refresh_token")?.value).toBe("")
  })

  it("returns 500 (not a crash) on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const response = await POST(makeRequest("refresh_token=old-refresh-token"))
    expect(response.status).toBe(500)
  })
})
