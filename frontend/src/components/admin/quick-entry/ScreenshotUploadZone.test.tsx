import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { ScreenshotUploadZone } from "./ScreenshotUploadZone"
import type { QuickEntryScreenshot } from "@/types"

const deleteMutateMock = vi.fn()
const retryMutateMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useDeleteScreenshot: () => ({ mutate: deleteMutateMock }),
  useRetryScreenshotVision: () => ({ mutate: retryMutateMock }),
}))

function makeScreenshot(overrides: Partial<QuickEntryScreenshot> = {}): QuickEntryScreenshot {
  return {
    id: "shot-1",
    entry_id: "entry-1",
    version: 1,
    associated_section: "cause_1",
    minio_object_key: "quick_entry_screenshots/entry-1/shot-1.png",
    admin_caption: "BP transaction — Billing tab",
    file_size_bytes: 12345,
    mime_type: "image/png",
    created_at: "2026-06-01T00:00:00Z",
    extracted_text: null,
    vision_status: "complete",
    vision_error: null,
    vision_confidence: null,
    sap_confirmed: true,
    eligible_for_cleanup: false,
    proxy_url: "/api/screenshots/quick_entry_screenshots/entry-1/shot-1.png",
    ...overrides,
  }
}

function renderZone(props: Partial<React.ComponentProps<typeof ScreenshotUploadZone>> = {}) {
  const { Wrapper } = createQueryWrapper()
  return render(
    <ScreenshotUploadZone entryId="entry-1" associatedSection="cause_1" screenshots={[]} isReadOnly={false} maxScreenshots={3} {...props} />,
    { wrapper: Wrapper }
  )
}

describe("ScreenshotUploadZone", () => {
  beforeEach(() => {
    deleteMutateMock.mockReset()
    retryMutateMock.mockReset()
    vi.restoreAllMocks()
  })

  it("prompts to save a draft first when there's no entryId yet", () => {
    renderZone({ entryId: null })
    expect(screen.getByText("Save as draft first to add screenshots")).toBeInTheDocument()
  })

  it("shows the drop zone with the remaining count", () => {
    renderZone({ screenshots: [makeScreenshot()], maxScreenshots: 3 })
    expect(screen.getByText(/2 remaining/)).toBeInTheDocument()
  })

  it("hides the drop zone once the section limit is reached", () => {
    renderZone({ screenshots: [makeScreenshot({ id: "a" }), makeScreenshot({ id: "b" })], maxScreenshots: 2 })
    expect(screen.queryByText(/click to browse/)).not.toBeInTheDocument()
    expect(screen.getByText(/Maximum 2 screenshots/)).toBeInTheDocument()
  })

  it("renders an existing screenshot thumbnail with its vision status", () => {
    renderZone({ screenshots: [makeScreenshot({ vision_status: "processing" })] })
    expect(screen.getByText("BP transaction — Billing tab")).toBeInTheDocument()
    expect(screen.getByText("Analyzing…")).toBeInTheDocument()
  })

  it("calls the delete mutation when the remove button is clicked", async () => {
    const user = userEvent.setup()
    renderZone({ screenshots: [makeScreenshot()] })
    await user.click(screen.getByTitle("Remove screenshot"))
    expect(deleteMutateMock).toHaveBeenCalledWith("shot-1")
  })

  it("only shows Retry for a failed screenshot, and calls the retry mutation", async () => {
    const user = userEvent.setup()
    renderZone({ screenshots: [makeScreenshot({ vision_status: "failed", vision_error: "Vision API timeout" })] })
    expect(screen.getByText("Vision API timeout")).toBeInTheDocument()
    await user.click(screen.getByText("Retry"))
    expect(retryMutateMock).toHaveBeenCalledWith("shot-1")
  })

  it("requires a 10+ character caption before uploading, then posts to the dedicated upload route", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ extraction_preview: "Extracted: Billing tab, Tax Classification = 1" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    renderZone({ screenshots: [] })

    const file = new File(["fake-image-bytes"], "screenshot.png", { type: "image/png" })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    const uploadButton = screen.getByText("Upload screenshot").closest("button")
    expect(uploadButton).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/BP transaction/), "Billing tab showing tax field")
    expect(uploadButton).toBeEnabled()

    await user.click(screen.getByText("Upload screenshot"))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/upload/knowledge-screenshot", expect.objectContaining({ method: "POST" })))
    expect(await screen.findByText(/Extracted: Billing tab/)).toBeInTheDocument()
  })
})
