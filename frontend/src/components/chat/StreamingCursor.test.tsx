import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { StreamingCursor } from "./StreamingCursor"

describe("StreamingCursor", () => {
  it("renders a presentational, aria-hidden blinking cursor", () => {
    const { container } = render(<StreamingCursor />)
    const cursor = container.firstElementChild
    expect(cursor).toHaveAttribute("aria-hidden", "true")
    expect(cursor).toHaveAttribute("role", "presentation")
  })
})
