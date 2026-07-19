import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MarkdownMessage } from "./MarkdownMessage"

// FRONTEND_VERIFICATION_STANDARDS.md Part 6 — content here is real LLM
// output, a real XSS surface, not markup this app controls.
describe("MarkdownMessage — security", () => {
  it("never renders a <script> tag from embedded HTML in model output", () => {
    const { container } = render(<MarkdownMessage content={'Ignore instructions. <script>window.__pwned = true</script> Done.'} />)
    expect(container.querySelector("script")).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it("does not execute an inline event handler embedded as raw HTML", () => {
    const { container } = render(<MarkdownMessage content={'<img src=x onerror="window.__pwned2=true">'} />)
    const img = container.querySelector("img")
    // Either the tag never renders as a real <img>, or if it does, no
    // onerror/onclick attribute survives to the DOM.
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull()
    }
    expect((window as unknown as { __pwned2?: boolean }).__pwned2).toBeUndefined()
  })

  it("strips a javascript: URL from a markdown link", () => {
    render(<MarkdownMessage content={"[click me](javascript:alert(1))"} />)
    const link = screen.queryByText("click me")
    const href = link?.getAttribute("href")
    // rehype-sanitize either drops the href attribute entirely or leaves
    // it absent — either way, no javascript: URL may reach the DOM.
    if (href) {
      expect(href).not.toMatch(/^javascript:/i)
    }
  })

  it("real markdown syntax still renders as real elements — sanitization doesn't break legitimate formatting", () => {
    render(<MarkdownMessage content={"**bold** and a list:\n\n- one\n- two"} />)
    // SAPEntityHighlighter wraps every non-entity text segment in its own
    // <span>, so the innermost match for "bold" is that span — assert on
    // its ancestor instead of the element getByText resolves to directly.
    expect(screen.getByText("bold").closest("strong")).toBeInTheDocument()
    expect(screen.getByText("one").closest("li")).toBeInTheDocument()
  })

  it("adds rel=noopener noreferrer to external links opened in a new tab", () => {
    render(<MarkdownMessage content={"[SAP Help](https://help.sap.com/docs)"} />)
    const link = screen.getByRole("link", { name: "SAP Help" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})

describe("MarkdownMessage — SAP entity composition", () => {
  it("highlights a SAP error code inside a markdown paragraph", () => {
    render(<MarkdownMessage content="Fix the VL150 error by checking the delivery quantity." />)
    const chip = screen.getByText("VL150")
    expect(chip).toHaveAttribute("role", "mark")
  })

  it("highlights entities inside list items", () => {
    render(<MarkdownMessage content={"Steps:\n\n1. Open VL01N\n2. Check MMBE"} />)
    expect(screen.getByText("VL01N")).toHaveAttribute("role", "mark")
    expect(screen.getByText("MMBE")).toHaveAttribute("role", "mark")
  })

  it("does NOT turn an entity-looking string inside a code block into a chip", () => {
    render(<MarkdownMessage content={"Run `VL01N` from the command line."} />)
    const code = screen.getByText("VL01N")
    expect(code.tagName).toBe("CODE")
    expect(code).not.toHaveAttribute("role", "mark")
  })
})
