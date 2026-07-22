import { test, expect } from "@playwright/experimental-ct-react"
import { ServiceTile } from "@/components/admin/ServiceTile"
import { ServiceStatusGrid } from "@/components/admin/ServiceStatusGrid"
import { InferenceHealthPanel } from "@/components/admin/InferenceHealthPanel"
import type { ServiceHealth } from "@/types"

// F14 — component-level visual baselines for the admin system health and
// analytics components (FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md, plus the new
// real inference-health/pipeline-health integrations from DEC-058/059/060),
// captured via Playwright CT per the pattern established in F04-F13.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F13 CT spec.
//
// Scope note — deliberately excluded, extending the same reasoning already
// established in f11/f12/f13's own CT specs:
// - QuickEntryPipelineHealth: uses next/link (attention-entries list) — no
//   prior CT spec in this project has ever mounted a next/link-using
//   component (GapCard/AuditTimeline were excluded from f13's CT spec for
//   the exact same reason), so not a safe first attempt here either.
// - QueryVolumeChart / CachePerformanceChart / TopModulesChart: all call
//   next-themes's useTheme() unconditionally — no prior CT spec has ever
//   mounted a next-themes-dependent component (ValidationScoreChart /
//   ConfidenceDistChart / RetrievalModeChart were excluded from f11's CT
//   spec for the same reason, despite being the same family of chart).
// - system-health/page.tsx, analytics/page.tsx: both call real TanStack
//   Query hooks with no QueryClientProvider set up in this project's plain-
//   Vite CT harness — no prior session has ever mounted a full page
//   component for this same reason (see f11's dashboard, f12's documents-
//   registry, f13's four pages).

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

test.describe("ServiceTile", () => {
  test("renders healthy, degraded, unhealthy, and unknown states", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 12, width: 700, padding: 16, background: "#060B14" }}>
        <ServiceTile service={makeService({ status: "healthy", response_time_ms: 12 })} onClick={() => {}} />
        <ServiceTile service={makeService({ name: "aegis-vault", status: "degraded", response_time_ms: 340 })} onClick={() => {}} />
        <ServiceTile service={makeService({ name: "aegis-qdrant", status: "unhealthy", response_time_ms: null })} onClick={() => {}} />
        <ServiceTile service={makeService({ name: "aegis-grafana", status: "unknown", response_time_ms: null })} onClick={() => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("service-tile-states.png")
  })
})

test.describe("ServiceStatusGrid", () => {
  test("renders all 7 category groups with a mix of statuses", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 900, padding: 16, background: "#060B14" }}>
        <ServiceStatusGrid
          services={[
            makeService({ name: "aegis-nginx", status: "healthy", response_time_ms: 12 }),
            makeService({ name: "aegis-vault", status: "degraded", response_time_ms: 200 }),
            makeService({ name: "aegis-qdrant", status: "unhealthy", response_time_ms: null }),
          ]}
          onServiceClick={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("service-status-grid.png")
  })

  test("renders the loading skeleton", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 900, padding: 16, background: "#060B14" }}>
        <ServiceStatusGrid services={[]} isLoading onServiceClick={() => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("service-status-grid-loading.png")
  })
})

test.describe("InferenceHealthPanel", () => {
  test("renders per-role tier chains with mixed circuit states and quota", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 500, padding: 16, background: "#060B14" }}>
        <InferenceHealthPanel
          data={{
            badge: "amber",
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
                  last_known_in_catalog: false,
                  last_known_live_call_ok: false,
                  last_checked_at: null,
                },
              ],
            },
            last_health_check: { run_id: "run-1", checked_at: "2026-07-22T08:00:00Z", drift_found: 1 },
          }}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("inference-health-panel.png")
  })
})
