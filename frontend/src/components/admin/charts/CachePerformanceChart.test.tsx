import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { CachePerformanceChart } from "./CachePerformanceChart"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}))

const data = [
  { date: "Mon", hit_rate: 0.3, total_queries: 100 },
  { date: "Tue", hit_rate: 0.42, total_queries: 110 },
]

describe("CachePerformanceChart", () => {
  it("renders the chart title and an accessible chart region", () => {
    render(<CachePerformanceChart data={data} />)
    expect(screen.getByText("Cache hit rate")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Cache hit rate trend over selected period" })).toBeInTheDocument()
  })

  it("shows the latest hit rate as a rounded percentage", () => {
    render(<CachePerformanceChart data={data} />)
    expect(screen.getByText("42%")).toBeInTheDocument()
  })

  it("does not show a latest value when data is empty", () => {
    render(<CachePerformanceChart data={[]} />)
    expect(screen.queryByText(/Latest:/)).not.toBeInTheDocument()
  })

  it("shows a loading skeleton instead of the chart when isLoading", () => {
    render(<CachePerformanceChart data={data} isLoading />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByText("Cache hit rate")).not.toBeInTheDocument()
  })
})
