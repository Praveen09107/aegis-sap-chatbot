import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChatEmptyState } from "./ChatEmptyState"

describe("ChatEmptyState", () => {
  it("never renders a hardcoded company name — reads orgName instead", () => {
    render(<ChatEmptyState onSuggestionClick={vi.fn()} />)
    expect(screen.queryByText(/Sona Comstar/i)).not.toBeInTheDocument()
    expect(screen.getByAltText("Your Company")).toBeInTheDocument()
  })

  it("renders all 6 suggestion chips", () => {
    render(<ChatEmptyState onSuggestionClick={vi.fn()} />)
    expect(screen.getAllByRole("button")).toHaveLength(6)
  })

  it("calls onSuggestionClick with the question text when a chip is clicked", async () => {
    const onSuggestionClick = vi.fn()
    const user = userEvent.setup()
    render(<ChatEmptyState onSuggestionClick={onSuggestionClick} />)

    await user.click(screen.getByText("How do I fix a VL150 error in VL01N?"))
    expect(onSuggestionClick).toHaveBeenCalledWith("How do I fix a VL150 error in VL01N?")
  })
})
