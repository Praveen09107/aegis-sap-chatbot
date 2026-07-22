import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TopModulesChart } from "./TopModulesChart"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}))

const data = [
  { module: "SD", query_count: 120, avg_score: 0.9 },
  { module: "MM", query_count: 80, avg_score: 0.75 },
  { module: "FI", query_count: 40, avg_score: 0.6 },
]

describe("TopModulesChart", () => {
  it("renders the chart title and an accessible chart region", () => {
    render(<TopModulesChart data={data} />)
    expect(screen.getByText("Top SAP modules")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Query volume and average confidence score per SAP module" })).toBeInTheDocument()
  })

  it("renders the score legend", () => {
    render(<TopModulesChart data={data} />)
    expect(screen.getByText("≥ 85% avg score")).toBeInTheDocument()
    expect(screen.getByText("70–85% avg score")).toBeInTheDocument()
    expect(screen.getByText("< 70% avg score")).toBeInTheDocument()
  })

  it("limits rendered modules to the top 6 by query count", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ module: `M${i}`, query_count: 100 - i, avg_score: 0.8 }))
    render(<TopModulesChart data={many} />)
    // 6 modules -> chart height = 6*36+20 = 236
    expect(screen.getByRole("img")).toHaveStyle({ height: "236px" })
  })

  it("shows a loading skeleton instead of the chart when isLoading", () => {
    render(<TopModulesChart data={data} isLoading />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByText("Top SAP modules")).not.toBeInTheDocument()
  })
})
