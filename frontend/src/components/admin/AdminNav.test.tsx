import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AdminNav } from "./AdminNav"
import { orgName } from "@/lib/constants"

const pathnameMock = vi.fn(() => "/admin/dashboard")
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}))

const useReviewQueueCountMock = vi.fn()
vi.mock("@/hooks/queries", () => ({
  useReviewQueueCount: () => useReviewQueueCountMock(),
}))

const logoutMock = vi.fn()
vi.mock("@/lib/auth", () => ({
  logout: () => logoutMock(),
}))

describe("AdminNav", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/admin/dashboard")
    useReviewQueueCountMock.mockReturnValue({ data: 0 })
    logoutMock.mockClear()
  })

  it("renders the org-configured logo alt text and all nav items", () => {
    render(<AdminNav />)
    expect(screen.getByAltText(orgName)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Dashboard (new)" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Review queue" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Analytics (new)" })).toBeInTheDocument()
  })

  it("marks the current route active", () => {
    pathnameMock.mockReturnValue("/admin/documents")
    render(<AdminNav />)
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Dashboard (new)" })).not.toHaveAttribute("aria-current")
  })

  it("shows a review queue count badge only when the count is positive", () => {
    useReviewQueueCountMock.mockReturnValue({ data: 5 })
    render(<AdminNav />)
    expect(screen.getByText("5")).toBeInTheDocument()
  })

  it("caps the review queue badge display at 99+", () => {
    useReviewQueueCountMock.mockReturnValue({ data: 140 })
    render(<AdminNav />)
    expect(screen.getByText("99+")).toBeInTheDocument()
  })

  it("calls logout when Sign out is clicked", async () => {
    const user = userEvent.setup()
    render(<AdminNav />)
    await user.click(screen.getByRole("button", { name: "Sign out" }))
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it("never hardcodes the previous org name", () => {
    render(<AdminNav />)
    expect(screen.queryByText(/Sona Comstar/i)).not.toBeInTheDocument()
  })

  it("hides the logo image if it fails to load", () => {
    render(<AdminNav />)
    const logo = screen.getByAltText(orgName)
    fireEvent.error(logo)
    expect(logo).toHaveStyle({ display: "none" })
  })
})
