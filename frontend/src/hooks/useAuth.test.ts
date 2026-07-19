import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAuth } from "./useAuth"

const getAuthStateMock = vi.fn()
const refreshAccessTokenMock = vi.fn()
const logoutMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  getAuthState: () => getAuthStateMock(),
  refreshAccessToken: () => refreshAccessTokenMock(),
  logout: () => logoutMock(),
}))

describe("useAuth", () => {
  beforeEach(() => {
    getAuthStateMock.mockReset()
    refreshAccessTokenMock.mockReset()
    logoutMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("reflects an unauthenticated state", () => {
    getAuthStateMock.mockReturnValue({ isAuthenticated: false, role: null })
    const { result } = renderHook(() => useAuth())

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.role).toBeNull()
    expect(result.current.isEmployee).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  it("reflects an authenticated employee", () => {
    getAuthStateMock.mockReturnValue({ isAuthenticated: true, role: "employee" })
    const { result } = renderHook(() => useAuth())

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isEmployee).toBe(true)
    expect(result.current.isAdmin).toBe(false)
  })

  it("reflects an authenticated it-admin", () => {
    getAuthStateMock.mockReturnValue({ isAuthenticated: true, role: "it-admin" })
    const { result } = renderHook(() => useAuth())

    expect(result.current.isEmployee).toBe(false)
    expect(result.current.isAdmin).toBe(true)
  })

  it("refreshAuthState() re-reads auth state (e.g. after a login callback)", () => {
    getAuthStateMock.mockReturnValue({ isAuthenticated: false, role: null })
    const { result } = renderHook(() => useAuth())

    getAuthStateMock.mockReturnValue({ isAuthenticated: true, role: "employee" })
    act(() => result.current.refreshAuthState())

    expect(result.current.isAuthenticated).toBe(true)
  })

  it("silently refreshes the token every 12 minutes while authenticated", () => {
    vi.useFakeTimers()
    getAuthStateMock.mockReturnValue({ isAuthenticated: true, role: "employee" })
    refreshAccessTokenMock.mockResolvedValue(true)

    renderHook(() => useAuth())

    expect(refreshAccessTokenMock).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(12 * 60 * 1000))
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1)
  })

  it("logs out if the silent refresh fails", async () => {
    vi.useFakeTimers()
    getAuthStateMock.mockReturnValue({ isAuthenticated: true, role: "employee" })
    refreshAccessTokenMock.mockResolvedValue(false)

    renderHook(() => useAuth())
    await act(async () => {
      vi.advanceTimersByTime(12 * 60 * 1000)
      // Let the resolved refreshAccessToken() promise's .then continuation run.
      await Promise.resolve()
    })

    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it("does not schedule a refresh timer when unauthenticated", () => {
    vi.useFakeTimers()
    getAuthStateMock.mockReturnValue({ isAuthenticated: false, role: null })

    renderHook(() => useAuth())
    act(() => vi.advanceTimersByTime(60 * 60 * 1000))

    expect(refreshAccessTokenMock).not.toHaveBeenCalled()
  })
})
