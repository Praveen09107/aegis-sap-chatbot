import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AuditTimeline } from "./AuditTimeline"
import type { AuditEntry } from "@/hooks/queries/adminData"

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "a1",
    occurred_at: new Date().toISOString(),
    user_id_hash: "hash1",
    session_id: "sess-abc123",
    request_type: "chat",
    confidence_badge: "green",
    validation_score: 0.912,
    model_tier: 1,
    feedback_signal: "none",
    ...overrides,
  }
}

describe("AuditTimeline", () => {
  it("groups an entry occurring right now under 'Today'", () => {
    render(<AuditTimeline entries={[makeEntry({ occurred_at: new Date().toISOString() })]} />)
    expect(screen.getByText("Today")).toBeInTheDocument()
  })

  it("groups an entry from 24h ago under 'Yesterday'", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    render(<AuditTimeline entries={[makeEntry({ occurred_at: yesterday })]} />)
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
  })

  it("groups an old entry under its localized date label", () => {
    render(<AuditTimeline entries={[makeEntry({ occurred_at: "2020-01-15T10:00:00Z" })]} />)
    expect(screen.getByText("15 Jan 2020")).toBeInTheDocument()
  })

  it("links each row to /?session={session_id}", () => {
    render(<AuditTimeline entries={[makeEntry({ session_id: "sess-xyz" })]} />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "/?session=sess-xyz")
  })

  it("shows the model tier when present", () => {
    render(<AuditTimeline entries={[makeEntry({ model_tier: 2 })]} />)
    expect(screen.getByText("Tier 2")).toBeInTheDocument()
  })

  it("omits the model tier when null", () => {
    render(<AuditTimeline entries={[makeEntry({ model_tier: null })]} />)
    expect(screen.queryByText(/Tier/)).not.toBeInTheDocument()
  })

  it("shows the validation score as a percentage", () => {
    render(<AuditTimeline entries={[makeEntry({ validation_score: 0.847 })]} />)
    expect(screen.getByText("84.7%")).toBeInTheDocument()
  })

  it("shows '—' when validation_score is null", () => {
    render(<AuditTimeline entries={[makeEntry({ validation_score: null })]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders multiple day groups in order, one row per entry", () => {
    render(
      <AuditTimeline
        entries={[
          makeEntry({ id: "a1", occurred_at: new Date().toISOString(), session_id: "sess-1" }),
          makeEntry({ id: "a2", occurred_at: "2020-01-15T10:00:00Z", session_id: "sess-2" }),
        ]}
      />
    )
    expect(screen.getByText("Today")).toBeInTheDocument()
    expect(screen.getByText("15 Jan 2020")).toBeInTheDocument()
    expect(screen.getAllByRole("link")).toHaveLength(2)
  })
})
