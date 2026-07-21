import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CommandPalette } from "./CommandPalette"
import { useUIStore } from "@/stores/uiStore"
import type { Session } from "@/types"

const pushMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/",
}))

const setThemeMock = vi.fn()
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: setThemeMock }),
}))

const sessions: Session[] = [
  {
    id: "s1",
    user_id_hash: "h1",
    topic_summary: "VL150 delivery error troubleshooting",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    turn_count: 3,
    avg_confidence_score: 0.9,
    confidence_badge: "green",
    module_tags: ["SD"],
    is_pinned: false,
    is_unresolved: false,
  },
]

describe("CommandPalette", () => {
  beforeEach(() => {
    pushMock.mockClear()
    setThemeMock.mockClear()
  })

  it("renders nothing when closed", () => {
    render(<CommandPalette open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
  })

  it("renders the dialog with quick actions when open", () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />)
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument()
    expect(screen.getByText("New chat")).toBeInTheDocument()
    expect(screen.getByText("Session history")).toBeInTheDocument()
  })

  it("closes the palette and navigates when 'Session history' is selected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CommandPalette open onOpenChange={onOpenChange} />)

    await user.click(screen.getByText("Session history"))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    vi.advanceTimersByTime(50)
    expect(pushMock).toHaveBeenCalledWith("/history")
    vi.useRealTimers()
  })

  it("shows admin navigation only when isAdmin is true", () => {
    const { rerender } = render(<CommandPalette open onOpenChange={vi.fn()} isAdmin={false} />)
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument()

    rerender(<CommandPalette open onOpenChange={vi.fn()} isAdmin />)
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
  })

  it("shows recent sessions when not searching, and filters them out of view while searching", async () => {
    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={vi.fn()} sessions={sessions} />)

    expect(screen.getByText("Recent sessions")).toBeInTheDocument()
    expect(screen.getByText("VL150 delivery error troubleshooting")).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Search sessions/), "xyz-no-match")
    // "Recent sessions" is gated on the 150ms-debounced search value, not
    // the raw input — wait for the debounce to settle.
    await vi.waitFor(() => expect(screen.queryByText("Recent sessions")).not.toBeInTheDocument())
  })

  it("dispatches the open-shortcuts event when 'Keyboard shortcuts' is selected", async () => {
    const listener = vi.fn()
    document.addEventListener("aegis:open-shortcuts", listener)
    const user = userEvent.setup({ delay: null })

    render(<CommandPalette open onOpenChange={vi.fn()} />)
    await user.click(screen.getByText("Keyboard shortcuts"))

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    document.removeEventListener("aegis:open-shortcuts", listener)
  })

  describe("Restart walkthrough (FRONTEND_15 onboarding re-trigger)", () => {
    beforeEach(() => {
      localStorage.clear()
      useUIStore.setState({ onboardingVisible: false })
    })

    it("shows the action for an employee (isAdmin false)", () => {
      render(<CommandPalette open onOpenChange={vi.fn()} isAdmin={false} />)
      expect(screen.getByText("Restart walkthrough")).toBeInTheDocument()
    })

    it("does not show the action for an IT admin", () => {
      render(<CommandPalette open onOpenChange={vi.fn()} isAdmin />)
      expect(screen.queryByText("Restart walkthrough")).not.toBeInTheDocument()
    })

    it("clears the onboarding-complete flag and reopens the modal when selected", async () => {
      localStorage.setItem("aegis:onboarding-complete", "true")
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CommandPalette open onOpenChange={vi.fn()} isAdmin={false} />)

      await user.click(screen.getByText("Restart walkthrough"))
      vi.advanceTimersByTime(50) // runCommand's own close-then-act delay

      expect(localStorage.getItem("aegis:onboarding-complete")).toBeNull()
      expect(useUIStore.getState().onboardingVisible).toBe(true)
      vi.useRealTimers()
    })
  })
})
