import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { OnboardingStep, ONBOARDING_STEPS } from "./OnboardingStep"

describe("ONBOARDING_STEPS", () => {
  it("has exactly 5 steps", () => {
    expect(ONBOARDING_STEPS).toHaveLength(5)
  })

  it("assigns sequential 0-indexed ids", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([0, 1, 2, 3, 4])
  })

  it("never hardcodes the original company name anywhere in its content", () => {
    render(
      <>
        {ONBOARDING_STEPS.map((step) => (
          <OnboardingStep key={step.id} step={step} />
        ))}
      </>
    )
    expect(screen.queryByText(/Sona Comstar/i)).not.toBeInTheDocument()
  })
})

describe("OnboardingStep", () => {
  it("renders the step's title and subtitle", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[0]} />)
    expect(screen.getByRole("heading", { name: "Welcome to AEGIS" })).toBeInTheDocument()
    expect(screen.getByText("Your SAP support assistant")).toBeInTheDocument()
  })

  it("step 1 reads the org name from configuration, not a hardcoded string", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[0]} />)
    // Default test env has no NEXT_PUBLIC_ORG_NAME set, so orgName falls back
    // to "Your Company" (lib/constants.ts's own documented default).
    expect(screen.getByText(/verified internal/)).toHaveTextContent("Your Company's verified internal")
    expect(screen.getByAltText("Your Company")).toBeInTheDocument()
  })

  it("step 1 shows the can-do and cannot-do lists", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[0]} />)
    expect(screen.getByText("What AEGIS helps with")).toBeInTheDocument()
    expect(screen.getByText("What AEGIS cannot do")).toBeInTheDocument()
  })

  it("step 2 renders entity chips inside the good-question examples", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[1]} />)
    expect(screen.getByText("VL150")).toBeInTheDocument()
    expect(screen.getByText("VL01N")).toBeInTheDocument()
  })

  it("step 3 renders all three confidence badge cards", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[2]} />)
    // Each label appears twice — once in ConfidenceBadge itself, once in the
    // card's own heading paragraph — so assert presence via getAllByText.
    expect(screen.getAllByText("High confidence").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Moderate confidence").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Insufficient").length).toBeGreaterThan(0)
  })

  it("step 4 renders both screenshot methods", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[3]} />)
    expect(screen.getByText("Drag & drop")).toBeInTheDocument()
    expect(screen.getByText("File picker")).toBeInTheDocument()
  })

  it("step 5 renders starter question chips with data-starter-question attributes", () => {
    render(<OnboardingStep step={ONBOARDING_STEPS[4]} />)
    const chip = screen.getByRole("button", { name: /Start with: How do I fix VL150 in VL01N\?/ })
    expect(chip).toHaveAttribute("data-starter-question", "How do I fix VL150 in VL01N?")
  })
})
