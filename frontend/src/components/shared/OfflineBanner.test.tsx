import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { OfflineBanner } from "./OfflineBanner"

function setOnlineStatus(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value })
}

describe("OfflineBanner", () => {
  const originalOnLine = window.navigator.onLine

  beforeEach(() => {
    setOnlineStatus(true)
  })

  afterEach(() => {
    setOnlineStatus(originalOnLine)
    vi.useRealTimers()
  })

  it("renders nothing while online", () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("shows the offline message when the browser goes offline", async () => {
    render(<OfflineBanner />)

    setOnlineStatus(false)
    act(() => window.dispatchEvent(new Event("offline")))

    expect(await screen.findByText(/No network connection/i)).toBeInTheDocument()
  })

  it("shows 'Connection restored' briefly after coming back online, then hides", async () => {
    vi.useFakeTimers()
    render(<OfflineBanner />)

    setOnlineStatus(false)
    act(() => window.dispatchEvent(new Event("offline")))
    // Synchronous query, not findBy* — fake timers are active, and the
    // useSyncExternalStore-driven state update already happened inside act().
    expect(screen.getByText(/No network connection/i)).toBeInTheDocument()

    setOnlineStatus(true)
    act(() => window.dispatchEvent(new Event("online")))
    expect(screen.getByText("Connection restored")).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("does not show 'Connection restored' on a fresh mount that was never offline", () => {
    render(<OfflineBanner />)
    act(() => window.dispatchEvent(new Event("online")))
    expect(screen.queryByText("Connection restored")).not.toBeInTheDocument()
  })
})
