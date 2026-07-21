import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReviewItemDetail } from "./ReviewItemDetail"
import type { ReviewItem } from "@/hooks/queries/adminData"

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "rq1",
    query_text: "How do I fix VL150 in VL01N?",
    answer_text: "The VL150 error occurs when available safety stock is insufficient.",
    unsupported_claims: ["available safety stock is insufficient"],
    status: "pending",
    created_at: "2024-03-28T09:00:00Z",
    ...overrides,
  }
}

describe("ReviewItemDetail", () => {
  it("shows a placeholder when no item is selected", () => {
    render(
      <ReviewItemDetail
        item={null}
        currentIndex={0}
        totalItems={0}
        correctionText=""
        onCorrectionTextChange={vi.fn()}
        onApprove={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(screen.getByText("Select an item from the queue")).toBeInTheDocument()
  })

  it("renders the query, progress indicator, and formatted created_at", () => {
    render(
      <ReviewItemDetail
        item={makeItem()}
        currentIndex={2}
        totalItems={5}
        correctionText=""
        onCorrectionTextChange={vi.fn()}
        onApprove={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(screen.getByText("Item 3 of 5 pending")).toBeInTheDocument()
    expect(screen.getByText("How do I fix VL150 in VL01N?")).toBeInTheDocument()
    expect(screen.getByText("28 Mar 2024, 02:30 pm")).toBeInTheDocument()
  })

  it("highlights unsupported claims and shows the flagged-claim count", () => {
    render(
      <ReviewItemDetail
        item={makeItem({ unsupported_claims: ["available safety stock is insufficient"] })}
        currentIndex={0}
        totalItems={1}
        correctionText=""
        onCorrectionTextChange={vi.fn()}
        onApprove={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(document.querySelector("mark")).toHaveTextContent("available safety stock is insufficient")
    expect(screen.getByText("1 unsupported claim flagged")).toBeInTheDocument()
  })

  it("disables Approve correction when correctionText is empty", () => {
    render(
      <ReviewItemDetail
        item={makeItem()}
        currentIndex={0}
        totalItems={1}
        correctionText=""
        onCorrectionTextChange={vi.fn()}
        onApprove={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: /Approve correction/ })).toBeDisabled()
  })

  it("enables Approve correction once correctionText is non-empty and calls onApprove when clicked", async () => {
    const onApprove = vi.fn()
    const user = userEvent.setup()
    render(
      <ReviewItemDetail
        item={makeItem()}
        currentIndex={0}
        totalItems={1}
        correctionText="The real cause is a missing batch assignment."
        onCorrectionTextChange={vi.fn()}
        onApprove={onApprove}
        onSkip={vi.fn()}
      />
    )
    const approveButton = screen.getByRole("button", { name: /Approve correction/ })
    expect(approveButton).toBeEnabled()
    await user.click(approveButton)
    expect(onApprove).toHaveBeenCalled()
  })

  it("calls onCorrectionTextChange as the textarea is typed into", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ReviewItemDetail
        item={makeItem()}
        currentIndex={0}
        totalItems={1}
        correctionText=""
        onCorrectionTextChange={onChange}
        onApprove={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText("Correction text"), "x")
    expect(onChange).toHaveBeenCalledWith("x")
  })

  it("calls onSkip when Skip is clicked", async () => {
    const onSkip = vi.fn()
    const user = userEvent.setup()
    render(
      <ReviewItemDetail
        item={makeItem()}
        currentIndex={0}
        totalItems={1}
        correctionText=""
        onCorrectionTextChange={vi.fn()}
        onApprove={vi.fn()}
        onSkip={onSkip}
      />
    )
    await user.click(screen.getByRole("button", { name: /Skip/ }))
    expect(onSkip).toHaveBeenCalled()
  })

  it("disables both actions while isSubmitting", () => {
    render(
      <ReviewItemDetail
        item={makeItem()}
        currentIndex={0}
        totalItems={1}
        correctionText="a fix"
        onCorrectionTextChange={vi.fn()}
        onApprove={vi.fn()}
        onSkip={vi.fn()}
        isSubmitting
      />
    )
    expect(screen.getByRole("button", { name: /Approve correction/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Skip/ })).toBeDisabled()
  })
})
