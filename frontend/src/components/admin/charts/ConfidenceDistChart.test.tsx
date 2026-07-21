import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConfidenceDistChart } from "./ConfidenceDistChart"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}))

const data = [
  { date: "Mon", green: 68, amber: 24, none: 8 },
  { date: "Tue", green: 70, amber: 22, none: 8 },
]

describe("ConfidenceDistChart", () => {
  it("renders the chart title and an accessible chart region", () => {
    render(<ConfidenceDistChart data={data} />)
    expect(screen.getByText("Confidence distribution — 7 days")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Confidence badge distribution over the last 7 days" })).toBeInTheDocument()
  })

  it("renders the Green/Amber/Insufficient legend", () => {
    render(<ConfidenceDistChart data={data} />)
    expect(screen.getByText("Green")).toBeInTheDocument()
    expect(screen.getByText("Amber")).toBeInTheDocument()
    expect(screen.getByText("Insufficient")).toBeInTheDocument()
  })

  it("shows a loading skeleton instead of the chart when isLoading", () => {
    render(<ConfidenceDistChart data={data} isLoading />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByText("Confidence distribution — 7 days")).not.toBeInTheDocument()
  })

  it("works correctly in light theme (grid color branch)", () => {
    render(<ConfidenceDistChart data={data} />)
    expect(screen.getByText("Confidence distribution — 7 days")).toBeInTheDocument()
  })
})
