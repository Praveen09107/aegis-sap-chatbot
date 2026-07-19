import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Spinner, LoadingSpinner } from "./spinner"

describe("Spinner", () => {
  it("exposes an accessible status role with the given label", () => {
    render(<Spinner label="Loading sessions..." />)
    expect(screen.getByRole("status", { name: "Loading sessions..." })).toBeInTheDocument()
  })

  it("defaults to the label 'Loading'", () => {
    render(<Spinner />)
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()
  })
})

describe("LoadingSpinner", () => {
  it("renders a status region with a visible label", () => {
    render(<LoadingSpinner label="Loading documents..." />)
    // Two nested role="status" nodes are expected — the section container
    // and the inline Spinner it wraps — hence getAllByRole, not getByRole.
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0)
    // Appears twice — Spinner's sr-only text and the visible <p> label.
    expect(screen.getAllByText("Loading documents...").length).toBe(2)
  })
})
