import { describe, it, expect, vi, afterEach } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ErrorBoundary } from "./ErrorBoundary"

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom")
  return <div>All good</div>
}

describe("ErrorBoundary", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

  afterEach(() => {
    consoleError.mockClear()
  })

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText("All good")).toBeInTheDocument()
  })

  it("renders the default fallback with the section label when a child throws", () => {
    render(
      <ErrorBoundary section="metrics panel">
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText("Could not load metrics panel")).toBeInTheDocument()
  })

  it("renders a generic message when no section is given", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText("An error occurred in this section")).toBeInTheDocument()
  })

  it("uses a custom fallback render prop when provided", () => {
    render(
      <ErrorBoundary fallback={(error) => <div>Custom: {error.message}</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText("Custom: boom")).toBeInTheDocument()
  })

  it("'Try again' resets the boundary, re-rendering children if they no longer throw", async () => {
    const user = userEvent.setup()
    function Wrapper() {
      const [shouldThrow, setShouldThrow] = useState(true)
      return (
        <ErrorBoundary
          fallback={(_error: Error, reset: () => void) => (
            <button
              onClick={() => {
                setShouldThrow(false)
                reset()
              }}
            >
              Try again
            </button>
          )}
        >
          <Bomb shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    render(<Wrapper />)
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(screen.getByText("All good")).toBeInTheDocument()
  })
})
