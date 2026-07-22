import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PageTransition } from "./PageTransition"

describe("PageTransition", () => {
  it("renders its children", () => {
    render(
      <PageTransition>
        <p>Page content</p>
      </PageTransition>
    )
    expect(screen.getByText("Page content")).toBeInTheDocument()
  })

  it("re-mounts (via the AnimatePresence key contract) when layoutKey changes", () => {
    const { rerender } = render(
      <PageTransition layoutKey="/admin/documents">
        <p>Documents page</p>
      </PageTransition>
    )
    expect(screen.getByText("Documents page")).toBeInTheDocument()

    rerender(
      <PageTransition layoutKey="/admin/registry">
        <p>Registry page</p>
      </PageTransition>
    )
    expect(screen.getByText("Registry page")).toBeInTheDocument()
  })
})
