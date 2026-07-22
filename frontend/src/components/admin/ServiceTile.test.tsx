import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ServiceTile } from "./ServiceTile"
import type { ServiceHealth } from "@/types"

function makeService(overrides: Partial<ServiceHealth> = {}): ServiceHealth {
  return {
    name: "aegis-fastapi",
    container_name: "aegis-fastapi",
    status: "healthy",
    response_time_ms: 8,
    last_checked_at: "2026-07-22T10:00:00Z",
    ...overrides,
  }
}

describe("ServiceTile", () => {
  it("strips the aegis- prefix and shows the response time for a healthy service", () => {
    render(<ServiceTile service={makeService()} onClick={vi.fn()} />)
    expect(screen.getByText("fastapi")).toBeInTheDocument()
    expect(screen.getByText("8ms")).toBeInTheDocument()
  })

  it("shows the status label instead of a response time for a degraded service", () => {
    render(<ServiceTile service={makeService({ status: "degraded", response_time_ms: 340 })} onClick={vi.fn()} />)
    expect(screen.getByText("Degraded")).toBeInTheDocument()
    expect(screen.queryByText("340ms")).not.toBeInTheDocument()
  })

  it("shows 'Down' for an unhealthy service", () => {
    render(<ServiceTile service={makeService({ status: "unhealthy", response_time_ms: null })} onClick={vi.fn()} />)
    expect(screen.getByText("Down")).toBeInTheDocument()
  })

  it("shows 'Unknown' for a service with unknown status", () => {
    render(<ServiceTile service={makeService({ status: "unknown", response_time_ms: null })} onClick={vi.fn()} />)
    expect(screen.getByText("Unknown")).toBeInTheDocument()
  })

  it("calls onClick with the service when clicked", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    const service = makeService()
    render(<ServiceTile service={service} onClick={onClick} />)

    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledWith(service)
  })

  it("has an accessible label including name, status, and response time", () => {
    render(<ServiceTile service={makeService({ name: "aegis-qdrant", response_time_ms: 22 })} onClick={vi.fn()} />)
    expect(screen.getByRole("button")).toHaveAccessibleName("qdrant: Healthy, 22ms")
  })
})
