import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryVolumeChart } from "./QueryVolumeChart"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}))

const data = [
  { date: "Mon", value: 120 },
  { date: "Tue", value: 145 },
]

describe("QueryVolumeChart", () => {
  it("renders the chart title and an accessible chart region", () => {
    render(<QueryVolumeChart data={data} />)
    expect(screen.getByText("Query volume")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Daily query volume over selected period" })).toBeInTheDocument()
  })

  it("shows a loading skeleton instead of the chart when isLoading", () => {
    render(<QueryVolumeChart data={data} isLoading />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByText("Query volume")).not.toBeInTheDocument()
  })
})
