import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QuickEntryOnboardingModal } from "./QuickEntryOnboardingModal"

describe("QuickEntryOnboardingModal", () => {
  it("starts on the first (real, non-placeholder) step", () => {
    render(<QuickEntryOnboardingModal onClose={vi.fn()} />)
    expect(screen.getByText("What is Quick Entry?")).toBeInTheDocument()
    expect(screen.getByText("Next")).toBeInTheDocument()
  })

  it("advances to the tips step and shows Get started on the last step", async () => {
    const user = userEvent.setup()
    render(<QuickEntryOnboardingModal onClose={vi.fn()} />)
    await user.click(screen.getByText("Next"))
    expect(screen.getByText("Tips for the best results")).toBeInTheDocument()
    expect(screen.getByText("Get started")).toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("goes back to the previous step", async () => {
    const user = userEvent.setup()
    render(<QuickEntryOnboardingModal onClose={vi.fn()} />)
    await user.click(screen.getByText("Next"))
    await user.click(screen.getByText("Back"))
    expect(screen.getByText("What is Quick Entry?")).toBeInTheDocument()
  })

  it("calls onClose from the close button and from Get started on the last step", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<QuickEntryOnboardingModal onClose={onClose} />)
    await user.click(screen.getByLabelText("Close"))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText("Next"))
    await user.click(screen.getByText("Get started"))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
