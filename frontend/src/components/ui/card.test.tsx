import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Card, CardHeader, CardTitle, CardContent } from "./card"

describe("Card", () => {
  it("defaults to the default variant with AEGIS card tokens", () => {
    render(<Card data-testid="card">content</Card>)
    const card = screen.getByTestId("card")
    expect(card.className).toContain("bg-bg-card")
    expect(card.className).toContain("border-border-primary")
  })

  it("applies the elevated variant's shadow-md", () => {
    render(
      <Card data-testid="card" variant="elevated">
        content
      </Card>
    )
    expect(screen.getByTestId("card").className).toContain("shadow-md")
  })

  it("applies the accent variant's tinted background and focus-colored border", () => {
    render(
      <Card data-testid="card" variant="accent">
        content
      </Card>
    )
    const card = screen.getByTestId("card")
    expect(card.className).toContain("bg-accent-subtle")
    expect(card.className).toContain("border-border-focus")
  })

  it("composes with CardHeader/CardTitle/CardContent", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>SD-ERR-001</CardTitle>
        </CardHeader>
        <CardContent>Delivery quantity error</CardContent>
      </Card>
    )
    expect(screen.getByText("SD-ERR-001")).toBeInTheDocument()
    expect(screen.getByText("Delivery quantity error")).toBeInTheDocument()
  })
})
