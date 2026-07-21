import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import EmployeeLayout from "./layout"
import { useUIStore } from "@/stores/uiStore"
import { usePanelStore } from "@/stores/panelStore"

const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

const useAuthMock = vi.fn()
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}))

const useSessionsMock = vi.fn(() => ({ data: [] }))
vi.mock("@/hooks/queries", () => ({
  useSessions: () => useSessionsMock(),
}))

const initMultiTabDetectionMock = vi.fn()
vi.mock("@/hooks/useWebSocket", () => ({
  initMultiTabDetection: (setter: (v: boolean) => void) => initMultiTabDetectionMock(setter),
}))

// The layout's own logic (loading gate, redirect, grid) is what's under
// test here — its child components each have their own dedicated tests, so
// they're mocked to keep this test isolated and fast, per Testing Library's
// "test this component's behavior, not its children's" guidance.
vi.mock("@/components/shared/LoadingScreen", () => ({
  LoadingScreen: () => <div data-testid="loading-screen" />,
}))
vi.mock("@/components/shared/OfflineBanner", () => ({ OfflineBanner: () => null }))
vi.mock("@/components/shared/MultiTabWarningBanner", () => ({
  MultiTabWarningBanner: () => <div data-testid="multi-tab-banner" />,
}))
vi.mock("@/components/shared/EmployeeTopbar", () => ({
  EmployeeTopbar: () => <div data-testid="topbar" />,
}))
vi.mock("@/components/sessions/SessionSidebar", () => ({
  SessionSidebar: () => <div data-testid="sidebar" />,
}))
vi.mock("@/components/chat/AttributionPanelShell", () => ({
  AttributionPanelShell: () => <div data-testid="attribution-shell" />,
}))
vi.mock("@/components/shared/CommandPalette", () => ({ CommandPalette: () => null }))
vi.mock("@/components/shared/KeyboardShortcutsOverlay", () => ({
  KeyboardShortcutsOverlay: () => null,
}))
vi.mock("@/components/onboarding/OnboardingModal", () => ({
  OnboardingModal: ({ open, onComplete }: { open: boolean; onComplete: () => void }) =>
    open ? (
      <div data-testid="onboarding-modal">
        <button onClick={onComplete}>complete onboarding</button>
      </div>
    ) : null,
}))

describe("EmployeeLayout", () => {
  beforeEach(() => {
    replaceMock.mockClear()
    initMultiTabDetectionMock.mockClear()
    useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: false, initializing: false })
    useUIStore.setState({ commandPaletteOpen: false, onboardingVisible: false })
    usePanelStore.setState({ collapsed: false })
    localStorage.clear()
  })

  it("shows only the loading screen while auth is initializing", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isAdmin: false, initializing: true })
    render(
      <EmployeeLayout>
        <div>chat content</div>
      </EmployeeLayout>
    )

    expect(screen.getByTestId("loading-screen")).toBeInTheDocument()
    expect(screen.queryByTestId("topbar")).not.toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it("renders the full shell once initialized for an employee", () => {
    render(
      <EmployeeLayout>
        <div>chat content</div>
      </EmployeeLayout>
    )

    expect(screen.getByTestId("topbar")).toBeInTheDocument()
    expect(screen.getByTestId("sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("attribution-shell")).toBeInTheDocument()
    expect(screen.getByTestId("multi-tab-banner")).toBeInTheDocument()
    expect(screen.getByText("chat content")).toBeInTheDocument()
  })

  it("starts multi-tab detection once on mount, wired to uiStore's setMultiTabWarning", () => {
    render(
      <EmployeeLayout>
        <div>chat content</div>
      </EmployeeLayout>
    )

    expect(initMultiTabDetectionMock).toHaveBeenCalledTimes(1)
    const setter = initMultiTabDetectionMock.mock.calls[0][0] as (v: boolean) => void

    setter(true)
    expect(useUIStore.getState().multiTabWarning).toBe(true)
  })

  it("redirects an authenticated it-admin to /admin/dashboard", async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: true, initializing: false })
    render(
      <EmployeeLayout>
        <div>chat content</div>
      </EmployeeLayout>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/admin/dashboard"))
  })

  it("does not redirect while still initializing, even if isAdmin is already true", () => {
    // Guards against a premature redirect firing off the SSR-safe default
    // before the real cookie state has resolved.
    useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: true, initializing: true })
    render(
      <EmployeeLayout>
        <div>chat content</div>
      </EmployeeLayout>
    )

    expect(replaceMock).not.toHaveBeenCalled()
  })

  describe("first-time onboarding (FRONTEND_15)", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("shows the onboarding modal after an 800ms delay for a first-time employee", () => {
      vi.useFakeTimers()
      render(
        <EmployeeLayout>
          <div>chat content</div>
        </EmployeeLayout>
      )

      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(800))
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    })

    it("does not show onboarding when the completion flag is already set in localStorage", () => {
      localStorage.setItem("aegis:onboarding-complete", "true")
      vi.useFakeTimers()
      render(
        <EmployeeLayout>
          <div>chat content</div>
        </EmployeeLayout>
      )

      act(() => vi.advanceTimersByTime(800))
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument()
    })

    it("does not show onboarding for an IT admin", () => {
      useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: true, initializing: false })
      vi.useFakeTimers()
      render(
        <EmployeeLayout>
          <div>chat content</div>
        </EmployeeLayout>
      )

      act(() => vi.advanceTimersByTime(800))
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument()
    })

    it("sets the completion flag and hides the modal when onboarding completes", async () => {
      vi.useFakeTimers()
      render(
        <EmployeeLayout>
          <div>chat content</div>
        </EmployeeLayout>
      )
      act(() => vi.advanceTimersByTime(800))
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()

      vi.useRealTimers()
      const user = userEvent.setup()
      await user.click(screen.getByText("complete onboarding"))

      expect(localStorage.getItem("aegis:onboarding-complete")).toBe("true")
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument()
    })
  })
})
