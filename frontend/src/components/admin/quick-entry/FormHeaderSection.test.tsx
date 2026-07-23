import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormHeaderSection } from "./FormHeaderSection"

const suggestDocumentIdMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  suggestDocumentId: (...args: unknown[]) => suggestDocumentIdMock(...args),
}))

const baseProps = {
  contentType: "error_guide" as const,
  documentId: "",
  onDocumentIdChange: vi.fn(),
  module: "SD",
  onModuleChange: vi.fn(),
  transactions: [] as string[],
  onTransactionsChange: vi.fn(),
  verifiedByName: "",
  onVerifiedByNameChange: vi.fn(),
  verifiedDate: "",
  onVerifiedDateChange: vi.fn(),
  reviewFrequency: "quarterly",
  onReviewFrequencyChange: vi.fn(),
  isReadOnly: false,
  gapId: null,
  isEditMode: false,
}

describe("FormHeaderSection", () => {
  beforeEach(() => {
    suggestDocumentIdMock.mockReset()
  })

  it("shows the gap-linked banner only when gapId is set", () => {
    const { rerender } = render(<FormHeaderSection {...baseProps} />)
    expect(screen.queryByText(/Created from Knowledge Gap/)).not.toBeInTheDocument()

    rerender(<FormHeaderSection {...baseProps} gapId="gap-1" />)
    expect(screen.getByText(/Created from Knowledge Gap/)).toBeInTheDocument()
  })

  it("uppercases document ID input as the admin types", async () => {
    const user = userEvent.setup()
    const onDocumentIdChange = vi.fn()
    render(<FormHeaderSection {...baseProps} onDocumentIdChange={onDocumentIdChange} />)
    await user.type(screen.getByLabelText(/Document ID/), "a")
    expect(onDocumentIdChange).toHaveBeenCalledWith("A")
  })

  it("disables the document ID field and hides Suggest in edit mode", () => {
    render(<FormHeaderSection {...baseProps} isEditMode documentId="SD-ERR-001" />)
    expect(screen.getByLabelText(/Document ID/)).toBeDisabled()
    expect(screen.queryByText(/Suggest/)).not.toBeInTheDocument()
  })

  it("calls suggestDocumentId and fills the field when Suggest is clicked", async () => {
    suggestDocumentIdMock.mockResolvedValue("SD-ERR-002")
    const user = userEvent.setup()
    const onDocumentIdChange = vi.fn()
    render(<FormHeaderSection {...baseProps} onDocumentIdChange={onDocumentIdChange} />)

    await user.click(screen.getByText("Suggest →"))
    await waitFor(() => expect(onDocumentIdChange).toHaveBeenCalledWith("SD-ERR-002"))
    expect(suggestDocumentIdMock).toHaveBeenCalledWith("SD", "error_guide")
  })

  it("adds a transaction tag on Enter and uppercases it", async () => {
    const user = userEvent.setup()
    const onTransactionsChange = vi.fn()
    render(<FormHeaderSection {...baseProps} onTransactionsChange={onTransactionsChange} />)
    const input = screen.getByPlaceholderText("e.g. VL01N, VK11")
    await user.type(input, "vl01n{Enter}")
    expect(onTransactionsChange).toHaveBeenCalledWith(["VL01N"])
  })

  it("removes a transaction tag when its remove button is clicked", async () => {
    const user = userEvent.setup()
    const onTransactionsChange = vi.fn()
    render(<FormHeaderSection {...baseProps} transactions={["VL01N"]} onTransactionsChange={onTransactionsChange} />)
    await user.click(screen.getByLabelText("Remove VL01N"))
    expect(onTransactionsChange).toHaveBeenCalledWith([])
  })

  it("only shows the review frequency field for config entries", () => {
    const { rerender } = render(<FormHeaderSection {...baseProps} contentType="error_guide" />)
    expect(screen.queryByLabelText(/Review frequency/)).not.toBeInTheDocument()

    rerender(<FormHeaderSection {...baseProps} contentType="config" />)
    expect(screen.getByLabelText(/Review frequency/)).toBeInTheDocument()
  })
})
