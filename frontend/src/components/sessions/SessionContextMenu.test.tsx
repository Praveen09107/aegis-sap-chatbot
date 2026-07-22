import { describe, it, expect, vi, beforeEach } from "vitest"
import { render as rtlRender, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SessionContextMenu } from "./SessionContextMenu"
import { useSessionStore } from "@/stores/sessionStore"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { Session } from "@/types"

const { apiDeleteMock, apiPutMock, apiGetMock, exportSessionAsPDFMock, toastMock } = vi.hoisted(() => ({
  apiDeleteMock: vi.fn(),
  apiPutMock: vi.fn(),
  apiGetMock: vi.fn(),
  exportSessionAsPDFMock: vi.fn(),
  toastMock: {
    sessionPinned: vi.fn(),
    sessionUnpinned: vi.fn(),
    sessionRenamed: vi.fn(),
    sessionDeleted: vi.fn(),
    sessionExported: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  api: {
    delete: (...args: unknown[]) => apiDeleteMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}))

vi.mock("@/lib/sessionExport", () => ({
  exportSessionAsPDF: (...args: unknown[]) => exportSessionAsPDFMock(...args),
}))

vi.mock("@/lib/toast", () => ({
  TOAST: toastMock,
}))

const session: Session = {
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
}

async function openMenu() {
  const trigger = screen.getByText("card content")
  trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument())
  return trigger
}

// SessionContextMenu now calls the real useDeleteSession/useRenameSession/
// usePinSession mutation hooks, which need a QueryClientProvider ancestor.
function render(ui: React.ReactElement) {
  const { Wrapper } = createQueryWrapper()
  return rtlRender(ui, { wrapper: Wrapper })
}

describe("SessionContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiDeleteMock.mockResolvedValue(undefined)
    apiPutMock.mockResolvedValue(undefined)
    apiGetMock.mockResolvedValue({ messages: [] })
    useSessionStore.setState({ pinnedIds: new Set<string>() })
  })

  it("does not open the menu on an ordinary left click (only right-click opens it)", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await user.click(screen.getByText("card content"))
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("pin/unpin toggles the store and shows the matching toast", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Pin session"))

    expect(useSessionStore.getState().pinnedIds.has("s1")).toBe(true)
    expect(toastMock.sessionPinned).toHaveBeenCalledTimes(1)
  })

  it("delete calls the API and shows a success toast after confirmation", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Delete session"))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    await waitFor(() => expect(apiDeleteMock).toHaveBeenCalledWith("sessions/s1", { silent: true }))
    expect(toastMock.sessionDeleted).toHaveBeenCalledTimes(1)
  })

  it("delete does not call the API when the confirmation is cancelled", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Delete session"))
    await user.click(await screen.findByRole("button", { name: "Cancel" }))

    expect(apiDeleteMock).not.toHaveBeenCalled()
  })

  it("rename opens a dialog and PUTs the trimmed value", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Rename"))

    const input = await screen.findByRole("textbox")
    await user.clear(input)
    await user.type(input, "  Updated topic  ")
    await user.click(screen.getByText("Save"))

    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith("sessions/s1", { topic_summary: "Updated topic" })
    )
    expect(toastMock.sessionRenamed).toHaveBeenCalledTimes(1)
  })

  it("rename is a no-op when the value is unchanged or empty", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Rename"))
    await screen.findByRole("textbox")
    await user.click(screen.getByText("Save")) // unchanged value

    expect(apiPutMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename session" })).not.toBeInTheDocument())
  })

  it("export fetches full messages then exports and toasts", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Export as PDF"))

    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("sessions/s1"))
    expect(exportSessionAsPDFMock).toHaveBeenCalledWith([], "VL150 delivery error troubleshooting")
    expect(toastMock.sessionExported).toHaveBeenCalledTimes(1)
  })

  it("rename dialog Escape cancels without calling the API", async () => {
    const user = userEvent.setup()
    render(
      <SessionContextMenu session={session} isPinned={false}>
        <div>card content</div>
      </SessionContextMenu>
    )

    await openMenu()
    await user.click(screen.getByText("Rename"))
    const input = await screen.findByRole("textbox")
    await user.type(input, "x")
    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename session" })).not.toBeInTheDocument())
    expect(apiPutMock).not.toHaveBeenCalled()
  })
})
