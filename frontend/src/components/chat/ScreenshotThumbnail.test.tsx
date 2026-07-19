import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ScreenshotThumbnail } from "./ScreenshotThumbnail"

describe("ScreenshotThumbnail", () => {
  it("shows the file name and formatted size", () => {
    const file = new File(["x".repeat(2048)], "error-screenshot.png", { type: "image/png" })
    render(<ScreenshotThumbnail file={file} previewUrl="blob:mock" onRemove={vi.fn()} />)

    expect(screen.getByText("error-screenshot.png")).toBeInTheDocument()
    expect(screen.getByText("2.0 KB")).toBeInTheDocument()
  })

  it("calls onRemove when the remove button is clicked", async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    const file = new File(["x"], "a.png", { type: "image/png" })
    render(<ScreenshotThumbnail file={file} previewUrl="blob:mock" onRemove={onRemove} />)

    await user.click(screen.getByRole("button", { name: "Remove screenshot" }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
