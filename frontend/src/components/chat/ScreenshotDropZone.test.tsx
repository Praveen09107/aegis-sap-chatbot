import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ScreenshotDropZone } from "./ScreenshotDropZone"
import { toastError } from "@/lib/toast"

vi.mock("@/lib/toast", () => ({
  toastError: vi.fn(),
}))

function makeImageFile(name = "screenshot.png", sizeBytes = 1024, type = "image/png") {
  const file = new File([new Uint8Array(sizeBytes)], name, { type })
  return file
}

describe("ScreenshotDropZone", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("does not show the drop overlay by default", () => {
    render(
      <ScreenshotDropZone onFileAccepted={vi.fn()}>
        <p>Chat content</p>
      </ScreenshotDropZone>
    )
    expect(screen.queryByText("Drop SAP screenshot here")).not.toBeInTheDocument()
  })

  it("shows the overlay while a file is dragged over, and hides it once fully left", async () => {
    const { container } = render(
      <ScreenshotDropZone onFileAccepted={vi.fn()}>
        <p>Chat content</p>
      </ScreenshotDropZone>
    )
    const zone = container.firstElementChild!

    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } })
    expect(screen.getByText("Drop SAP screenshot here")).toBeInTheDocument()

    fireEvent.dragLeave(zone, { dataTransfer: { types: ["Files"] } })
    // AnimatePresence's exit animation unmounts the overlay asynchronously.
    await waitFor(() => expect(screen.queryByText("Drop SAP screenshot here")).not.toBeInTheDocument())
  })

  it("accepts a valid image file on drop", () => {
    const onFileAccepted = vi.fn()
    const { container } = render(
      <ScreenshotDropZone onFileAccepted={onFileAccepted}>
        <p>Chat content</p>
      </ScreenshotDropZone>
    )
    const zone = container.firstElementChild!
    const file = makeImageFile()

    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(onFileAccepted).toHaveBeenCalledWith(file)
  })

  it("rejects a non-image file with a toast, and does not accept it", () => {
    const onFileAccepted = vi.fn()
    const { container } = render(
      <ScreenshotDropZone onFileAccepted={onFileAccepted}>
        <p>Chat content</p>
      </ScreenshotDropZone>
    )
    const zone = container.firstElementChild!
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" })

    fireEvent.drop(zone, { dataTransfer: { files: [file] } })

    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("Invalid file type", expect.any(String))
  })

  it("rejects a file over the 10MB size limit", () => {
    const onFileAccepted = vi.fn()
    const { container } = render(
      <ScreenshotDropZone onFileAccepted={onFileAccepted}>
        <p>Chat content</p>
      </ScreenshotDropZone>
    )
    const zone = container.firstElementChild!
    const tooBig = makeImageFile("huge.png", 11 * 1024 * 1024)

    fireEvent.drop(zone, { dataTransfer: { files: [tooBig] } })

    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("File too large", expect.any(String))
  })
})
