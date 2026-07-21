import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ValidationScoreChart } from "./ValidationScoreChart"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}))

const data = [
  { date: "Mon", score: 0.797 },
  { date: "Tue", score: 0.812 },
  { date: "Wed", score: 0.841 },
]

describe("ValidationScoreChart", () => {
  it("renders the chart title and an accessible chart region", () => {
    render(<ValidationScoreChart data={data} />)
    expect(screen.getByText("ValidationScore — 7-day trend")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "ValidationScore trend over the last 7 days" })).toBeInTheDocument()
  })

  it("shows the latest score in the legend", () => {
    render(<ValidationScoreChart data={data} />)
    expect(screen.getByText("0.841")).toBeInTheDocument()
  })

  it("does not show a 'Latest' value when data is empty", () => {
    render(<ValidationScoreChart data={[]} />)
    expect(screen.queryByText(/Latest:/)).not.toBeInTheDocument()
  })

  it("shows the 0.85 threshold legend", () => {
    render(<ValidationScoreChart data={data} />)
    expect(screen.getByText("0.85 threshold")).toBeInTheDocument()
  })

  it("shows a loading skeleton instead of the chart when isLoading", () => {
    render(<ValidationScoreChart data={data} isLoading />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByText("ValidationScore — 7-day trend")).not.toBeInTheDocument()
  })
})
