import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { EntityChip } from "./EntityChip"

describe("EntityChip", () => {
  it("renders the value with an accessible mark role and label", () => {
    render(<EntityChip type="error_code" value="VL150" showTooltip={false} />)
    const chip = screen.getByText("VL150")
    expect(chip).toHaveAttribute("role", "mark")
    expect(chip).toHaveAttribute("aria-label", "SAP Error: VL150")
  })

  it("applies danger colors for error codes, info colors for t-codes, neutral for doc numbers", () => {
    const { rerender } = render(<EntityChip type="error_code" value="VL150" showTooltip={false} />)
    expect(screen.getByText("VL150").className).toContain("bg-danger-bg")

    rerender(<EntityChip type="tcode" value="VL01N" showTooltip={false} />)
    expect(screen.getByText("VL01N").className).toContain("bg-info-bg")

    rerender(<EntityChip type="doc_number" value="4500012345" showTooltip={false} />)
    expect(screen.getByText("4500012345").className).toContain("bg-bg-tertiary")
  })
})
