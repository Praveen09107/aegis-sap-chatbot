import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RetrievalModeChart } from "./RetrievalModeChart"

describe("RetrievalModeChart", () => {
  it("renders all 4 mode rows with their percentages", () => {
    render(<RetrievalModeChart modeA={0.15} modeB={0.51} modeC={0.07} cacheHitRate={0.34} />)

    expect(screen.getByText("Mode A")).toBeInTheDocument()
    expect(screen.getByText("Mode B")).toBeInTheDocument()
    expect(screen.getByText("Mode C")).toBeInTheDocument()
    expect(screen.getByText("Cache")).toBeInTheDocument()

    expect(screen.getByRole("progressbar", { name: "Mode A: 15%" })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Mode B: 51%" })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Mode C: 7%" })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Cache: 34%" })).toBeInTheDocument()
  })

  it("renders the sublabels for each mode", () => {
    render(<RetrievalModeChart modeA={0.1} modeB={0.5} modeC={0.1} cacheHitRate={0.3} />)
    expect(screen.getByText("CRAG-corrected")).toBeInTheDocument()
    expect(screen.getByText("Standard")).toBeInTheDocument()
    expect(screen.getByText("Insufficient")).toBeInTheDocument()
    expect(screen.getByText("Hit")).toBeInTheDocument()
  })

  it("rounds fractional percentages to the nearest whole number", () => {
    render(<RetrievalModeChart modeA={0.156} modeB={0.5} modeC={0.1} cacheHitRate={0.3} />)
    expect(screen.getByRole("progressbar", { name: "Mode A: 16%" })).toBeInTheDocument()
  })

  it("labels the list for assistive tech", () => {
    render(<RetrievalModeChart modeA={0.1} modeB={0.5} modeC={0.1} cacheHitRate={0.3} />)
    expect(screen.getByRole("list", { name: "Retrieval mode percentages" })).toBeInTheDocument()
  })

  it("shows a loading skeleton instead of the bars when isLoading", () => {
    render(<RetrievalModeChart modeA={0.1} modeB={0.5} modeC={0.1} cacheHitRate={0.3} isLoading />)
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})
