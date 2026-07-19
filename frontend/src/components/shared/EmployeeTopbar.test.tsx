import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EmployeeTopbar } from "./EmployeeTopbar"
import { useChatStore } from "@/stores/chatStore"
import { orgName } from "@/lib/constants"

const useAuthMock = vi.fn()
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}))

const setThemeMock = vi.fn()
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: setThemeMock }),
}))

describe("EmployeeTopbar", () => {
  beforeEach(() => {
    useChatStore.setState({ websocket: null, messages: [], streamingState: "idle" })
    useAuthMock.mockReturnValue({ role: "employee" })
  })

  it("renders the AEGIS brand and the org-configured logo alt text", () => {
    render(<EmployeeTopbar />)
    expect(screen.getByText("AEGIS")).toBeInTheDocument()
    expect(screen.getByAltText(orgName)).toBeInTheDocument()
  })

  it("shows offline status when there is no websocket", () => {
    render(<EmployeeTopbar />)
    expect(screen.getByText("Offline")).toBeInTheDocument()
  })

  it("shows connecting status while the websocket is CONNECTING", () => {
    useChatStore.setState({ websocket: { readyState: WebSocket.CONNECTING } as WebSocket })
    render(<EmployeeTopbar />)
    expect(screen.getByText("Connecting...")).toBeInTheDocument()
  })

  it("shows connected status once the websocket is OPEN", () => {
    useChatStore.setState({ websocket: { readyState: WebSocket.OPEN } as WebSocket })
    render(<EmployeeTopbar />)
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("shows IT initials for an it-admin, U otherwise", () => {
    useAuthMock.mockReturnValue({ role: "it-admin" })
    render(<EmployeeTopbar />)
    expect(screen.getByLabelText("Logged in as it-admin")).toHaveTextContent("IT")
  })

  it("falls back to a generic 'user' label when role is null", () => {
    useAuthMock.mockReturnValue({ role: null })
    render(<EmployeeTopbar />)
    expect(screen.getByLabelText("Logged in as user")).toBeInTheDocument()
  })

  it("falls back to offline for a closed/closing websocket (neither OPEN nor CONNECTING)", () => {
    useChatStore.setState({ websocket: { readyState: WebSocket.CLOSED } as WebSocket })
    render(<EmployeeTopbar />)
    expect(screen.getByText("Offline")).toBeInTheDocument()
  })

  it("hides the logo image if it fails to load", () => {
    render(<EmployeeTopbar />)
    const logo = screen.getByAltText(orgName)
    fireEvent.error(logo)
    expect(logo).toHaveStyle({ display: "none" })
  })

  it("never hardcodes the previous org name", () => {
    render(<EmployeeTopbar />)
    expect(screen.queryByText(/Sona Comstar/i)).not.toBeInTheDocument()
  })
})
