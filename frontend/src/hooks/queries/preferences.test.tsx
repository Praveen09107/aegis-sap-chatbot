import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePreferences, useUpdatePreferences } from "./preferences"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { UserPreferences } from "@/types"

const apiGetMock = vi.fn()
const apiPutMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
  },
}))

function createWrapper() {
  return createQueryWrapper().Wrapper
}

const prefs: UserPreferences = {
  dark_mode: null,
  panel_collapsed: false,
  pinned_session_ids: [],
  onboarding_complete: true,
  onboarding_step: 5,
}

describe("usePreferences", () => {
  it("fetches preferences with silent:true (falls back to defaults on failure, no toast)", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue(prefs)
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(prefs)
    expect(apiGetMock).toHaveBeenCalledWith("preferences", { silent: true })
  })

  it("surfaces a rejected request as an error state", async () => {
    // usePreferences sets retry: 1 explicitly (overriding the test
    // wrapper's default retry: false), so this genuinely retries once
    // before settling — the default waitFor timeout is too short to cover
    // that retry's backoff delay.
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })
  })
})

describe("useUpdatePreferences", () => {
  it("PUTs the partial update and writes the response straight into the preferences cache", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockResolvedValue(prefs)
    const { Wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: Wrapper })

    result.current.mutate({ dark_mode: true })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPutMock).toHaveBeenCalledWith("preferences", { dark_mode: true })
    expect(queryClient.getQueryData(["preferences"])).toEqual(prefs)
  })

  it("surfaces a failed update as an error state", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockRejectedValue(new Error("500"))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: Wrapper })

    result.current.mutate({ dark_mode: true })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("resolves correctly when two updates fire in the same tick — the cache must end up with the later mutation's response (race condition)", async () => {
    apiPutMock.mockReset()
    let resolveFirst!: (value: UserPreferences) => void
    const firstCall = new Promise<UserPreferences>((resolve) => {
      resolveFirst = resolve
    })
    apiPutMock.mockImplementationOnce(() => firstCall)
    apiPutMock.mockImplementationOnce(() => Promise.resolve({ ...prefs, panel_collapsed: true }))

    const { Wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: Wrapper })

    result.current.mutate({ dark_mode: true })
    result.current.mutate({ panel_collapsed: true })

    await waitFor(() => expect(queryClient.getQueryData(["preferences"])).toEqual({ ...prefs, panel_collapsed: true }))

    // The first, slower mutation resolves after the second — must not
    // overwrite the cache with its now-stale response.
    resolveFirst({ ...prefs, dark_mode: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(queryClient.getQueryData(["preferences"])).toEqual({ ...prefs, panel_collapsed: true })
  })
})
