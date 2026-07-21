import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OnboardingModal } from "./OnboardingModal"
import { ONBOARDING_STEPS } from "./OnboardingStep"
import { useChatStore } from "@/stores/chatStore"

/**
 * AnimatePresence's mode="wait" swaps the step content only after the
 * outgoing step's exit transition resolves — the footer's "Step N of 5"
 * label and Back/Next buttons update synchronously (they're plain
 * conditional renders, not inside AnimatePresence), but the actual step
 * body can lag a tick behind in jsdom. Await each step's own heading before
 * clicking again so subsequent queries target the right step's content.
 */
async function clickNextAndWaitForStep(user: ReturnType<typeof userEvent.setup>, stepIndex: number) {
  await user.click(screen.getByRole("button", { name: "Next step" }))
  await screen.findByRole("heading", { name: ONBOARDING_STEPS[stepIndex].title })
}

describe("OnboardingModal", () => {
  beforeEach(() => {
    useChatStore.setState({ composeValue: "" })
  })

  it("renders nothing when open is false", () => {
    render(<OnboardingModal open={false} onComplete={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows step 1's content when opened", () => {
    render(<OnboardingModal open onComplete={vi.fn()} />)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled()
  })

  it("advances to step 2 when Next is clicked, and Back becomes enabled", async () => {
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Next step" }))

    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous step" })).not.toBeDisabled()
  })

  it("goes back to step 1 from step 2", async () => {
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Next step" }))
    await user.click(screen.getByRole("button", { name: "Previous step" }))

    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument()
  })

  it("does not go past step 1 when Back is clicked on the first step", async () => {
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={vi.fn()} />)

    // The button is disabled in the UI, but confirm clicking it (no-op)
    // doesn't throw or somehow move state.
    await user.click(screen.getByRole("button", { name: "Previous step" }))
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument()
  })

  it("goPrev's own boundary guard holds even via a path that bypasses the disabled button (keyboard nav)", () => {
    render(<OnboardingModal open onComplete={vi.fn()} />)
    const dialog = screen.getByRole("dialog")

    // ArrowLeft isn't gated by the Back button's disabled state — it calls
    // goPrev() directly, so this is the only way to actually exercise
    // goPrev's own `if (s <= 0) return s` guard.
    fireEvent.keyDown(dialog, { key: "ArrowLeft" })
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument()
  })

  it("goNext's own boundary guard prevents advancing past the last step via keyboard nav", async () => {
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={vi.fn()} />)
    const dialog = screen.getByRole("dialog")

    for (let i = 1; i <= 4; i++) {
      await clickNextAndWaitForStep(user, i)
    }
    expect(screen.getByText("Step 5 of 5")).toBeInTheDocument()

    // The Next button is gone on the last step (replaced by Finish), but
    // ArrowRight isn't gated the same way — this is the only path that
    // exercises goNext's own `if (s >= totalSteps - 1) return s` guard.
    fireEvent.keyDown(dialog, { key: "ArrowRight" })
    expect(screen.getByText("Step 5 of 5")).toBeInTheDocument()
  })

  it("shows 'Start using AEGIS' instead of 'Next' on the last step", async () => {
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={vi.fn()} />)

    for (let i = 1; i <= 4; i++) {
      await clickNextAndWaitForStep(user, i)
    }

    expect(screen.getByText("Step 5 of 5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Finish onboarding and start using AEGIS" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Next step" })).not.toBeInTheDocument()
  })

  it("calls onComplete when Skip for now is clicked", async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={onComplete} />)

    await user.click(screen.getByRole("button", { name: "Skip onboarding walkthrough" }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("calls onComplete when the last step's finish button is clicked", async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={onComplete} />)

    for (let i = 1; i <= 4; i++) {
      await clickNextAndWaitForStep(user, i)
    }
    await user.click(screen.getByRole("button", { name: "Finish onboarding and start using AEGIS" }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("does NOT close when the backdrop is clicked (prevents accidental dismissal)", async () => {
    const onComplete = vi.fn()
    render(<OnboardingModal open onComplete={onComplete} />)

    const backdrop = screen.getByRole("dialog").querySelector('[aria-hidden="true"]') as HTMLElement
    await userEvent.setup().click(backdrop)

    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("does NOT close on Escape", () => {
    const onComplete = vi.fn()
    render(<OnboardingModal open onComplete={onComplete} />)

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("navigates forward with ArrowRight and back with ArrowLeft (bubbled from within the dialog)", () => {
    render(<OnboardingModal open onComplete={vi.fn()} />)
    const dialog = screen.getByRole("dialog")

    // Real usage: the key event bubbles up to the dialog's onKeyDown from
    // whatever's focused inside it (e.g. the Back/Next buttons) — simulated
    // here by firing directly on the dialog container itself.
    fireEvent.keyDown(dialog, { key: "ArrowRight" })
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: "ArrowLeft" })
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument()
  })

  it("clicking a starter-question chip on the last step fills the compose bar and calls onComplete", async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<OnboardingModal open onComplete={onComplete} />)

    for (let i = 1; i <= 4; i++) {
      await clickNextAndWaitForStep(user, i)
    }
    await user.click(screen.getByRole("button", { name: "Start with: How do I fix VL150 in VL01N?" }))

    expect(useChatStore.getState().composeValue).toBe("How do I fix VL150 in VL01N?")
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
