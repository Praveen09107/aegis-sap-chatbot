import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ScreenshotLightbox } from "./ScreenshotLightbox"
import type { ScreenshotReference } from "@/types"

const screenshots: ScreenshotReference[] = [
  { url: "/api/screenshots/a.png", caption: "First screenshot", section: "cause_1" },
  { url: "/api/screenshots/b.png", caption: "Second screenshot", section: "cause_2" },
]

describe("ScreenshotLightbox", () => {
  it("shows the active screenshot's caption and a position indicator when there are multiple", () => {
    render(<ScreenshotLightbox screenshots={screenshots} activeIndex={0} onIndexChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText("First screenshot")).toBeInTheDocument()
    expect(screen.getByText("1 of 2")).toBeInTheDocument()
  })

  it("hides prev/next controls and the position indicator when there's only one screenshot", () => {
    render(<ScreenshotLightbox screenshots={[screenshots[0]]} activeIndex={0} onIndexChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText("Previous screenshot")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Next screenshot")).not.toBeInTheDocument()
  })

  it("navigates forward and wraps around via the next button", async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    render(<ScreenshotLightbox screenshots={screenshots} activeIndex={1} onIndexChange={onIndexChange} onClose={vi.fn()} />)
    await user.click(screen.getByLabelText("Next screenshot"))
    expect(onIndexChange).toHaveBeenCalledWith(0)
  })

  it("navigates backward via the previous button", async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    render(<ScreenshotLightbox screenshots={screenshots} activeIndex={0} onIndexChange={onIndexChange} onClose={vi.fn()} />)
    await user.click(screen.getByLabelText("Previous screenshot"))
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it("calls onClose when the close button, backdrop, or Escape key is used", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ScreenshotLightbox screenshots={screenshots} activeIndex={0} onIndexChange={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByLabelText("Close"))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("does not close when clicking the image content itself", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ScreenshotLightbox screenshots={screenshots} activeIndex={0} onIndexChange={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByAltText("First screenshot"))
    expect(onClose).not.toHaveBeenCalled()
  })
})
