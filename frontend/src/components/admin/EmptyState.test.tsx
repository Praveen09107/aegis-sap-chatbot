import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FileText } from "lucide-react"
import { EmptyState } from "./EmptyState"

describe("EmptyState", () => {
  it("renders the title, description, icon, and action", () => {
    render(
      <EmptyState
        icon={FileText}
        title="No documents uploaded yet"
        description="Upload SAP documentation to start."
        action={<button>Upload</button>}
      />
    )
    expect(screen.getByText("No documents uploaded yet")).toBeInTheDocument()
    expect(screen.getByText("Upload SAP documentation to start.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument()
  })

  it("renders without description, icon, or action when omitted", () => {
    render(<EmptyState title="No items match your filters" />)
    expect(screen.getByText("No items match your filters")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("uses larger text for the page variant vs inline", () => {
    const { rerender } = render(<EmptyState title="Empty" variant="inline" />)
    expect(screen.getByText("Empty").className).toContain("text-sm")

    rerender(<EmptyState title="Empty" variant="page" />)
    expect(screen.getByText("Empty").className).toContain("text-lg")
  })
})
