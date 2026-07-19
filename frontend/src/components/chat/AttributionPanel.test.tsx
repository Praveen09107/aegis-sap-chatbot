import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AttributionPanel } from "./AttributionPanel"
import type { AttributionPanel as AttributionPanelType } from "@/types"

const attribution: AttributionPanelType = {
  primary_document_id: "SD-ERR-001",
  primary_document_name: "Delivery quantity error guide",
  verified_by: "admin",
  verified_date: "2026-06-01",
  secondary_sources: [
    { document_id: "SD-PROC-014", chunk_type: "procedure", verified_date: "2026-05-01" },
  ],
  confidence_badge: "green",
}

describe("AttributionPanel", () => {
  it("shows a loading skeleton", () => {
    const { container } = render(<AttributionPanel attribution={null} isLoading />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  it("shows a placeholder message when there is no attribution yet", () => {
    render(<AttributionPanel attribution={null} />)
    expect(screen.getByText("Source appears after each response")).toBeInTheDocument()
  })

  it("renders the primary document's real name field, not a derived-from-ID string", () => {
    render(<AttributionPanel attribution={attribution} />)
    expect(screen.getByText("SD-ERR-001")).toBeInTheDocument()
    expect(screen.getByText("Delivery quantity error guide")).toBeInTheDocument()
  })

  it("passes the real validation score through to ScoreBreakdown", () => {
    render(<AttributionPanel attribution={attribution} score={0.91} />)
    expect(screen.getByText("91%")).toBeInTheDocument()
  })

  it("expands secondary sources on click", async () => {
    const user = userEvent.setup()
    render(<AttributionPanel attribution={attribution} />)

    expect(screen.queryByText("SD-PROC-014")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /1 additional source/ }))
    expect(screen.getByText("SD-PROC-014")).toBeInTheDocument()
  })
})
