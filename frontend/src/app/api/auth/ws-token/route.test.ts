import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { GET } from "./route"

function makeRequest(cookieHeader?: string) {
  return new NextRequest("http://localhost:3000/api/auth/ws-token", {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  })
}

describe("GET /api/auth/ws-token", () => {
  it("relays the access_token cookie as ws_token", async () => {
    const response = await GET(makeRequest("access_token=a-real-jwt"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ws_token: "a-real-jwt" })
  })

  it("returns 401 when there is no access_token cookie (not authenticated)", async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: "Not authenticated" })
  })
})
