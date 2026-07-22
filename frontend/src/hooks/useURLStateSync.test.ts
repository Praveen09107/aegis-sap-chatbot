import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useURLStateSync } from "./useURLStateSync"

const replaceMock = vi.fn()
let searchParamsValue = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => replaceMock(...args) }),
  usePathname: () => "/admin/documents",
  useSearchParams: () => searchParamsValue,
}))

describe("useURLStateSync", () => {
  beforeEach(() => {
    replaceMock.mockClear()
    searchParamsValue = new URLSearchParams()
  })

  it("hydrates from the URL once on mount when params are present", () => {
    searchParamsValue = new URLSearchParams("module=SD&status=active")
    const hydrate = vi.fn()

    renderHook(() => useURLStateSync({ module: undefined, status: undefined, content_type: undefined }, hydrate))

    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(hydrate).toHaveBeenCalledWith({ module: "SD", status: "active" })
  })

  it("does not call hydrate when the URL has none of the tracked keys", () => {
    searchParamsValue = new URLSearchParams("unrelated=1")
    const hydrate = vi.fn()

    renderHook(() => useURLStateSync({ module: undefined, status: undefined }, hydrate))
    expect(hydrate).not.toHaveBeenCalled()
  })

  it("mirrors a values change into the URL via router.replace", () => {
    const hydrate = vi.fn()
    const { rerender } = renderHook(({ values }) => useURLStateSync(values, hydrate), {
      initialProps: { values: { module: undefined as string | undefined } },
    })
    expect(replaceMock).not.toHaveBeenCalled()

    act(() => {
      rerender({ values: { module: "SD" } })
    })

    expect(replaceMock).toHaveBeenCalledWith("/admin/documents?module=SD", { scroll: false })
  })

  it("removes a key from the URL when its value becomes undefined", () => {
    searchParamsValue = new URLSearchParams("module=SD")
    const hydrate = vi.fn()
    const { rerender } = renderHook(({ values }) => useURLStateSync(values, hydrate), {
      initialProps: { values: { module: "SD" as string | undefined } },
    })

    act(() => {
      rerender({ values: { module: undefined } })
    })

    expect(replaceMock).toHaveBeenCalledWith("/admin/documents", { scroll: false })
  })

  it("skips exactly one persist cycle right after a hydration that changed something (no immediate clobber)", () => {
    searchParamsValue = new URLSearchParams("range=30")
    const hydrate = vi.fn((fromUrl: Record<string, string>) => {
      // Simulates the real caller pattern: hydrate() triggers a store update
      // that will only be reflected in `values` on the NEXT render.
      void fromUrl
    })

    renderHook(() => useURLStateSync({ range: 7 }, hydrate))

    // Even though the initial `values` (range: 7) differs from the URL
    // (range=30) the hook just read, it must not immediately overwrite the
    // URL back to range=7 — that would race the caller's own state update.
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it("does not call router.replace when the computed query string is unchanged", () => {
    searchParamsValue = new URLSearchParams("module=SD")
    const hydrate = vi.fn()
    const { rerender } = renderHook(({ values }) => useURLStateSync(values, hydrate), {
      initialProps: { values: { module: "SD" as string | undefined } },
    })

    act(() => {
      rerender({ values: { module: "SD" } })
    })

    expect(replaceMock).not.toHaveBeenCalled()
  })
})
