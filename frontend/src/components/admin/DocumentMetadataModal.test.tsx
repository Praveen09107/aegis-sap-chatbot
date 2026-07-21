import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DocumentMetadataModal } from "./DocumentMetadataModal"

function makeFile(name = "guide.pdf", sizeBytes = 2048): File {
  const file = new File(["x"], name, { type: "application/pdf" })
  Object.defineProperty(file, "size", { value: sizeBytes })
  return file
}

describe("DocumentMetadataModal", () => {
  it("renders nothing when closed", () => {
    render(<DocumentMetadataModal file={null} open={false} onOpenChange={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows the file summary when open with a file", () => {
    render(<DocumentMetadataModal file={makeFile("VL150-guide.pdf", 1024 * 500)} open onOpenChange={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText("VL150-guide.pdf")).toBeInTheDocument()
    expect(screen.getByText("500.0 KB")).toBeInTheDocument()
  })

  it("disables Upload until both a module and a content type are selected", async () => {
    const user = userEvent.setup()
    render(<DocumentMetadataModal file={makeFile()} open onOpenChange={vi.fn()} onUpload={vi.fn()} />)

    const uploadButton = screen.getByRole("button", { name: "Upload document" })
    expect(uploadButton).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "SD" }))
    expect(uploadButton).toBeDisabled()

    await user.click(screen.getByRole("button", { name: /Error guide/ }))
    expect(uploadButton).not.toBeDisabled()
  })

  it("marks the selected module and content type as pressed", async () => {
    const user = userEvent.setup()
    render(<DocumentMetadataModal file={makeFile()} open onOpenChange={vi.fn()} onUpload={vi.fn()} />)

    const sdButton = screen.getByRole("button", { name: "SD" })
    expect(sdButton).toHaveAttribute("aria-pressed", "false")
    await user.click(sdButton)
    expect(sdButton).toHaveAttribute("aria-pressed", "true")

    const errorGuideButton = screen.getByRole("button", { name: /Error guide/ })
    expect(errorGuideButton).toHaveAttribute("aria-pressed", "false")
    await user.click(errorGuideButton)
    expect(errorGuideButton).toHaveAttribute("aria-pressed", "true")
  })

  it("calls onUpload with the file, module, and content type, then closes and resets", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    const file = makeFile()
    render(<DocumentMetadataModal file={file} open onOpenChange={onOpenChange} onUpload={onUpload} />)

    await user.click(screen.getByRole("button", { name: "FI" }))
    await user.click(screen.getByRole("button", { name: /^Procedure/ }))
    await user.click(screen.getByRole("button", { name: "Upload document" }))

    expect(onUpload).toHaveBeenCalledWith(file, "FI", "procedure")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Cancel calls onOpenChange(false) without uploading", async () => {
    const onUpload = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<DocumentMetadataModal file={makeFile()} open onOpenChange={onOpenChange} onUpload={onUpload} />)

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("disables Cancel and Upload while uploading", () => {
    render(<DocumentMetadataModal file={makeFile()} open onOpenChange={vi.fn()} onUpload={vi.fn()} uploading />)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    // Button's loading spinner adds its own sr-only "Loading" text to the
    // accessible name alongside "Upload document" — match by substring.
    expect(screen.getByRole("button", { name: /Upload document/ })).toBeDisabled()
  })

  it("does not call onUpload when there is no file even if canUpload would otherwise be true", async () => {
    // Defensive path: file=null but module/contentType somehow selected —
    // handleUpload's own `if (!file || !canUpload) return` guard.
    const onUpload = vi.fn()
    render(<DocumentMetadataModal file={null} open onOpenChange={vi.fn()} onUpload={onUpload} />)
    // With no file, canUpload can still become true once module+type are
    // picked, but the file summary card won't render — Upload should still
    // be clickable (not disabled by file being null) yet do nothing.
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "SD" }))
    await user.click(screen.getByRole("button", { name: /Error guide/ }))
    await user.click(screen.getByRole("button", { name: "Upload document" }))

    expect(onUpload).not.toHaveBeenCalled()
  })
})
