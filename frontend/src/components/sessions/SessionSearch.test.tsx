import { describe, it, expect, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SessionSearch } from "./SessionSearch"
import { useSessionStore } from "@/stores/sessionStore"

describe("SessionSearch", () => {
  beforeEach(() => {
    useSessionStore.setState({ searchQuery: "" })
  })

  it("reads searchQuery from sessionStore", () => {
    useSessionStore.setState({ searchQuery: "VL150" })
    render(<SessionSearch />)
    expect(screen.getByLabelText("Search sessions by topic, error code, or SAP module")).toHaveValue("VL150")
  })

  it("writes to sessionStore as the user types", async () => {
    const user = userEvent.setup()
    render(<SessionSearch />)

    await user.type(screen.getByLabelText("Search sessions by topic, error code, or SAP module"), "VL150")

    expect(useSessionStore.getState().searchQuery).toBe("VL150")
  })

  it("shows a clear button only when there is a query, and clears it on click", async () => {
    const user = userEvent.setup()
    useSessionStore.setState({ searchQuery: "VL150" })
    render(<SessionSearch />)

    const clearButton = screen.getByLabelText("Clear search")
    await user.click(clearButton)

    expect(useSessionStore.getState().searchQuery).toBe("")
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument()
  })

  it("auto-focuses when autoFocus is true", () => {
    render(<SessionSearch autoFocus />)
    expect(screen.getByLabelText("Search sessions by topic, error code, or SAP module")).toHaveFocus()
  })

  it("does not auto-focus by default", () => {
    render(<SessionSearch />)
    expect(screen.getByLabelText("Search sessions by topic, error code, or SAP module")).not.toHaveFocus()
  })

  it("uses a custom placeholder when provided", () => {
    render(<SessionSearch placeholder="Search history..." />)
    expect(screen.getByPlaceholderText("Search history...")).toBeInTheDocument()
  })
})
