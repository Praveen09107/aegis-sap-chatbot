import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AutoSaveIndicator } from "./AutoSaveIndicator"

describe("AutoSaveIndicator", () => {
  it("shows the saving message", () => {
    render(<AutoSaveIndicator status="saving" />)
    expect(screen.getByText("Saving draft…")).toBeInTheDocument()
  })

  it("shows the saved confirmation", () => {
    render(<AutoSaveIndicator status="saved" />)
    expect(screen.getByText("Draft saved")).toBeInTheDocument()
  })

  it("shows the retry message on error", () => {
    render(<AutoSaveIndicator status="error" />)
    expect(screen.getByText("Save failed — will retry")).toBeInTheDocument()
  })

  it("shows the idle cadence message otherwise", () => {
    render(<AutoSaveIndicator status="idle" />)
    expect(screen.getByText("Auto-saves every 30s")).toBeInTheDocument()
  })
})
