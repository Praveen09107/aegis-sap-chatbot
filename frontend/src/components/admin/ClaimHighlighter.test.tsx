import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ClaimHighlighter } from "./ClaimHighlighter"

describe("ClaimHighlighter", () => {
  it("renders plain text with no <mark> when claims is empty", () => {
    render(<ClaimHighlighter text="The VL150 error occurs when stock is low." claims={[]} />)
    expect(screen.getByText("The VL150 error occurs when stock is low.")).toBeInTheDocument()
    expect(document.querySelector("mark")).not.toBeInTheDocument()
  })

  it("highlights a single claim substring", () => {
    render(
      <ClaimHighlighter
        text="The VL150 error occurs when available safety stock is insufficient."
        claims={["available safety stock is insufficient"]}
      />
    )
    const mark = document.querySelector("mark")
    expect(mark).toHaveTextContent("available safety stock is insufficient")
  })

  it("highlights multiple distinct claims within the same text", () => {
    render(<ClaimHighlighter text="Claim one and claim two are both wrong." claims={["Claim one", "claim two"]} />)
    const marks = document.querySelectorAll("mark")
    expect(marks).toHaveLength(2)
    expect(marks[0]).toHaveTextContent("Claim one")
    expect(marks[1]).toHaveTextContent("claim two")
  })

  it("merges overlapping claim ranges into a single highlight", () => {
    render(<ClaimHighlighter text="the quick brown fox jumps" claims={["quick brown", "brown fox"]} />)
    const marks = document.querySelectorAll("mark")
    expect(marks).toHaveLength(1)
    expect(marks[0]).toHaveTextContent("quick brown fox")
  })

  it("silently skips a claim that isn't found in the text", () => {
    render(<ClaimHighlighter text="Nothing matches here." claims={["not present"]} />)
    expect(document.querySelector("mark")).not.toBeInTheDocument()
    expect(screen.getByText("Nothing matches here.")).toBeInTheDocument()
  })

  it("matches case-insensitively", () => {
    render(<ClaimHighlighter text="THE ERROR IS HERE" claims={["the error"]} />)
    const mark = document.querySelector("mark")
    expect(mark).toHaveTextContent("THE ERROR")
  })
})
