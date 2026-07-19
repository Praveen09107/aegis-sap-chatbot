import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { AdminTopbar } from "./AdminTopbar"

const pathnameMock = vi.fn(() => "/admin/dashboard")
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}))

const setThemeMock = vi.fn()
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: setThemeMock }),
}))

describe("AdminTopbar", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/admin/dashboard")
  })

  it("shows the dashboard title and description at /admin/dashboard", () => {
    render(<AdminTopbar />)
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
    expect(screen.getByText("Live quality overview")).toBeInTheDocument()
  })

  it("treats bare /admin the same as /admin/dashboard", () => {
    pathnameMock.mockReturnValue("/admin")
    render(<AdminTopbar />)
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
  })

  it("shows the matching title for a nested route", () => {
    pathnameMock.mockReturnValue("/admin/documents")
    render(<AdminTopbar />)
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument()
    expect(screen.getByText("Manage knowledge documents")).toBeInTheDocument()
  })

  it("falls back to 'Admin' with no description for an unrecognized route", () => {
    pathnameMock.mockReturnValue("/admin/something-unknown")
    render(<AdminTopbar />)
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument()
  })

  it("includes a skip-to-content link targeting the main content id", () => {
    render(<AdminTopbar />)
    expect(screen.getByText("Skip to content")).toHaveAttribute("href", "#admin-main-content")
  })
})
