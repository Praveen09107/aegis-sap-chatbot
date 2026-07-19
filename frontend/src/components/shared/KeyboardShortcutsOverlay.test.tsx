import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay"

const isAdminMock = vi.fn()
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAdmin: isAdminMock() }),
}))

function fireKey(init: Partial<KeyboardEventInit> & { key: string }) {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
}

describe("KeyboardShortcutsOverlay", () => {
  beforeEach(() => {
    isAdminMock.mockReturnValue(false)
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("renders nothing until opened", () => {
    render(<KeyboardShortcutsOverlay />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens on the 'aegis:open-shortcuts' custom event dispatched by CommandPalette", () => {
    render(<KeyboardShortcutsOverlay />)
    act(() => document.dispatchEvent(new CustomEvent("aegis:open-shortcuts")))
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument()
  })

  it("toggles open/closed on Cmd+/ (and Ctrl+/ for Windows)", async () => {
    render(<KeyboardShortcutsOverlay />)
    act(() => fireKey({ key: "/", metaKey: true }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    // AnimatePresence's exit animation unmounts asynchronously — the node
    // stays in the DOM until the exit transition completes.
    act(() => fireKey({ key: "/", metaKey: true }))
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    act(() => fireKey({ key: "/", ctrlKey: true }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("closes on Escape", async () => {
    render(<KeyboardShortcutsOverlay />)
    act(() => fireKey({ key: "/", metaKey: true }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    act(() => fireKey({ key: "Escape" }))
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("closes when the close button is clicked", async () => {
    render(<KeyboardShortcutsOverlay />)
    act(() => fireKey({ key: "/", metaKey: true }))

    act(() => screen.getByRole("button", { name: "Close" }).click())
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("shows only employee shortcuts for a non-admin user", () => {
    isAdminMock.mockReturnValue(false)
    render(<KeyboardShortcutsOverlay />)
    act(() => fireKey({ key: "/", metaKey: true }))

    expect(screen.getByText("Send message")).toBeInTheDocument()
    expect(screen.queryByText("Approve correction")).not.toBeInTheDocument()
  })

  it("shows admin shortcuts too for an admin user", () => {
    isAdminMock.mockReturnValue(true)
    render(<KeyboardShortcutsOverlay />)
    act(() => fireKey({ key: "/", metaKey: true }))

    expect(screen.getByText("Send message")).toBeInTheDocument()
    expect(screen.getByText("Approve correction")).toBeInTheDocument()
  })
})
