import { describe, it, expect, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MultiTabWarningBanner } from "./MultiTabWarningBanner"
import { useUIStore } from "@/stores/uiStore"

describe("MultiTabWarningBanner", () => {
  beforeEach(() => {
    useUIStore.setState({ multiTabWarning: false })
  })

  it("renders nothing when multiTabWarning is false", () => {
    render(<MultiTabWarningBanner />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("shows the informational banner when multiTabWarning is true", () => {
    useUIStore.setState({ multiTabWarning: true })
    render(<MultiTabWarningBanner />)

    const banner = screen.getByRole("status")
    expect(banner).toHaveTextContent("AEGIS is open in another tab")
    expect(banner).toHaveAttribute("aria-live", "polite")
  })
})
