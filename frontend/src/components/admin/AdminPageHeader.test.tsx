import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AdminPageHeader } from "./AdminPageHeader"

describe("AdminPageHeader", () => {
  it("renders the title", () => {
    render(<AdminPageHeader title="Documents" />)
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument()
  })

  it("renders the description when provided", () => {
    render(<AdminPageHeader title="Documents" description="Manage the SAP knowledge base" />)
    expect(screen.getByText("Manage the SAP knowledge base")).toBeInTheDocument()
  })

  it("does not render a description paragraph when none is given", () => {
    render(<AdminPageHeader title="Documents" />)
    expect(screen.queryByText(/Manage/)).not.toBeInTheDocument()
  })

  it("renders actions on the right", () => {
    render(<AdminPageHeader title="Documents" actions={<button>Upload</button>} />)
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument()
  })

  it("renders leftSlot content below the title", () => {
    render(<AdminPageHeader title="Documents" leftSlot={<span>Filter chips</span>} />)
    expect(screen.getByText("Filter chips")).toBeInTheDocument()
  })
})
