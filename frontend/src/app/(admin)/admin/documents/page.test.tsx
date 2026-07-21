import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminDocumentsPage from "./page"
import { useAdminStore } from "@/stores/adminStore"
import type { DocumentRecord, DocFilters } from "@/types"

const useAdminDocumentsMock = vi.fn<(filters?: DocFilters) => { data: DocumentRecord[]; isLoading: boolean }>(() => ({
  data: [],
  isLoading: false,
}))
const deprecateMutateAsync = vi.fn().mockResolvedValue(undefined)
const bulkDeprecateMutate = vi.fn()
const uploadMutateAsync = vi.fn().mockResolvedValue({ status: "complete" })

vi.mock("@/hooks/queries", () => ({
  useAdminDocuments: (filters?: DocFilters) => useAdminDocumentsMock(filters),
  useDeprecateDocument: () => ({ mutateAsync: deprecateMutateAsync, isPending: false }),
  useBulkDeprecateDocuments: () => ({ mutate: bulkDeprecateMutate, isPending: false }),
  useUploadDocument: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}))

const exportToCSVMock = vi.fn()
vi.mock("@/lib/csvExport", () => ({
  exportToCSV: (...args: unknown[]) => exportToCSVMock(...args),
}))

function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    document_id: "SD-ERR-001",
    content_type: "error_guide",
    module: "SD",
    status: "active",
    chunk_count: 47,
    last_verified_date: "2026-07-01",
    verified_by: "admin1",
    ingested_at: "2026-06-01T00:00:00Z",
    ...overrides,
  }
}

