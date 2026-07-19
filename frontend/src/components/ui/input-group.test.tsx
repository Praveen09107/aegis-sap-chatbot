import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { InputGroup, InputGroupInput, InputGroupAddon } from "./input-group"

// Regression check: input.tsx (F05) was changed to optionally wrap its
// <input> in a container div for inline error messages. InputGroupInput
// composes Input directly into a flex row and expects a bare <input> back
// — confirms that composition still renders correctly (no accidental
// wrapper div breaking the flex layout) when there's no error.
describe("InputGroup + InputGroupInput composition", () => {
  it("renders a bare input inside the group, not wrapped in an extra container", () => {
    render(
      <InputGroup data-testid="group">
        <InputGroupAddon>@</InputGroupAddon>
        <InputGroupInput placeholder="username" />
      </InputGroup>
    )

    const group = screen.getByTestId("group")
    const input = screen.getByPlaceholderText("username")
    expect(input.tagName).toBe("INPUT")
    expect(input.parentElement).toBe(group)
  })
})
