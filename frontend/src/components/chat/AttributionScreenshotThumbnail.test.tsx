import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AttributionScreenshotThumbnail } from "./AttributionScreenshotThumbnail"
import type { ScreenshotReference } from "@/types"

const screenshot: ScreenshotReference = {
  url: "/api/screenshots/quick_entry_screenshots/entry-1/shot-1.png",
  caption: "BP transaction — Billing tab",
  section: "cause_1",
}

describe("AttributionScreenshotThumbnail", () => {
  it("renders the image with the caption as alt text and title", () => {
    render(<AttributionScreenshotThumbnail screenshot={screenshot} onClick={vi.fn()} />)
    const img = screen.getByAltText("BP transaction — Billing tab")
    expect(img).toHaveAttribute("src", screenshot.url)
    expect(screen.getByTitle("BP transaction — Billing tab")).toBeInTheDocument()
  })

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<AttributionScreenshotThumbnail screenshot={screenshot} onClick={onClick} />)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalled()
  })
})
