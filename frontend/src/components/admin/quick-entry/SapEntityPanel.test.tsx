import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SapEntityPanel } from "./SapEntityPanel"

describe("SapEntityPanel", () => {
  it("shows detected T-codes and error codes", () => {
    render(
      <SapEntityPanel
        entities={{ t_codes: ["VL01N"], error_codes: ["VL150"] }}
        contentType="error_guide"
        formData={{ causes: [] }}
        documentId="SD-ERR-001"
        module="SD"
        onChunkPreview={vi.fn()}
      />
    )
    expect(screen.getByText("VL01N")).toBeInTheDocument()
    expect(screen.getByText("VL150")).toBeInTheDocument()
  })

  it("shows a fallback message when nothing is detected", () => {
    render(
      <SapEntityPanel
        entities={{ t_codes: [], error_codes: [] }}
        contentType="error_guide"
        formData={{}}
        documentId=""
        module=""
        onChunkPreview={vi.fn()}
      />
    )
    expect(screen.getByText(/None detected yet/)).toBeInTheDocument()
    expect(screen.getByText("None detected")).toBeInTheDocument()
  })

  it("estimates chunk count for error_guide as 1 overview + active causes", () => {
    render(
      <SapEntityPanel
        entities={{ t_codes: [], error_codes: [] }}
        contentType="error_guide"
        formData={{ causes: [{ cause_obsolete: false }, { cause_obsolete: false }, { cause_obsolete: true }] }}
        documentId="SD-ERR-001"
        module="SD"
        onChunkPreview={vi.fn()}
      />
    )
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("always estimates 2 chunks for config", () => {
    render(
      <SapEntityPanel
        entities={{ t_codes: [], error_codes: [] }}
        contentType="config"
        formData={{}}
        documentId="SD-CFG-001"
        module="SD"
        onChunkPreview={vi.fn()}
      />
    )
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("always 2 (overview + values)")).toBeInTheDocument()
  })

  it("disables the chunk-preview button until both documentId and module exist", () => {
    const { rerender } = render(
      <SapEntityPanel entities={{ t_codes: [], error_codes: [] }} contentType="error_guide" formData={{}} documentId="" module="" onChunkPreview={vi.fn()} />
    )
    expect(screen.getByText("Preview indexed chunks →")).toBeDisabled()

    rerender(
      <SapEntityPanel entities={{ t_codes: [], error_codes: [] }} contentType="error_guide" formData={{}} documentId="SD-ERR-001" module="SD" onChunkPreview={vi.fn()} />
    )
    expect(screen.getByText("Preview indexed chunks →")).toBeEnabled()
  })

  it("calls onChunkPreview when clicked", async () => {
    const user = userEvent.setup()
    const onChunkPreview = vi.fn()
    render(
      <SapEntityPanel entities={{ t_codes: [], error_codes: [] }} contentType="error_guide" formData={{}} documentId="SD-ERR-001" module="SD" onChunkPreview={onChunkPreview} />
    )
    await user.click(screen.getByText("Preview indexed chunks →"))
    expect(onChunkPreview).toHaveBeenCalled()
  })
})
