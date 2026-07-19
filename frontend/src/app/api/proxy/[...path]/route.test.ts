import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "./route"

function makeRequest(path: string, init?: RequestInit & { cookie?: string }) {
  const headers = new Headers(init?.headers)
  if (init?.cookie) headers.set("cookie", init.cookie)
  return new NextRequest(`http://localhost:3000/api/proxy/${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body,
  })
}

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

describe("proxy route", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("rejects with 401 when access_token cookie is missing — never reaches the backend", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(makeRequest("admin/dashboard"), ctx(["admin", "dashboard"]))
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forwards the access_token as a Bearer header and strips the cookie header before forwarding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await GET(
      makeRequest("admin/dashboard", { cookie: "access_token=real-jwt-value; user_role=employee" }),
      ctx(["admin", "dashboard"])
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("http://aegis-fastapi:8000/admin/dashboard")

    const forwardedHeaders = options.headers as Headers
    expect(forwardedHeaders.get("authorization")).toBe("Bearer real-jwt-value")
    expect(forwardedHeaders.get("cookie")).toBeNull()
  })

  it("does not prepend /api/ to the backend path — passthrough, since backend routing is inconsistent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await GET(makeRequest("admin/dashboard", { cookie: "access_token=t" }), ctx(["admin", "dashboard"]))
    expect(fetchMock.mock.calls[0][0]).toBe("http://aegis-fastapi:8000/admin/dashboard")
  })

  it("streams the upstream response body through unmodified (binary-safe)", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/png" } })
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(
      makeRequest("screenshots/abc.png", { cookie: "access_token=t" }),
      ctx(["screenshots", "abc.png"])
    )
    const buf = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(buf)).toEqual(Array.from(bytes))
  })

  it("returns 502 (not a crash) when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const response = await POST(
      makeRequest("admin/documents", { method: "POST", cookie: "access_token=t", body: "{}" }),
      ctx(["admin", "documents"])
    )
    expect(response.status).toBe(502)
  })

  it("strips backend Set-Cookie headers — only Next.js auth routes may set cookies for the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "evil=1" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(makeRequest("admin/dashboard", { cookie: "access_token=t" }), ctx(["admin", "dashboard"]))
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})
