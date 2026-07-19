import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SAPEntityHighlighter } from "./SAPEntityHighlighter"

describe("SAPEntityHighlighter", () => {
  it("renders plain text with no entities unchanged", () => {
    render(<SAPEntityHighlighter text="Hello, how can I help you today?" />)
    expect(screen.getByText("Hello, how can I help you today?")).toBeInTheDocument()
  })

  it("highlights an error code, a t-code, and a doc number within surrounding text", () => {
    render(<SAPEntityHighlighter text="Fix VL150 error in VL01N; document 4500012345 is affected." showTooltips={false} />)
    expect(screen.getByText("VL150")).toHaveAttribute("role", "mark")
    expect(screen.getByText("VL01N")).toHaveAttribute("role", "mark")
    expect(screen.getByText("4500012345")).toHaveAttribute("role", "mark")
  })
})
