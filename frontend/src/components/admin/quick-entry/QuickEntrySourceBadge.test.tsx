import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { QuickEntrySourceBadge } from "./QuickEntrySourceBadge"

describe("QuickEntrySourceBadge", () => {
  it("labels a form_entry source as Quick Entry", () => {
    render(<QuickEntrySourceBadge sourceType="form_entry" />)
    expect(screen.getByText("Quick Entry")).toBeInTheDocument()
  })

  it("labels a document source as Document", () => {
    render(<QuickEntrySourceBadge sourceType="document" />)
    expect(screen.getByText("Document")).toBeInTheDocument()
  })
})
