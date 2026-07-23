import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { QuickEntryForm } from "./QuickEntryForm"
import { APIError } from "@/lib/api"

// QuickEntryForm is an orchestrator over ~10 already independently-tested
// child components/drawers — stubbed here to isolate its own state-machine
// logic (mode transitions, submit/duplicate/conflict handling) rather than
// re-exercising every child's own internals a second time.

const pushMock = vi.fn()
const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

const useQuickEntryMock = vi.fn()
const createMutateAsyncMock = vi.fn()
const updateMutateAsyncMock = vi.fn()
const checkDuplicateMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useQuickEntry: (...args: unknown[]) => useQuickEntryMock(...args),
  useCreateQuickEntry: () => ({ mutateAsync: createMutateAsyncMock }),
  useUpdateQuickEntry: () => ({ mutateAsync: updateMutateAsyncMock }),
  checkDuplicate: (...args: unknown[]) => checkDuplicateMock(...args),
}))

vi.mock("@/hooks/useAutoSave", () => ({
  useAutoSave: () => ({ saveStatus: "idle" }),
}))

vi.mock("@/hooks/useSapEntityDetector", () => ({
  useEntityDetector: () => ({ entities: { t_codes: [], error_codes: [] } }),
}))

vi.mock("./FormHeaderSection", () => ({
  FormHeaderSection: ({ documentId, onDocumentIdChange }: { documentId: string; onDocumentIdChange: (v: string) => void }) => (
    <input aria-label="stub-document-id" value={documentId} onChange={(e) => onDocumentIdChange(e.target.value)} />
  ),
}))
vi.mock("./ErrorGuideFormFields", () => ({ ErrorGuideFormFields: () => <div>ErrorGuideFormFields stub</div> }))
vi.mock("./ProcedureFormFields", () => ({ ProcedureFormFields: () => <div>ProcedureFormFields stub</div> }))
vi.mock("./ConfigFormFields", () => ({ ConfigFormFields: () => <div>ConfigFormFields stub</div> }))
vi.mock("./SapEntityPanel", () => ({ SapEntityPanel: () => <div>SapEntityPanel stub</div> }))
vi.mock("./ChunkPreviewDrawer", () => ({ ChunkPreviewDrawer: ({ onClose }: { onClose: () => void }) => <div>ChunkPreviewDrawer stub<button onClick={onClose}>close-chunk-preview</button></div> }))
vi.mock("./ProcessingStatusDrawer", () => ({
  ProcessingStatusDrawer: ({ onProcessingComplete }: { onProcessingComplete: (s: string) => void }) => (
    <div>
      ProcessingStatusDrawer stub
      <button onClick={() => onProcessingComplete("active")}>simulate-processing-complete</button>
    </div>
  ),
}))
vi.mock("./ConflictDrawer", () => ({
  ConflictDrawer: ({ onKeepLocal }: { onKeepLocal: () => void }) => (
    <div>
      ConflictDrawer stub
      <button onClick={onKeepLocal}>keep-local</button>
    </div>
  ),
}))
vi.mock("./QuickEntryOnboardingModal", () => ({
  QuickEntryOnboardingModal: ({ onClose }: { onClose: () => void }) => (
    <div>
      OnboardingModal stub
      <button onClick={onClose}>close-onboarding</button>
    </div>
  ),
}))

function renderForm(props: Partial<React.ComponentProps<typeof QuickEntryForm>> = {}) {
  const { Wrapper } = createQueryWrapper()
  return render(<QuickEntryForm mode="create" {...props} />, { wrapper: Wrapper })
}

