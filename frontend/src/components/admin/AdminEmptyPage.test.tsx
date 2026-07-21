import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FileText } from "lucide-react"
import { AdminEmptyPage } from "./AdminEmptyPage"

describe("AdminEmptyPage", () => {
  it("renders the page title and the empty state title/description", () => {
    render(
      <AdminEmptyPage
        title="Documents"
        icon={FileText}
        emptyTitle="No documents uploaded yet"
        emptyDescription="Upload SAP documentation to start training the knowledge base."
      />
    )
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument()
    expect(screen.getByText("No documents uploaded yet")).toBeInTheDocument()
    expect(screen.getByText("Upload SAP documentation to start training the knowledge base.")).toBeInTheDocument()
  })

  it("renders the action node when provided", () => {
    render(<AdminEmptyPage title="Documents" emptyTitle="No documents" action={<button>Upload</button>} />)
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument()
  })

  it("does not render an action when none is given", () => {
    render(<AdminEmptyPage title="Documents" emptyTitle="No documents" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
