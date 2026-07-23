import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AttributionScreenshotsSection } from "./AttributionScreenshotsSection"
import type { ScreenshotReference } from "@/types"

const screenshots: ScreenshotReference[] = [
  { url: "/api/screenshots/a.png", caption: "First screenshot", section: "cause_1" },
  { url: "/api/screenshots/b.png", caption: "Second screenshot", section: "cause_2" },
]

describe("AttributionScreenshotsSection", () => {
  it("renders nothing when there are no screenshots", () => {
    const { container } = render(<AttributionScreenshotsSection screenshots={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a singular label for exactly one screenshot", () => {
    render(<AttributionScreenshotsSection screenshots={[screenshots[0]]} />)
    expect(screen.getByText("Screenshot")).toBeInTheDocument()
  })

  it("shows a plural label and a thumbnail per screenshot for multiple", () => {
    render(<AttributionScreenshotsSection screenshots={screenshots} />)
    expect(screen.getByText("Screenshots")).toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("opens the lightbox at the clicked screenshot's index", async () => {
    const user = userEvent.setup()
    render(<AttributionScreenshotsSection screenshots={screenshots} />)
    await user.click(screen.getByAltText("Second screenshot"))
    expect(screen.getByText("2 of 2")).toBeInTheDocument()
  })

  it("closes the lightbox", async () => {
    const user = userEvent.setup()
    render(<AttributionScreenshotsSection screenshots={screenshots} />)
    await user.click(screen.getByAltText("First screenshot"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    await user.click(screen.getByLabelText("Close"))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
