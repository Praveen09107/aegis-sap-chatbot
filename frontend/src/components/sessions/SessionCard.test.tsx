import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SessionCard } from "./SessionCard"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { Session } from "@/types"

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
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
    ...overrides,
  }
}

// SessionCard wraps SessionContextMenu, which now calls the real
// useDeleteSession/useRenameSession/usePinSession mutation hooks — those
// need a QueryClientProvider ancestor even when this test never triggers
// the context menu itself.
function renderCard(ui: React.ReactElement) {
  const { Wrapper } = createQueryWrapper()
  return render(ui, { wrapper: Wrapper })
}

describe("SessionCard", () => {
  it("renders the topic summary and turn count", () => {
    renderCard(<SessionCard session={makeSession()} isActive={false} isPinned={false} onSelect={vi.fn()} />)
    expect(screen.getByText("VL150 delivery error troubleshooting")).toBeInTheDocument()
    expect(screen.getByText("3 turns · 90%")).toBeInTheDocument()
  })

  it("uses singular 'turn' for a single-turn session", () => {
    renderCard(
      <SessionCard
        session={makeSession({ turn_count: 1 })}
        isActive={false}
        isPinned={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText("1 turn · 90%")).toBeInTheDocument()
  })

  it("omits the score suffix when avg_confidence_score is null", () => {
    renderCard(
      <SessionCard
        session={makeSession({ avg_confidence_score: null })}
        isActive={false}
        isPinned={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText("3 turns")).toBeInTheDocument()
  })

  it("calls onSelect on click and on Enter/Space", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderCard(<SessionCard session={makeSession()} isActive={false} isPinned={false} onSelect={onSelect} />)

    await user.click(screen.getByRole("listitem"))
    expect(onSelect).toHaveBeenCalledTimes(1)

    screen.getByRole("listitem").focus()
    await user.keyboard("{Enter}")
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it("shows a pinned indicator only when isPinned is true", () => {
    const { Wrapper } = createQueryWrapper()
    const { rerender } = render(
      <SessionCard session={makeSession()} isActive={false} isPinned={false} onSelect={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.queryByLabelText("Pinned")).not.toBeInTheDocument()

    rerender(<SessionCard session={makeSession()} isActive={false} isPinned onSelect={vi.fn()} />)
    expect(screen.getByLabelText("Pinned")).toBeInTheDocument()
  })

  it("marks the active session with aria-current", () => {
    renderCard(<SessionCard session={makeSession()} isActive isPinned={false} onSelect={vi.fn()} />)
    expect(screen.getByRole("listitem")).toHaveAttribute("aria-current", "page")
  })
})
