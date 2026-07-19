import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import AdminLayout from "./layout"
import { useUIStore } from "@/stores/uiStore"

const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

const setThemeMock = vi.fn()
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: setThemeMock }),
}))

const useAuthMock = vi.fn()
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/components/shared/LoadingScreen", () => ({
  LoadingScreen: () => <div data-testid="loading-screen" />,
}))
vi.mock("@/components/shared/OfflineBanner", () => ({ OfflineBanner: () => null }))
vi.mock("@/components/admin/AdminNav", () => ({ AdminNav: () => <div data-testid="admin-nav" /> }))
vi.mock("@/components/admin/AdminTopbar", () => ({
  AdminTopbar: () => <div data-testid="admin-topbar" />,
}))
vi.mock("@/components/shared/CommandPalette", () => ({ CommandPalette: () => null }))
vi.mock("@/components/shared/KeyboardShortcutsOverlay", () => ({
  KeyboardShortcutsOverlay: () => null,
}))

describe("AdminLayout", () => {
  beforeEach(() => {
    replaceMock.mockClear()
    setThemeMock.mockClear()
    useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: true, initializing: false })
    useUIStore.setState({ commandPaletteOpen: false })
  })

  it("forces dark theme on mount", () => {
    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    )
    expect(setThemeMock).toHaveBeenCalledWith("dark")
  })

  it("shows only the loading screen while auth is initializing", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isAdmin: false, initializing: true })
    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    )

    expect(screen.getByTestId("loading-screen")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-nav")).not.toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it("renders the full shell once initialized for an admin", () => {
    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    )

    expect(screen.getByTestId("admin-nav")).toBeInTheDocument()
    expect(screen.getByTestId("admin-topbar")).toBeInTheDocument()
    expect(screen.getByText("admin content")).toBeInTheDocument()
  })

  it("redirects an authenticated non-admin employee to /", async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: false, initializing: false })
    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"))
  })

  it("does not redirect while still initializing, even if isAdmin is already false", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isAdmin: false, initializing: true })
    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    )

    expect(replaceMock).not.toHaveBeenCalled()
  })
})
