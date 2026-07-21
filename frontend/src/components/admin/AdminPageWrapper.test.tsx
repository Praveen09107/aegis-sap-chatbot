import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AdminPageWrapper } from "./AdminPageWrapper"

describe("AdminPageWrapper", () => {
  it("renders children", () => {
    render(
      <AdminPageWrapper>
        <p>Page content</p>
      </AdminPageWrapper>
    )
    expect(screen.getByText("Page content")).toBeInTheDocument()
  })

  it("defaults to the 1200px max-width", () => {
    const { container } = render(
      <AdminPageWrapper>
        <p>content</p>
      </AdminPageWrapper>
    )
    expect(container.firstChild).toHaveClass("max-w-[1200px]")
  })

  it("applies the 1400px max-width for width='wide'", () => {
    const { container } = render(
      <AdminPageWrapper width="wide">
        <p>content</p>
      </AdminPageWrapper>
    )
    expect(container.firstChild).toHaveClass("max-w-[1400px]")
  })

  it("applies no max-width for width='full'", () => {
    const { container } = render(
      <AdminPageWrapper width="full">
        <p>content</p>
      </AdminPageWrapper>
    )
    expect(container.firstChild).toHaveClass("max-w-none")
  })
})
