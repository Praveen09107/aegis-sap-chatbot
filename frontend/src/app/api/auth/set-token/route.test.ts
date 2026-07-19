import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { POST, DELETE } from "./route"

// set-token's POST handler is currently orphaned (auth.ts's loginWithCredentials
// calls the single-step /api/auth/login instead — see login/route.test.ts) but
// is kept per this session's explicit "do not discard" instruction: it's a
// real, correct, independently-useful cookie-setting endpoint. Only DELETE
// (used by logout()) is on the live call path today.
function fakeJwt(roles: string[]) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ realm_access: { roles } })).toString("base64url")
  return `${header}.${payload}.sig`
}

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/set-token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/auth/set-token", () => {
  it("sets HttpOnly, SameSite=Lax cookies from a raw token payload", async () => {
    const response = await POST(
      makePostRequest({
        access_token: fakeJwt(["employee"]),
        refresh_token: "a-refresh-token",
        expires_in: 900,
      })
    )

    const access = response.cookies.get("access_token")
    const refresh = response.cookies.get("refresh_token")
    const role = response.cookies.get("user_role")

    expect(access?.httpOnly).toBe(true)
    expect(access?.sameSite).toBe("lax")
    expect(refresh?.httpOnly).toBe(true)
    expect(role?.httpOnly).toBe(false)
    expect(role?.value).toBe("employee")
  })
})

describe("DELETE /api/auth/set-token", () => {
  it("clears all three auth cookies", async () => {
    const response = await DELETE()
    expect(response.cookies.get("access_token")?.value).toBe("")
    expect(response.cookies.get("refresh_token")?.value).toBe("")
    expect(response.cookies.get("user_role")?.value).toBe("")
  })
})
