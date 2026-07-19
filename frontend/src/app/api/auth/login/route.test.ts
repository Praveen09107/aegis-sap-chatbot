import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "./route"

// F03 / FRONTEND_VERIFICATION_STANDARDS.md Part 6 — cookie flags confirmed
// directly against what the route handler actually sets, not assumed from
// reading the source. This is an in-process equivalent of the spec's
// Playwright-driven cookie check (this sandbox cannot run a real browser —
// see tests/e2e/design-tokens.spec.ts's own note on the same limitation —
// so this exercises the exact same code path without one).
function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

function fakeJwt(roles: string[]) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ realm_access: { roles } })).toString("base64url")
  return `${header}.${payload}.sig`
}

describe("POST /api/auth/login", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sets access_token/refresh_token as HttpOnly, SameSite=Lax cookies on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: fakeJwt(["employee"]),
          refresh_token: "real-refresh-token",
          expires_in: 900,
        }),
      })
    )

    const response = await POST(makeRequest({ username: "jdoe", password: "hunter2" }))
    expect(response.status).toBe(200)

    const access = response.cookies.get("access_token")
    const refresh = response.cookies.get("refresh_token")
    const role = response.cookies.get("user_role")

    expect(access?.httpOnly).toBe(true)
    expect(access?.sameSite).toBe("lax")
    expect(refresh?.httpOnly).toBe(true)
    expect(refresh?.sameSite).toBe("lax")

    // user_role must NOT be HttpOnly — client-side routing reads it directly.
    expect(role?.httpOnly).toBe(false)
    expect(role?.value).toBe("employee")
  })

  it("derives it-admin role from the JWT's realm_access.roles claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: fakeJwt(["it-admin", "employee"]),
          refresh_token: "real-refresh-token",
          expires_in: 900,
        }),
      })
    )

    const response = await POST(makeRequest({ username: "admin", password: "hunter2" }))
    expect(response.cookies.get("user_role")?.value).toBe("it-admin")
  })

  it("never puts raw token material in the JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: fakeJwt(["employee"]),
          refresh_token: "real-refresh-token",
          expires_in: 900,
        }),
      })
    )

    const response = await POST(makeRequest({ username: "jdoe", password: "hunter2" }))
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain("eyJ")
    expect(body).toEqual({ success: true })
  })

  it("returns 401 with the Keycloak error message on invalid credentials, sets no cookies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error_description: "Invalid user credentials" }),
      })
    )

    const response = await POST(makeRequest({ username: "jdoe", password: "wrong" }))
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ success: false, error: "Invalid user credentials" })
    expect(response.cookies.get("access_token")).toBeUndefined()
  })

  it("returns 502 (not a crash) when Keycloak is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const response = await POST(makeRequest({ username: "jdoe", password: "hunter2" }))
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.success).toBe(false)
  })
})
