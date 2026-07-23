import { describe, it, expect } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useEntityDetector } from "./useSapEntityDetector"

describe("useEntityDetector", () => {
  it("detects T-codes and error codes after the debounce delay", async () => {
    const { result, rerender } = renderHook(
      ({ text }) => useEntityDetector(text, { debounceMs: 50, enabled: true }),
      { initialProps: { text: "" } }
    )

    rerender({ text: "Use VL01N to check error VL150" })
    await waitFor(() => expect(result.current.entities.t_codes.length).toBeGreaterThan(0), { timeout: 2000 })

    expect(result.current.entities.t_codes).toContain("VL01N")
    expect(result.current.entities.error_codes).toContain("VL150")
  })

  it("excludes words in the known false-positive list", async () => {
    const { result, rerender } = renderHook(
      ({ text }) => useEntityDetector(text, { debounceMs: 50, enabled: true }),
      { initialProps: { text: "" } }
    )

    // Every word here is in EXCLUDED_PATTERNS — none should surface as a t_code.
    rerender({ text: "THIS AND THAT WILL ONLY ALSO INTO OVER WHEN FROM HAS HAVE NOT BUT ALL ARE WITH THE FOR YES SAP IBM NONE CAN" })
    // Give the debounce time to fire, then assert the settled state.
    await new Promise((r) => setTimeout(r, 150))

    expect(result.current.entities.t_codes).toEqual([])
    expect(result.current.entities.error_codes).toEqual([])
  })

  it("does not run detection when disabled", async () => {
    const { result, rerender } = renderHook(
      ({ text }) => useEntityDetector(text, { debounceMs: 50, enabled: false }),
      { initialProps: { text: "" } }
    )

    rerender({ text: "Use VL01N to check error VL150" })
    await new Promise((r) => setTimeout(r, 150))

    expect(result.current.entities).toEqual({ t_codes: [], error_codes: [] })
  })

  it("returns codes sorted alphabetically", async () => {
    const { result, rerender } = renderHook(
      ({ text }) => useEntityDetector(text, { debounceMs: 50, enabled: true }),
      { initialProps: { text: "" } }
    )

    rerender({ text: "MM02 and VA01 and FB60" })
    await waitFor(() => expect(result.current.entities.t_codes.length).toBe(3), { timeout: 2000 })

    expect(result.current.entities.t_codes).toEqual(["FB60", "MM02", "VA01"])
  })
})
