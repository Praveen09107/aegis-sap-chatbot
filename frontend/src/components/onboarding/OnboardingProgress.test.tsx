import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { OnboardingProgress } from "./OnboardingProgress"

describe("OnboardingProgress", () => {
  it("renders one tab per step", () => {
    render(<OnboardingProgress totalSteps={5} currentStep={1} />)
    expect(screen.getAllByRole("tab")).toHaveLength(5)
  })

  it("marks only the current step as aria-selected", () => {
    render(<OnboardingProgress totalSteps={5} currentStep={2} />)
    const tabs = screen.getAllByRole("tab")
    expect(tabs[2]).toHaveAttribute("aria-selected", "true")
    expect(tabs[0]).toHaveAttribute("aria-selected", "false")
    expect(tabs[4]).toHaveAttribute("aria-selected", "false")
  })

  it("shows the current position as text (1-indexed)", () => {
    render(<OnboardingProgress totalSteps={5} currentStep={1} />)
    expect(screen.getByText("2 / 5")).toBeInTheDocument()
  })

  it("labels the tablist with the current step for screen readers", () => {
    render(<OnboardingProgress totalSteps={5} currentStep={0} />)
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label", "Onboarding step 1 of 5")
  })
})
