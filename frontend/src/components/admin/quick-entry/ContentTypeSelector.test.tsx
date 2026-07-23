import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContentTypeSelector } from "./ContentTypeSelector"

describe("ContentTypeSelector", () => {
  it("renders all three real content types", () => {
    render(<ContentTypeSelector onSelect={vi.fn()} onShowOnboarding={vi.fn()} />)
    expect(screen.getByText("Error Guide")).toBeInTheDocument()
    expect(screen.getByText("Procedure")).toBeInTheDocument()
    expect(screen.getByText("Config Reference")).toBeInTheDocument()
  })

  it("calls onSelect with the correct content_type when a card is clicked", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ContentTypeSelector onSelect={onSelect} onShowOnboarding={vi.fn()} />)

    await user.click(screen.getByText("Procedure"))
    expect(onSelect).toHaveBeenCalledWith("procedure")
  })

  it("calls onShowOnboarding when the examples link is clicked", async () => {
    const user = userEvent.setup()
    const onShowOnboarding = vi.fn()
    render(<ContentTypeSelector onSelect={vi.fn()} onShowOnboarding={onShowOnboarding} />)

    await user.click(screen.getByText("See example entries for each type"))
    expect(onShowOnboarding).toHaveBeenCalled()
  })
})
