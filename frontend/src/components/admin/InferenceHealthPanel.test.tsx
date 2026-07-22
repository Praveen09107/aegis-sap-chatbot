import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { InferenceHealthPanel } from "./InferenceHealthPanel"
import type { InferenceHealthData } from "@/hooks/queries/adminHealth"

function makeData(overrides: Partial<InferenceHealthData> = {}): InferenceHealthData {
  return {
    badge: "green",
    chains: {
      main: [
        {
          tier_position: 1,
          provider: "groq",
          model: "gpt-oss-120b",
          circuit_state: "closed",
          circuit_total_calls: 120,
          circuit_total_failures: 2,
          quota_remaining: 480,
          last_known_in_catalog: true,
          last_known_live_call_ok: true,
          last_checked_at: "2026-07-22T09:00:00Z",
        },
        {
          tier_position: 2,
          provider: "cloudflare",
          model: "llama-3.3-70b",
          circuit_state: "open",
          circuit_total_calls: 10,
          circuit_total_failures: 10,
          quota_remaining: null,
          last_known_in_catalog: null,
          last_known_live_call_ok: null,
          last_checked_at: null,
        },
      ],
    },
    last_health_check: { run_id: "run-1", checked_at: "2026-07-22T08:00:00Z", drift_found: 0 },
    ...overrides,
  }
}

describe("InferenceHealthPanel", () => {
  it("shows a loading skeleton when isLoading", () => {
    render(<InferenceHealthPanel data={undefined} isLoading />)
    expect(screen.queryByText("Inference orchestration")).not.toBeInTheDocument()
  })

  it("renders the green 'All chains healthy' badge", () => {
    render(<InferenceHealthPanel data={makeData({ badge: "green" })} />)
    expect(screen.getByText("All chains healthy")).toBeInTheDocument()
  })

  it("renders the amber 'Catalog drift detected' badge", () => {
    render(<InferenceHealthPanel data={makeData({ badge: "amber" })} />)
    expect(screen.getByText("Catalog drift detected")).toBeInTheDocument()
  })

  it("renders the red 'A chain has fully opened' badge", () => {
    render(<InferenceHealthPanel data={makeData({ badge: "red" })} />)
    expect(screen.getByText("A chain has fully opened")).toBeInTheDocument()
  })

  it("renders a role group per chain with the human-readable role label", () => {
    render(<InferenceHealthPanel data={makeData()} />)
    expect(screen.getByText("Main reasoning")).toBeInTheDocument()
  })

  it("falls back to the raw role key when no label mapping exists", () => {
    render(<InferenceHealthPanel data={makeData({ chains: { custom_role: [] } })} />)
    expect(screen.getByText("custom_role")).toBeInTheDocument()
  })

  it("renders every tier with provider, model, call/failure counts, and quota when present", () => {
    render(<InferenceHealthPanel data={makeData()} />)
    expect(screen.getByText("groq")).toBeInTheDocument()
    expect(screen.getByText(/gpt-oss-120b/)).toBeInTheDocument()
    expect(screen.getByText(/120 calls · 2 failures · 480 quota left/)).toBeInTheDocument()
  })

  it("omits the quota fragment when quota_remaining is null", () => {
    render(<InferenceHealthPanel data={makeData()} />)
    expect(screen.getByText(/10 calls · 10 failures/)).toBeInTheDocument()
    expect(screen.queryByText(/10 calls · 10 failures · .+ quota left/)).not.toBeInTheDocument()
  })

  it("shows the last catalog check timestamp and drift count when present", () => {
    render(<InferenceHealthPanel data={makeData({ last_health_check: { run_id: "r1", checked_at: "2026-07-22T08:00:00Z", drift_found: 2 } })} />)
    expect(screen.getByText(/Last catalog check/)).toBeInTheDocument()
    expect(screen.getByText(/2 drift\(s\) found/)).toBeInTheDocument()
  })

  it("omits the catalog check footer when last_health_check is null", () => {
    render(<InferenceHealthPanel data={makeData({ last_health_check: null })} />)
    expect(screen.queryByText(/Last catalog check/)).not.toBeInTheDocument()
  })
})
