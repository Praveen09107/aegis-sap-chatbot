import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { CoverageSearchBar } from "./CoverageSearchBar"

const apiPostMock = vi.fn()
const pushMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: { post: (...args: unknown[]) => apiPostMock(...args) },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

function renderBar(onNavigateToNew = vi.fn()) {
  const { Wrapper } = createQueryWrapper()
  return render(<CoverageSearchBar onNavigateToNew={onNavigateToNew} />, { wrapper: Wrapper })
}

describe("CoverageSearchBar", () => {
  beforeEach(() => {
    apiPostMock.mockReset()
    pushMock.mockReset()
  })

  it("shows matching results once the debounced query resolves", async () => {
    // Real Qdrant collections are one-per-content_type — a given document_id
    // only ever surfaces from the one collection it was actually indexed
    // under, so the mock discriminates by the fanned-out content_type
    // instead of returning the same match for all three parallel calls.
    apiPostMock.mockImplementation((_path: string, body: { content_type: string }) =>
      body.content_type === "error_guide"
        ? Promise.resolve({
            has_similar: true,
            matches: [
              {
                document_id: "SD-ERR-001",
                title: "Tax condition issue",
                preview: "Preview text",
                module: "SD",
                status: "active",
                source_type: "form_entry",
                similarity_score: 0.92,
              },
            ],
          })
        : Promise.resolve({ has_similar: false, matches: [] })
    )

    const user = userEvent.setup()
    renderBar()
    await user.type(screen.getByLabelText("Search existing knowledge before creating a new entry"), "tax condition")

    await waitFor(() => expect(screen.getByText("Tax condition issue")).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByText("92% similar")).toBeInTheDocument()
  })

  it("shows a no-results message and lets the admin create a new entry anyway", async () => {
    apiPostMock.mockResolvedValue({ has_similar: false, matches: [] })

    const user = userEvent.setup()
    const onNavigateToNew = vi.fn()
    renderBar(onNavigateToNew)
    await user.type(screen.getByLabelText("Search existing knowledge before creating a new entry"), "totally new topic")

    await waitFor(() => expect(screen.getByText("No existing knowledge found for this topic.")).toBeInTheDocument(), { timeout: 2000 })

    await user.click(screen.getByText("Create a new entry →"))
    expect(onNavigateToNew).toHaveBeenCalled()
  })

  it("navigates to the filtered list when a result is clicked", async () => {
    apiPostMock.mockImplementation((_path: string, body: { content_type: string }) =>
      body.content_type === "procedure"
        ? Promise.resolve({
            has_similar: true,
            matches: [
              {
                document_id: "SD-ERR-002",
                title: "Another match",
                preview: "Preview",
                module: "SD",
                status: "active",
                source_type: "document",
                similarity_score: 0.5,
              },
            ],
          })
        : Promise.resolve({ has_similar: false, matches: [] })
    )

    const user = userEvent.setup()
    renderBar()
    await user.type(screen.getByLabelText("Search existing knowledge before creating a new entry"), "another match")

    await waitFor(() => expect(screen.getByText("Another match")).toBeInTheDocument(), { timeout: 2000 })
    await user.click(screen.getByText("Another match"))

    expect(pushMock).toHaveBeenCalledWith("/admin/quick-entry?search=SD-ERR-002")
  })
})