describe("AdminDocumentsPage", () => {
  beforeEach(() => {
    useAdminDocumentsMock.mockReset()
    useAdminDocumentsMock.mockReturnValue({ data: [], isLoading: false })
    deprecateMutateAsync.mockClear()
    bulkDeprecateMutate.mockClear()
    uploadMutateAsync.mockClear()
    exportToCSVMock.mockClear()
    useAdminStore.setState({
      documentFilters: {},
      selectedDocumentIds: new Set(),
      uploadProgress: {},
    })
  })

  it("renders the page header and upload zone", () => {
    render(<AdminDocumentsPage />)
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument()
    expect(screen.getByLabelText(/Document upload zone/)).toBeInTheDocument()
  })

  it("renders the stat row reflecting document statuses", () => {
    useAdminDocumentsMock.mockReturnValue({
      data: [makeDoc({ document_id: "d1", status: "active" }), makeDoc({ document_id: "d2", status: "processing" }), makeDoc({ document_id: "d3", status: "failed" })],
      isLoading: false,
    })
    render(<AdminDocumentsPage />)
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Processing")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
  })

  it("does not show a Failed stat when there are no failed documents", () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc()], isLoading: false })
    render(<AdminDocumentsPage />)
    expect(screen.queryByText("Failed")).not.toBeInTheDocument()
  })

  it("shows active ingestion rows from adminStore.uploadProgress", () => {
    useAdminStore.setState({ uploadProgress: { "guide.pdf": 55 } })
    render(<AdminDocumentsPage />)
    expect(screen.getByText("guide.pdf")).toBeInTheDocument()
    expect(screen.getByText("Uploading... 55%")).toBeInTheDocument()
  })

  it("shows filter chips when documentFilters are active, and clears them on Clear all", async () => {
    useAdminStore.setState({ documentFilters: { module: "SD", status: "active" } })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    expect(screen.getByText("SD")).toBeInTheDocument()
    await user.click(screen.getByLabelText("Clear all filters"))
    expect(useAdminStore.getState().documentFilters).toEqual({})
  })

  it("removes a single filter chip individually, leaving the others in place", async () => {
    useAdminStore.setState({ documentFilters: { module: "SD", status: "active" } })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    await user.click(screen.getByLabelText("Remove Module filter"))

    expect(useAdminStore.getState().documentFilters).toEqual({ module: undefined, status: "active" })
  })

  it("renders the empty state when there are no documents", () => {
    render(<AdminDocumentsPage />)
    expect(screen.getByText("No documents uploaded yet")).toBeInTheDocument()
  })

  it("renders document rows in the table", () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc({ document_id: "SD-ERR-001" })], isLoading: false })
    render(<AdminDocumentsPage />)
    expect(screen.getByText("SD-ERR-001")).toBeInTheDocument()
    expect(screen.getByText("47")).toBeInTheDocument()
  })

  it("falls back to '—' when verified_by is absent (confirmed real gap)", () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc({ verified_by: undefined })], isLoading: false })
    render(<AdminDocumentsPage />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("exports all documents when nothing is selected", async () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc({ document_id: "d1" }), makeDoc({ document_id: "d2" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    await user.click(screen.getByRole("button", { name: /Export CSV/ }))

    expect(exportToCSVMock).toHaveBeenCalledTimes(1)
    const call = exportToCSVMock.mock.calls[0][0] as { data: DocumentRecord[] }
    expect(call.data).toHaveLength(2)
  })

  it("CSV column accessors produce the correct plain values for a real row, with a fallback for missing verified_by", async () => {
    const doc = makeDoc({ document_id: "SD-ERR-001", module: "SD", content_type: "error_guide", status: "active", chunk_count: 47, last_verified_date: "2026-07-01", verified_by: undefined })
    useAdminDocumentsMock.mockReturnValue({ data: [doc], isLoading: false })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    await user.click(screen.getByRole("button", { name: /Export CSV/ }))

    const call = exportToCSVMock.mock.calls[0][0] as {
      columns: { header: string; accessor: (d: DocumentRecord) => string | number }[]
    }
    const values = Object.fromEntries(call.columns.map((c) => [c.header, c.accessor(doc)]))
    expect(values).toEqual({
      "Document ID": "SD-ERR-001",
      Module: "SD",
      "Content type": "error_guide",
      Status: "active",
      Chunks: 47,
      "Last verified": "2026-07-01",
      "Verified by": "",
    })
  })

  it("shows the BulkActionBar once rows are selected, and bulk-deprecates only active-status selected rows", async () => {
    useAdminDocumentsMock.mockReturnValue({
      data: [makeDoc({ document_id: "d1", status: "active" }), makeDoc({ document_id: "d2", status: "deprecated" })],
      isLoading: false,
    })
    useAdminStore.setState({ selectedDocumentIds: new Set(["d1", "d2"]) })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    expect(screen.getByRole("toolbar", { name: /selected/ })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Deprecate selected" }))

    expect(bulkDeprecateMutate).toHaveBeenCalledWith(["d1"])
  })

  it("does not call bulk deprecate when no selected rows are active", async () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc({ document_id: "d1", status: "deprecated" })], isLoading: false })
    useAdminStore.setState({ selectedDocumentIds: new Set(["d1"]) })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    await user.click(screen.getByRole("button", { name: "Deprecate selected" }))
    expect(bulkDeprecateMutate).not.toHaveBeenCalled()
  })

  it("opens the metadata modal after a valid file drop, and uploads on confirm", async () => {
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    const zone = screen.getByLabelText(/Document upload zone/)
    const file = new File(["x"], "guide.pdf", { type: "application/pdf" })
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } })

    expect(await screen.findByText("Document details")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "SD" }))
    await user.click(screen.getByRole("button", { name: /Error guide/ }))
    await user.click(screen.getByRole("button", { name: "Upload document" }))

    expect(uploadMutateAsync).toHaveBeenCalledWith({ file, metadata: { module: "SD", content_type: "error_guide" } })
  })

  it("deprecates a single active document via its row action and ConfirmDialog", async () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc({ document_id: "SD-ERR-001", status: "active" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminDocumentsPage />)

    await user.click(screen.getByRole("button", { name: "Deprecate SD-ERR-001" }))
    await user.click(screen.getByRole("button", { name: "Deprecate" }))

    expect(deprecateMutateAsync).toHaveBeenCalledWith("SD-ERR-001")
  })

  it("does not render a deprecate action for already-deprecated documents", () => {
    useAdminDocumentsMock.mockReturnValue({ data: [makeDoc({ document_id: "d1", status: "deprecated" })], isLoading: false })
    render(<AdminDocumentsPage />)
    expect(screen.queryByRole("button", { name: "Deprecate d1" })).not.toBeInTheDocument()
  })
})