describe("QuickEntryForm", () => {
  beforeEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
    useQuickEntryMock.mockReset()
    useQuickEntryMock.mockReturnValue({ data: undefined })
    createMutateAsyncMock.mockReset()
    updateMutateAsyncMock.mockReset()
    checkDuplicateMock.mockReset()
    localStorage.setItem("aegis:qe-onboarding-seen", "1")
  })

  it("create mode starts on the content-type selector", () => {
    renderForm()
    expect(screen.getByText("What type of knowledge are you adding?")).toBeInTheDocument()
  })

  it("selecting a content type moves to draft editing and renders the matching field component", async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByText("Error Guide"))
    expect(screen.getByText("ErrorGuideFormFields stub")).toBeInTheDocument()
    expect(screen.getByText("Submit to Knowledge Base")).toBeInTheDocument()
  })

  it("edit mode shows a loading skeleton until the entry is fetched, then seeds the form", () => {
    useQuickEntryMock.mockReturnValue({ data: undefined })
    const { container, rerender } = renderForm({ mode: "edit", entryId: "entry-1" })
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument()

    useQuickEntryMock.mockReturnValue({
      data: {
        id: "entry-1",
        document_id: "SD-ERR-001",
        content_type: "error_guide",
        module: "SD",
        transactions: ["VK11"],
        status: "active",
        version: 2,
        form_data: { issue_description: "Tax issue" },
        verified_by_name: "Jane",
        verified_date: "2026-06-01",
        review_frequency: null,
        gap_id: null,
        screenshots: [],
        updated_at: "2026-06-02T00:00:00Z",
      },
    })
    rerender(<QuickEntryForm mode="edit" entryId="entry-1" />)

    expect(screen.getByDisplayValue("SD-ERR-001")).toBeInTheDocument()
    expect(screen.getByText("ErrorGuideFormFields stub")).toBeInTheDocument()
  })

  it("shows the archived banner and read-only actions for an archived entry", () => {
    useQuickEntryMock.mockReturnValue({
      data: {
        id: "entry-1",
        document_id: "SD-ERR-001",
        content_type: "error_guide",
        module: "SD",
        transactions: [],
        status: "archived",
        version: 1,
        form_data: {},
        verified_by_name: "Jane",
        verified_date: "2026-06-01",
        review_frequency: null,
        gap_id: null,
        screenshots: [],
        updated_at: "2026-06-01T00:00:00Z",
      },
    })
    renderForm({ mode: "edit", entryId: "entry-1" })
    expect(screen.getByText(/This entry is archived/)).toBeInTheDocument()
    expect(screen.getByText(/Archived entries cannot be edited/)).toBeInTheDocument()
  })

  it("submits directly when no duplicates are found, and shows the processing drawer", async () => {
    const user = userEvent.setup()
    checkDuplicateMock.mockResolvedValue({ has_similar: false, matches: [] })
    createMutateAsyncMock.mockResolvedValue({ id: "entry-1", document_id: "SD-ERR-001", status: "processing", version: 1, message: "ok" })

    renderForm()
    await user.click(screen.getByText("Error Guide"))
    await user.click(screen.getByText("Submit to Knowledge Base"))

    await waitFor(() => expect(createMutateAsyncMock).toHaveBeenCalled())
    expect(await screen.findByText("ProcessingStatusDrawer stub")).toBeInTheDocument()
    expect(replaceMock).toHaveBeenCalledWith("/admin/quick-entry/entry-1", { scroll: false })
  })

  it("shows the duplicate check modal when similar entries are found, and can submit anyway", async () => {
    const user = userEvent.setup()
    checkDuplicateMock.mockResolvedValue({
      has_similar: true,
      matches: [{ document_id: "SD-ERR-002", title: "Similar issue", preview: "Preview", module: "SD", content_type: "error_guide", status: "active", source_type: "form_entry", similarity_score: 0.9, last_verified: "2026-06-01" }],
    })
    createMutateAsyncMock.mockResolvedValue({ id: "entry-1", document_id: "SD-ERR-001", status: "processing", version: 1, message: "ok" })

    renderForm()
    await user.click(screen.getByText("Error Guide"))
    await user.click(screen.getByText("Submit to Knowledge Base"))

    expect(await screen.findByText("Similar issue")).toBeInTheDocument()
    await user.click(screen.getByText("My topic is different — submit anyway"))

    await waitFor(() => expect(createMutateAsyncMock).toHaveBeenCalled())
  })

  it("shows the conflict drawer on a 409 response with a current_entry body", async () => {
    const user = userEvent.setup()
    checkDuplicateMock.mockResolvedValue({ has_similar: false, matches: [] })
    const conflictError = new APIError(409, "Conflict", {
      current_entry: {
        id: "entry-1",
        document_id: "SD-ERR-001",
        content_type: "error_guide",
        module: "SD",
        transactions: [],
        status: "active",
        version: 5,
        form_data: {},
        verified_by_name: "Jane",
        verified_date: "2026-06-01",
        review_frequency: null,
        gap_id: null,
        screenshots: [],
        updated_at: "2026-06-03T00:00:00Z",
      },
    })
    createMutateAsyncMock.mockRejectedValue(conflictError)

    renderForm()
    await user.click(screen.getByText("Error Guide"))
    await user.click(screen.getByText("Submit to Knowledge Base"))

    expect(await screen.findByText("ConflictDrawer stub")).toBeInTheDocument()
    await user.click(screen.getByText("keep-local"))
    expect(screen.queryByText("ConflictDrawer stub")).not.toBeInTheDocument()
  })

  it("shows onboarding automatically the first time (create mode, no seen flag) and dismisses it", async () => {
    localStorage.removeItem("aegis:qe-onboarding-seen")
    const user = userEvent.setup()
    renderForm()
    expect(await screen.findByText("OnboardingModal stub")).toBeInTheDocument()
    await user.click(screen.getByText("close-onboarding"))
    expect(screen.queryByText("OnboardingModal stub")).not.toBeInTheDocument()
    expect(localStorage.getItem("aegis:qe-onboarding-seen")).toBe("1")
  })
})
