import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ServiceStatusGrid } from "./ServiceStatusGrid"
import type { ServiceHealth } from "@/types"

function makeService(overrides: Partial<ServiceHealth> = {}): ServiceHealth {
  return {
    name: "aegis-nginx",
    container_name: "aegis-nginx",
    status: "healthy",
    response_time_ms: 12,
    last_checked_at: "2026-07-22T10:00:00Z",
    ...overrides,
  }
}

describe("ServiceStatusGrid", () => {
  it("renders all 7 category groups", () => {
    render(<ServiceStatusGrid services={[]} onServiceClick={vi.fn()} />)
    for (const label of ["Infrastructure", "Application", "AI models", "Vector / search", "Database", "Cache / queue", "Monitoring"]) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument()
    }
  })

  it("shows a tile for every one of the 19 known services, even when the live list is empty", () => {
    render(<ServiceStatusGrid services={[]} onServiceClick={vi.fn()} />)
    expect(screen.getAllByRole("button")).toHaveLength(19)
  })

  it("renders a missing service as 'unknown' rather than omitting it", () => {
    render(<ServiceStatusGrid services={[]} onServiceClick={vi.fn()} />)
    const nginxTile = screen.getByRole("button", { name: /nginx/ })
    expect(nginxTile).toHaveAccessibleName("nginx: Unknown")
  })

  it("uses the real status for a service present in the live list", () => {
    render(<ServiceStatusGrid services={[makeService({ name: "aegis-nginx", status: "healthy", response_time_ms: 12 })]} onServiceClick={vi.fn()} />)
    expect(screen.getByRole("button", { name: /nginx/ })).toHaveAccessibleName("nginx: Healthy, 12ms")
  })

  it("calls onServiceClick with the clicked service", async () => {
    const onServiceClick = vi.fn()
    const user = userEvent.setup()
    const service = makeService({ name: "aegis-qdrant", status: "degraded" })
    render(<ServiceStatusGrid services={[service]} onServiceClick={onServiceClick} />)

    await user.click(screen.getByRole("button", { name: /qdrant/ }))
    expect(onServiceClick).toHaveBeenCalledWith(service)
  })

  it("shows a loading skeleton instead of tiles when isLoading", () => {
    render(<ServiceStatusGrid services={[]} isLoading onServiceClick={vi.fn()} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})
