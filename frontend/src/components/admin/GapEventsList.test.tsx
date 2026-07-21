import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GapEventsList } from "./GapEventsList"
import type { GapEvent } from "@/types"

function makeEvent(overrides: Partial<GapEvent> = {}): GapEvent {
  return {
    query_pattern: "VL150 delivery creation error",
    module: "SD",
    doc_category: "SD-ERR",
    count_this_week: 23,
    severity: "high",
    ...overrides,
  }
}

describe("GapEventsList", () => {
  it("renders each event's pattern, module, and count", () => {
    render(<GapEventsList events={[makeEvent()]} />)
    expect(screen.getByText("VL150 delivery creation error")).toBeInTheDocument()
    expect(screen.getByText("SD")).toBeInTheDocument()
    expect(screen.getByText("23 this week")).toBeInTheDocument()
  })

  it("shows the empty message when there are no events", () => {
    render(<GapEventsList events={[]} />)
    expect(screen.getByText("No recurring gap events this week")).toBeInTheDocument()
  })

  it("limits the rendered events to maxItems", () => {
    const events = Array.from({ length: 8 }, (_, i) => makeEvent({ query_pattern: `Pattern ${i}` }))
    render(<GapEventsList events={events} maxItems={3} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("links each event and the 'View all' link to /admin/knowledge-gaps", () => {
    render(<GapEventsList events={[makeEvent()]} />)
    const links = screen.getAllByRole("link")
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/admin/knowledge-gaps")
    }
  })

  it("shows a loading skeleton instead of the list when isLoading", () => {
    render(<GapEventsList events={[makeEvent()]} isLoading />)
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    expect(screen.queryByText("VL150 delivery creation error")).not.toBeInTheDocument()
  })
})
