import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HistorySessionCard } from "./HistorySessionCard"
import type { Session } from "@/types"

const pushMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    user_id_hash: "h1",
    topic_summary: "VL150 delivery quantity exceeds sales order",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2024-03-28T09:00:00Z",
    turn_count: 2,
    avg_confidence_score: 0.91,
    confidence_badge: "green",
    module_tags: ["SD"],
    is_pinned: false,
    is_unresolved: false,
    ...overrides,
  }
}

describe("HistorySessionCard", () => {
  it("renders the topic, turn count, formatted date, and module tags", () => {
    render(<HistorySessionCard session={makeSession()} index={0} />)

    expect(screen.getByText("VL150 delivery quantity exceeds sales order")).toBeInTheDocument()
    expect(screen.getByText("2 turns")).toBeInTheDocument()
    expect(screen.getByText("SD")).toBeInTheDocument()
    // formatDateLocalized default (en-IN / Asia-Kolkata): "28 Mar 2024, 02:30 pm"
    expect(screen.getByText("28 Mar 2024, 02:30 pm")).toBeInTheDocument()
  })

  it("shows singular 'turn' for a single-turn session", () => {
    render(<HistorySessionCard session={makeSession({ turn_count: 1 })} index={0} />)
    expect(screen.getByText("1 turn")).toBeInTheDocument()
  })

  it("shows the Unresolved indicator when is_unresolved is true", () => {
    render(<HistorySessionCard session={makeSession({ is_unresolved: true })} index={0} />)
    expect(screen.getByLabelText("Session unresolved")).toHaveTextContent("Unresolved")
  })

  it("does not show the Unresolved indicator when is_unresolved is false", () => {
    render(<HistorySessionCard session={makeSession({ is_unresolved: false })} index={0} />)
    expect(screen.queryByLabelText("Session unresolved")).not.toBeInTheDocument()
  })

  it("navigates to /?session=<id> when clicked", async () => {
    const user = userEvent.setup()
    render(<HistorySessionCard session={makeSession({ id: "sess-42" })} index={0} />)

    await user.click(screen.getByRole("button", { name: /Open session/ }))
    expect(pushMock).toHaveBeenCalledWith("/?session=sess-42")
  })

  it("renders no module tag chips when module_tags is empty", () => {
    render(<HistorySessionCard session={makeSession({ module_tags: [] })} index={0} />)
    expect(screen.queryByText("SD")).not.toBeInTheDocument()
  })

  it("shows at most 3 module tags even when more are present", () => {
    render(<HistorySessionCard session={makeSession({ module_tags: ["SD", "FI", "MM", "HR"] })} index={0} />)
    expect(screen.getByText("SD")).toBeInTheDocument()
    expect(screen.getByText("FI")).toBeInTheDocument()
    expect(screen.getByText("MM")).toBeInTheDocument()
    expect(screen.queryByText("HR")).not.toBeInTheDocument()
  })
})
