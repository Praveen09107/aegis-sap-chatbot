import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { UploadDropZone } from "./UploadDropZone"
import { toastError } from "@/lib/toast"

vi.mock("@/lib/toast", () => ({
  toastError: vi.fn(),
}))

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: sizeBytes })
  return file
}

function dropFiles(zone: HTMLElement, files: File[]) {
  fireEvent.drop(zone, { dataTransfer: { files, types: ["Files"] } })
}

describe("UploadDropZone", () => {
  beforeEach(() => {
    vi.mocked(toastError).mockClear()
  })

  it("renders the default (non-dragging) state", () => {
    render(<UploadDropZone onFileReady={vi.fn()} />)
    expect(screen.getByText("Drag and drop a document here")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Browse files" })).toBeInTheDocument()
  })

  it("shows the drag overlay on dragenter and hides it on dragleave", async () => {
    render(<UploadDropZone onFileReady={vi.fn()} />)
    const zone = screen.getByLabelText(/Document upload zone/)

    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } })
    expect(screen.getByText("Drop to upload")).toBeInTheDocument()

    fireEvent.dragLeave(zone, { dataTransfer: { types: ["Files"] } })
    // AnimatePresence's exit transition keeps "Drop to upload" mounted for
    // its exit animation — wait for it to actually leave the DOM rather
    // than asserting synchronously.
    await waitForElementToBeRemoved(() => screen.queryByText("Drop to upload"))
  })

  it("does not flicker the drag-leave state when a nested child fires enter before the parent's leave (counter tracking)", () => {
    render(<UploadDropZone onFileReady={vi.fn()} />)
    const zone = screen.getByLabelText(/Document upload zone/)

    // Simulates entering the zone, then entering a nested child (2 enters),
    // then leaving the child (1 leave) — should still show as dragging.
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } })
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } })
    fireEvent.dragLeave(zone, { dataTransfer: { types: ["Files"] } })

    expect(screen.getByText("Drop to upload")).toBeInTheDocument()
  })

  it("accepts a valid PDF drop and calls onFileReady", () => {
    const onFileReady = vi.fn()
    render(<UploadDropZone onFileReady={onFileReady} />)
    const zone = screen.getByLabelText(/Document upload zone/)
    const file = makeFile("guide.pdf", "application/pdf", 1024)

    dropFiles(zone, [file])

    expect(onFileReady).toHaveBeenCalledWith(file)
    expect(screen.queryByText("Drop to upload")).not.toBeInTheDocument()
  })

  it("rejects a non-PDF file with a toast and does not call onFileReady", () => {
    const onFileReady = vi.fn()
    render(<UploadDropZone onFileReady={onFileReady} />)
    const zone = screen.getByLabelText(/Document upload zone/)
    const file = makeFile("image.png", "image/png", 1024)

    dropFiles(zone, [file])

    expect(toastError).toHaveBeenCalledWith("Only PDF files are supported")
    expect(onFileReady).not.toHaveBeenCalled()
  })

  it("rejects an oversized PDF with a toast and does not call onFileReady", () => {
    const onFileReady = vi.fn()
    render(<UploadDropZone onFileReady={onFileReady} />)
    const zone = screen.getByLabelText(/Document upload zone/)
    const file = makeFile("huge.pdf", "application/pdf", 60 * 1024 * 1024)

    dropFiles(zone, [file])

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("File too large"))
    expect(onFileReady).not.toHaveBeenCalled()
  })

  it("does nothing when the drop event has no files", () => {
    const onFileReady = vi.fn()
    render(<UploadDropZone onFileReady={onFileReady} />)
    const zone = screen.getByLabelText(/Document upload zone/)

    dropFiles(zone, [])

    expect(onFileReady).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("accepts a valid file via the Browse files file input", async () => {
    const onFileReady = vi.fn()
    const user = userEvent.setup()
    render(<UploadDropZone onFileReady={onFileReady} />)

    const file = makeFile("guide.pdf", "application/pdf", 2048)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    expect(onFileReady).toHaveBeenCalledWith(file)
  })

  it("rejects an invalid file that reaches the input's onChange despite accept= (defensive validation, not reachable via a real OS file picker)", () => {
    // The input's accept="application/pdf,.pdf" already stops a real
    // browser file picker (and userEvent.upload(), which honors accept)
    // from offering a non-PDF file at all — fireEvent.change bypasses that
    // to exercise this component's own defensive validateFile() check,
    // which still runs in case a file ever arrives here some other way.
    const onFileReady = vi.fn()
    render(<UploadDropZone onFileReady={onFileReady} />)

    const file = makeFile("image.png", "image/png", 1024)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], configurable: true })
    fireEvent.change(input)

    expect(onFileReady).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
    expect(input.value).toBe("")
  })

  it("disables the Browse files button and dims the zone while uploading", () => {
    render(<UploadDropZone onFileReady={vi.fn()} uploading />)
    expect(screen.getByRole("button", { name: "Browse files" })).toBeDisabled()
  })
})
