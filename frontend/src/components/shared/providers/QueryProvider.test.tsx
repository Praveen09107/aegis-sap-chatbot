import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { useQueryClient } from "@tanstack/react-query"
import { QueryProvider } from "./QueryProvider"
import { APIError } from "@/lib/api"

function captureRetryFn(onCapture: (fn: unknown) => void) {
  function Capture() {
    const client = useQueryClient()
    onCapture(client.getDefaultOptions().queries?.retry)
    return null
  }
  return Capture
}

describe("QueryProvider", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <QueryProvider>
        <p>child content</p>
      </QueryProvider>
    )
    expect(getByText("child content")).toBeInTheDocument()
  })

  it("never retries a 401 (auth expired)", () => {
    let retry: unknown
    const Capture = captureRetryFn((fn) => (retry = fn))
    render(
      <QueryProvider>
        <Capture />
      </QueryProvider>
    )
    expect(typeof retry).toBe("function")
    expect((retry as (count: number, error: unknown) => boolean)(0, new APIError(401, "expired"))).toBe(false)
  })

  it("never retries a 404 (not found)", () => {
    let retry: unknown
    const Capture = captureRetryFn((fn) => (retry = fn))
    render(
      <QueryProvider>
        <Capture />
      </QueryProvider>
    )
    expect((retry as (count: number, error: unknown) => boolean)(0, new APIError(404, "not found"))).toBe(false)
  })

  it("retries a network error (status 0) up to 2 times", () => {
    let retry: unknown
    const Capture = captureRetryFn((fn) => (retry = fn))
    render(
      <QueryProvider>
        <Capture />
      </QueryProvider>
    )
    const fn = retry as (count: number, error: unknown) => boolean
    const networkError = new APIError(0, "Network error")
    expect(fn(0, networkError)).toBe(true)
    expect(fn(1, networkError)).toBe(true)
    expect(fn(2, networkError)).toBe(false)
  })

  it("retries a 500 (server error) up to 2 times", () => {
    let retry: unknown
    const Capture = captureRetryFn((fn) => (retry = fn))
    render(
      <QueryProvider>
        <Capture />
      </QueryProvider>
    )
    const fn = retry as (count: number, error: unknown) => boolean
    const serverError = new APIError(503, "unavailable")
    expect(fn(0, serverError)).toBe(true)
    expect(fn(2, serverError)).toBe(false)
  })

  it("retries a non-APIError up to 2 times (defensive default)", () => {
    let retry: unknown
    const Capture = captureRetryFn((fn) => (retry = fn))
    render(
      <QueryProvider>
        <Capture />
      </QueryProvider>
    )
    const fn = retry as (count: number, error: unknown) => boolean
    expect(fn(0, new Error("plain"))).toBe(true)
    expect(fn(2, new Error("plain"))).toBe(false)
  })
})
