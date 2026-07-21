import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { IngestionProgressRow } from "./IngestionProgressRow"

describe("IngestionProgressRow", () => {
  it("shows the uploading state with a percentage while progress < 100", () => {
    render(<IngestionProgressRow filename="guide.pdf" fileSize={1024 * 1024} progress={42} />)
    expect(screen.getByText("Uploading... 42%")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42")
  })

  it("shows the processing state once progress reaches 100", () => {
    render(<IngestionProgressRow filename="guide.pdf" fileSize={1024} progress={100} />)
    expect(screen.getByText("Processing — embedding chunks...")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("shows the filename and formatted file size", () => {
    render(<IngestionProgressRow filename="VL150-guide.pdf" fileSize={1024 * 512} progress={10} />)
    expect(screen.getByText("VL150-guide.pdf")).toBeInTheDocument()
    expect(screen.getByText("512.0 KB")).toBeInTheDocument()
  })

  it("has an accessible status label combining filename and current phase", () => {
    render(<IngestionProgressRow filename="guide.pdf" fileSize={1024} progress={0} />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "guide.pdf: Uploading... 0%")
  })
})
