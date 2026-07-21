import { describe, it, expect, vi, beforeEach } from "vitest"
import { render as rtlRender, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SessionSidebar } from "./SessionSidebar"
import { useSessionStore } from "@/stores/sessionStore"
import { useChatStore } from "@/stores/chatStore"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { Session } from "@/types"

const pushMock = vi.fn()
const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

// SessionSidebar renders SessionCard -> SessionContextMenu, which now calls
// the real useDeleteSession/useRenameSession/usePinSession mutation hooks —
// those need a QueryClientProvider ancestor.
function render(ui: React.ReactElement) {
  const { Wrapper } = createQueryWrapper()
  return rtlRender(ui, { wrapper: Wrapper })
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? "s1",
    user_id_hash: "h1",
    topic_summary: "VL150 delivery error",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    turn_count: 3,
    avg_confidence_score: 0.9,
    confidence_badge: "green",
    module_tags: ["SD"],
    is_pinned: false,
    is_unresolved: false,
    ...overrides,
  }
}

describe("SessionSidebar", () => {
  beforeEach(() => {
    pushMock.mockClear()
    replaceMock.mockClear()
    useSessionStore.setState({
      activeSessionId: null,
      searchQuery: "",
      pinnedIds: new Set<string>(),
    })
    useChatStore.setState({ websocket: null, messages: [], streamingState: "idle" })
  })

  it("shows the empty state when there are no sessions", () => {
    render(<SessionSidebar sessions={[]} />)
    expect(screen.getByText("No sessions yet")).toBeInTheDocument()
  })

  it("shows the loading skeleton when isLoading is true", () => {
    render(<SessionSidebar sessions={[]} isLoading />)
    expect(screen.queryByText("No sessions yet")).not.toBeInTheDocument()
  })

  it("renders sessions grouped by date", () => {
    render(
      <SessionSidebar
        sessions={[makeSession({ id: "s1", topic_summary: "First topic" })]}
      />
    )
    expect(screen.getByText("First topic")).toBeInTheDocument()
  })

  it("filters sessions by the debounced search query", async () => {
    render(
      <SessionSidebar
        sessions={[
          makeSession({ id: "s1", topic_summary: "VL150 delivery error" }),
          makeSession({ id: "s2", topic_summary: "MIGO goods receipt" }),
        ]}
      />
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Search sessions"), "MIGO")

    await waitFor(() => {
      expect(screen.getByText("MIGO goods receipt")).toBeInTheDocument()
      expect(screen.queryByText("VL150 delivery error")).not.toBeInTheDocument()
    })
  })

  it("shows a search-specific empty message when a query matches nothing", async () => {
    render(<SessionSidebar sessions={[makeSession()]} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Search sessions"), "nonexistent")

    await waitFor(() => {
      expect(screen.getByText("No sessions match your search")).toBeInTheDocument()
    })
  })

  it("new session button resets chat, clears the active session, and clears the URL session param", async () => {
    useSessionStore.setState({ activeSessionId: "s1" })
    render(<SessionSidebar sessions={[makeSession()]} />)

    const user = userEvent.setup()
    await user.click(screen.getByLabelText("New chat session"))

    expect(useSessionStore.getState().activeSessionId).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith("/")
  })

  it("clicking a session card navigates to its URL (bookmarkable deep link)", async () => {
    render(<SessionSidebar sessions={[makeSession({ id: "s1", topic_summary: "First topic" })]} />)

    const user = userEvent.setup()
    await user.click(screen.getByText("First topic"))

    expect(useSessionStore.getState().activeSessionId).toBe("s1")
    expect(pushMock).toHaveBeenCalledWith("/?session=s1")
  })

  it("disables switching to a different session while one is actively streaming", async () => {
    useSessionStore.setState({ activeSessionId: "s1" })
    useChatStore.setState({ streamingState: "streaming" })
    render(
      <SessionSidebar
        sessions={[makeSession({ id: "s1", topic_summary: "Active session" }), makeSession({ id: "s2", topic_summary: "Other session" })]}
      />
    )

    const user = userEvent.setup()
    await user.click(screen.getByText("Other session"))

    expect(pushMock).not.toHaveBeenCalled()
    expect(useSessionStore.getState().activeSessionId).toBe("s1")
  })

  it("sorts pinned sessions first regardless of date", () => {
    useSessionStore.setState({ pinnedIds: new Set(["s2"]) })
    render(
      <SessionSidebar
        sessions={[
          makeSession({ id: "s1", topic_summary: "Newer, unpinned", updated_at: "2026-07-19T12:00:00Z" }),
          makeSession({ id: "s2", topic_summary: "Older, pinned", updated_at: "2026-07-18T00:00:00Z" }),
        ]}
      />
    )

    const items = screen.getAllByRole("listitem")
    expect(items[0]).toHaveTextContent("Older, pinned")
    expect(items[1]).toHaveTextContent("Newer, unpinned")
  })
})
