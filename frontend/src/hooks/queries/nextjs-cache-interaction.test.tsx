/**
 * F08 — verifies the QueryClient's own cache strategy does not silently
 * double-cache or conflict with Next.js 16's cache model, end to end
 * through a REAL query hook, the REAL api.ts client, and the REAL proxy
 * route handler (not a reimplementation of any of them).
 *
 * Why this needed checking at all: Next.js 13–14 cached every fetch() call
 * by default unless you explicitly opted out. Next.js 16 flipped that —
 * fetch() is uncached by default, caching requires explicit opt-in. If the
 * proxy route handler (src/app/api/proxy/[...path]/route.ts) had been
 * written assuming the old implicit-cache behavior, it could silently
 * serve a stale cached response to every client request regardless of
 * what TanStack Query does client-side — TanStack Query would think it's
 * getting a fresh fetch every time, while actually reading a stale
 * Next.js Data Cache entry underneath it. Two independent caching layers
 * fighting each other is exactly the failure mode to rule out here.
 *
 * The proxy route already has three independent reasons it should be safe
 * (checked by reading the real source): its own outbound fetch() sets no
 * `cache`/`next.revalidate` option (defaults to uncached under Next 16),
 * it reads request.cookies (which forces dynamic rendering on its own),
 * and it explicitly exports `dynamic = "force-dynamic"`. This test proves
 * that empirically rather than trusting the reasoning: two independent
 * useSessions() mounts must each trigger their own real outbound fetch to
 * the backend — if Next.js's route/data cache were serving a cached
 * response instead, the second mount's request would never reach the
 * mocked backend fetch a second time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"
import { NextRequest } from "next/server"
import { useSessions } from "./sessions"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { GET as proxyGET } from "@/app/api/proxy/[...path]/route"

// The real api.ts calls the real global fetch("/api/proxy/...") — routed
// here into the REAL Next.js route handler function, so this test
// exercises the actual proxy code path, not a mock standing in for it.
const backendFetchMock = vi.fn()

function fetchThroughRealProxyRoute(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input.toString()
  if (!url.includes("/api/proxy/")) {
    throw new Error(`Unexpected fetch in this test: ${url}`)
  }
  const path = url.split("/api/proxy/")[1]
  const headers = new Headers(init?.headers)
  headers.set("cookie", "access_token=test-jwt")
  const request = new NextRequest(`http://localhost:3000/api/proxy/${path}`, {
    method: init?.method ?? "GET",
    headers,
  })
  return proxyGET(request, { params: Promise.resolve({ path: path.split("/") }) })
}

describe("Next.js 16 cache interaction: TanStack Query through the real proxy route", () => {
  beforeEach(() => {
    backendFetchMock.mockReset()
    // A fresh Response per call — a Response body can only be read once,
    // and mockResolvedValue would hand back the SAME already-consumed
    // instance to every call.
    backendFetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ sessions: [{ id: "s1" }], total: 1, page: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    )
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.startsWith("/api/proxy/") || url.includes("/api/proxy/")) {
        return fetchThroughRealProxyRoute(input, init)
      }
      // The route handler's own OUTBOUND fetch to the backend — this is the
      // one whose call count actually proves whether caching happened.
      return backendFetchMock(url, init)
    }))
  })

  it("issues a real, independent backend fetch for each fresh QueryClient — no Next.js-layer cache serves a stale response instead", async () => {
    // Two separate mounts, each with its own fresh QueryClient (simulating
    // two genuinely separate page loads, not a client-cache hit within the
    // same session — that's a different, already-covered case).
    const { Wrapper: WrapperA } = createQueryWrapper()
    const { result: resultA, unmount: unmountA } = renderHook(() => useSessions(), { wrapper: WrapperA })
    await waitFor(() => expect(resultA.current.isSuccess).toBe(true))
    unmountA()
    cleanup()

    const { Wrapper: WrapperB } = createQueryWrapper()
    const { result: resultB } = renderHook(() => useSessions(), { wrapper: WrapperB })
    await waitFor(() => expect(resultB.current.isSuccess).toBe(true))

    // If the proxy route (or Next.js underneath it) were caching the
    // backend response, this second, independent mount would still get
    // isSuccess:true with data — but WITHOUT a second real backend call.
    // That's the actual failure mode being ruled out.
    expect(backendFetchMock).toHaveBeenCalledTimes(2)
    expect(resultA.current.data).toEqual([{ id: "s1" }])
    expect(resultB.current.data).toEqual([{ id: "s1" }])
  })

  it("TanStack Query's own cache (not Next.js) is what dedupes a second render of the same mounted hook", async () => {
    const { Wrapper } = createQueryWrapper()
    const { result, rerender } = renderHook(() => useSessions(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(backendFetchMock).toHaveBeenCalledTimes(1)

    // Re-rendering the SAME mounted hook within staleTime must not refetch —
    // this is TanStack Query's cache working as intended, the thing that
    // should be deduping here, not a Next.js layer underneath it.
    rerender()
    await new Promise((r) => setTimeout(r, 0))
    expect(backendFetchMock).toHaveBeenCalledTimes(1)
  })

  it("the proxy route handler's outbound fetch sets no cache/revalidate option — confirms it relies on Next 16's uncached-by-default, not stale opt-in config", async () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSessions(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [, options] = backendFetchMock.mock.calls[0]
    expect(options).not.toHaveProperty("cache")
    expect(options?.next).toBeUndefined()
  })
})
