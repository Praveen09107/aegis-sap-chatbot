import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminReviewQueuePage from "./page"
import { useAdminStore } from "@/stores/adminStore"
import type { ReviewItem } from "@/hooks/queries/adminData"

const useAdminReviewQueueMock = vi.fn<() => { data: ReviewItem[]; isLoading: boolean }>(() => ({ data: [], isLoading: false }))
const mutateAsync = vi.fn().mockResolvedValue(undefined)

const { toastMock } = vi.hoisted(() => ({ toastMock: { correctionSkipped: vi.fn() } }))

vi.mock("@/hooks/queries", () => ({
  useAdminReviewQueue: () => useAdminReviewQueueMock(),
  useResolveReview: () => ({ mutateAsync, isPending: false }),
}))

vi.mock("@/lib/toast", () => ({
  TOAST: toastMock,
}))

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "rq1",
    query_text: "How do I fix VL150 in VL01N?",
    answer_text: "The VL150 error occurs when stock is insufficient.",
    unsupported_claims: [],
    status: "pending",
    created_at: "2026-07-20T10:00:00Z",
    ...overrides,
  }
}

function fireKey(key: string, target: EventTarget = document.body) {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }))
}

describe("AdminReviewQueuePage", () => {
  beforeEach(() => {
    useAdminReviewQueueMock.mockReset()
    useAdminReviewQueueMock.mockReturnValue({ data: [], isLoading: false })
    mutateAsync.mockClear()
    mutateAsync.mockResolvedValue(undefined)
    toastMock.correctionSkipped.mockClear()
    useAdminStore.setState({ reviewQueueIndex: 0 })
  })

  it("shows the empty state when the queue is empty", () => {
    render(<AdminReviewQueuePage />)
    expect(screen.getByText("Review queue is empty")).toBeInTheDocument()
  })

  it("renders the item list and detail pane for the current item", () => {
    useAdminReviewQueueMock.mockReturnValue({ data: [makeItem()], isLoading: false })
    render(<AdminReviewQueuePage />)
    expect(screen.getByText("Item 1 of 1 pending")).toBeInTheDocument()
    expect(screen.getAllByText("How do I fix VL150 in VL01N?").length).toBeGreaterThan(0)
  })

  it("requires non-empty correction text before approving, then submits admin_correct_answer", async () => {
    useAdminReviewQueueMock.mockReturnValue({ data: [makeItem({ id: "rq1" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminReviewQueuePage />)

    const approveButton = screen.getByRole("button", { name: /Approve correction/ })
    expect(approveButton).toBeDisabled()

    await user.type(screen.getByLabelText("Correction text"), "Check batch assignment first.")
    expect(approveButton).toBeEnabled()

    await user.click(approveButton)
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ item_id: "rq1", admin_correct_answer: "Check batch assignment first." })
    )
  })

  it("Skip advances the queue locally without calling the resolve mutation", async () => {
    useAdminReviewQueueMock.mockReturnValue({
      data: [makeItem({ id: "rq1", query_text: "First question" }), makeItem({ id: "rq2", query_text: "Second question" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminReviewQueuePage />)

    await user.click(screen.getByRole("button", { name: /Skip/ }))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(toastMock.correctionSkipped).toHaveBeenCalled()
    expect(useAdminStore.getState().reviewQueueIndex).toBe(1)
  })

  it("resets the correction draft when moving to a different item", async () => {
    useAdminReviewQueueMock.mockReturnValue({
      data: [makeItem({ id: "rq1" }), makeItem({ id: "rq2" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminReviewQueuePage />)

    await user.type(screen.getByLabelText("Correction text"), "draft text")
    fireKey("j")
    await waitFor(() => expect(useAdminStore.getState().reviewQueueIndex).toBe(1))
    expect(screen.getByLabelText("Correction text")).toHaveValue("")
  })

  it("J/K keyboard shortcuts navigate the queue", async () => {
    useAdminReviewQueueMock.mockReturnValue({
      data: [makeItem({ id: "rq1" }), makeItem({ id: "rq2" })],
      isLoading: false,
    })
    render(<AdminReviewQueuePage />)

    fireKey("j")
    await waitFor(() => expect(useAdminStore.getState().reviewQueueIndex).toBe(1))

    fireKey("k")
    await waitFor(() => expect(useAdminStore.getState().reviewQueueIndex).toBe(0))
  })

  it("the A shortcut only approves once a correction has been typed", async () => {
    useAdminReviewQueueMock.mockReturnValue({ data: [makeItem({ id: "rq1" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminReviewQueuePage />)

    fireKey("a")
    expect(mutateAsync).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Correction text"), "fix")
    fireKey("a")
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ item_id: "rq1", admin_correct_answer: "fix" }))
  })

  it("the X shortcut skips without calling the resolve mutation", async () => {
    useAdminReviewQueueMock.mockReturnValue({
      data: [makeItem({ id: "rq1" }), makeItem({ id: "rq2" })],
      isLoading: false,
    })
    render(<AdminReviewQueuePage />)

    fireKey("x")
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(toastMock.correctionSkipped).toHaveBeenCalled()
    await waitFor(() => expect(useAdminStore.getState().reviewQueueIndex).toBe(1))
  })
})
