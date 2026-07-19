import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RelatedQuestions } from "./RelatedQuestions"

describe("RelatedQuestions", () => {
  it("renders nothing when there are no questions", () => {
    const { container } = render(<RelatedQuestions questions={[]} onSelect={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders up to 3 questions even when more are given", () => {
    render(<RelatedQuestions questions={["Q1", "Q2", "Q3", "Q4", "Q5"]} onSelect={vi.fn()} />)
    expect(screen.getAllByRole("button")).toHaveLength(3)
    expect(screen.queryByText("Q4")).not.toBeInTheDocument()
  })

  it("calls onSelect with the question text when clicked", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<RelatedQuestions questions={["How do I check stock with MMBE?"]} onSelect={onSelect} />)

    await user.click(screen.getByText("How do I check stock with MMBE?"))
    expect(onSelect).toHaveBeenCalledWith("How do I check stock with MMBE?")
  })
})
