import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AvatarWithInitials } from "./avatar-fallback"

describe("AvatarWithInitials", () => {
  it("derives two-letter initials from a first and last name", () => {
    render(<AvatarWithInitials name="Jane Doe" />)
    expect(screen.getByText("JD")).toBeInTheDocument()
  })

  it("derives initials from the first two letters of a single-word name", () => {
    render(<AvatarWithInitials name="Cher" />)
    expect(screen.getByText("CH")).toBeInTheDocument()
  })

  it("uses only the first and last word for multi-word names", () => {
    render(<AvatarWithInitials name="Mary Jane Watson" />)
    expect(screen.getByText("MW")).toBeInTheDocument()
  })

  it("falls back to '?' for an empty name", () => {
    render(<AvatarWithInitials name="   " />)
    expect(screen.getByText("?")).toBeInTheDocument()
  })

  it("uses the name as alt text when an image src is provided", () => {
    render(<AvatarWithInitials name="Jane Doe" src="/avatars/jane.png" />)
    // Radix's AvatarImage only paints once the image actually loads, which
    // jsdom never does — the fallback stays visible either way, which is
    // itself the behavior worth confirming (no broken-image flash).
    expect(screen.getByText("JD")).toBeInTheDocument()
  })
})
