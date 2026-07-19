import { describe, it, expect } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("joins plain class strings", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center")
  })

  it("drops falsy values", () => {
    expect(cn("flex", false, undefined, null, "gap-2")).toBe("flex gap-2")
  })

  it("resolves conflicting Tailwind utilities to the last one (tailwind-merge behavior)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("applies conditional classes from an object", () => {
    expect(cn("base", { "text-danger": true, "text-success": false })).toBe("base text-danger")
  })
})
