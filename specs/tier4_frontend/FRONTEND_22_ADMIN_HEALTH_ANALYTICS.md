# FRONTEND_22: ADMIN SYSTEM HEALTH & ANALYTICS
## 19-Service Health Monitor and Multi-Chart Quality Analytics
## Session F15 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F15: System health and analytics admin pages.
This document completes the entire admin portal.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/app/(admin)/admin/system-health/
├── page.tsx
└── loading.tsx

src/app/(admin)/admin/analytics/
├── page.tsx
└── loading.tsx

src/components/admin/
├── ServiceTile.tsx              ← Individual service status tile
└── ServiceStatusGrid.tsx        ← Categorised grid of all 19 services

src/components/admin/charts/
├── QueryVolumeChart.tsx         ← Bar chart: query count over time
├── CachePerformanceChart.tsx    ← Line chart: cache hit rate over time
└── TopModulesChart.tsx          ← Horizontal bar: queries per SAP module
```

**Reused from FRONTEND_17 (already created, no changes needed):**
- `ValidationScoreChart.tsx`
- `ConfidenceDistChart.tsx`
- `RetrievalModeChart.tsx`

---

## SERVICE CATEGORIES (19 services, 7 groups)

The health grid organises services into semantic groups instead of a flat list.
This makes anomalies easier to spot — an admin sees "AI Models" degraded at a glance.

```
INFRASTRUCTURE (3):  nginx · keycloak · vault
APPLICATION (2):     fastapi · arq
AI MODELS (5):       ollama-main · ollama-judge · ollama-vision · bge · deberta
VECTOR / SEARCH (2): qdrant · opensearch
DATABASE (3):        postgres-primary · postgres-replica · pgbouncer
CACHE / QUEUE (2):   redis-session · redis-queue
MONITORING (2):      prometheus · grafana
```

All 19 service names match `DOCKER_SERVICES` from `src/lib/constants.ts`.
Strip `aegis-` prefix for display labels.

---

## SYSTEM HEALTH PAGE LAYOUT

```
System health   19-service Docker status monitor   ↻ Updated 22s ago

Overall: 🟢 17 healthy · 1 degraded · 1 unknown

── INFRASTRUCTURE ─────────────────────────────────
  [🟢 nginx 12ms] [🟢 keycloak 48ms] [🟡 vault deg]

── APPLICATION ────────────────────────────────────
  [🟢 fastapi 8ms] [🟢 arq 22ms]

── AI MODELS ──────────────────────────────────────
  [🟢 ollama-main 340ms] [🟢 ollama-judge 280ms] ...

... (all 7 groups)
```

---

## FILE 1: src/components/admin/ServiceTile.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'

type ServiceStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown'

interface ServiceHealth {
  name: string
  status: ServiceStatus
  response_time_ms: number | null
  error_message?: string | null
  last_checked_at: string
}

interface ServiceTileProps {
  service: ServiceHealth
  onClick: (service: ServiceHealth) => void
}

const STATUS_CONFIG: Record<ServiceStatus, {
  dot: string
  bg: string
  border: string
  label: string
  textColor: string
}> = {
  healthy:   { dot: 'bg-success',      bg: 'bg-success-bg/30',   border: 'border-success-border/40',  label: 'Healthy',   textColor: 'text-success-text' },
  degraded:  { dot: 'bg-warning',      bg: 'bg-warning-bg/30',   border: 'border-warning-border/40',  label: 'Degraded',  textColor: 'text-warning-text' },
  unhealthy: { dot: 'bg-danger',       bg: 'bg-danger-bg/40',    border: 'border-danger-border/50',   label: 'Down',      textColor: 'text-danger-text'  },
  unknown:   { dot: 'bg-text-tertiary',bg: 'bg-bg-tertiary',     border: 'border-border-primary',     label: 'Unknown',   textColor: 'text-text-tertiary' },
}

function formatServiceName(fullName: string): string {
  // Strip "aegis-" prefix and format for display
  return fullName
    .replace(/^aegis-/, '')
    .replace(/-/g, ' ')
    .replace(/\b(main|primary|session)\b/g, (m) => m)
}

/**
 * Individual service status tile for the system health grid.
 * Color-coded by status. Click opens the service detail drawer.
 *
 * @example
 * <ServiceTile
 *   service={{ name: 'aegis-nginx', status: 'healthy', response_time_ms: 12, ... }}
 *   onClick={(svc) => setSelectedService(svc)}
 * />
 */
export function ServiceTile({ service, onClick }: ServiceTileProps) {
  const config = STATUS_CONFIG[service.status]
  const displayName = formatServiceName(service.name)

  return (
    <button
      onClick={() => onClick(service)}
      className={cn(
        'flex flex-col gap-1.5 p-3 rounded-xl border',
        'text-left w-full',
        'transition-all duration-[var(--duration-normal)]',
        'hover:shadow-md hover:scale-[1.02]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        'active:scale-[0.98]',
        config.bg,
        config.border,
      )}
      aria-label={`${displayName}: ${config.label}${service.response_time_ms != null ? `, ${service.response_time_ms}ms` : ''}`}
    >
      {/* Status dot + name */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            config.dot,
            service.status === 'healthy' && 'animate-status-pulse',
          )}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold text-text-primary truncate capitalize">
          {displayName}
        </span>
      </div>

      {/* Response time or status label */}
      <p className={cn('text-xs tabular-nums', config.textColor)}>
        {service.status === 'healthy' && service.response_time_ms != null
          ? `${service.response_time_ms}ms`
          : config.label}
      </p>
    </button>
  )
}
```

---

## FILE 2: src/components/admin/ServiceStatusGrid.tsx (COMPLETE)

```typescript
'use client'

import { useMemo } from 'react'
import { ServiceTile } from './ServiceTile'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type ServiceStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown'

interface ServiceHealth {
  name: string
  status: ServiceStatus
  response_time_ms: number | null
  error_message?: string | null
  last_checked_at: string
}

interface ServiceStatusGridProps {
  services: ServiceHealth[]
  isLoading?: boolean
  onServiceClick: (service: ServiceHealth) => void
}

// Static category groupings — ordered for display
const SERVICE_CATEGORIES: { label: string; prefix: string[] }[] = [
  { label: 'Infrastructure', prefix: ['aegis-nginx', 'aegis-keycloak', 'aegis-vault'] },
  { label: 'Application',    prefix: ['aegis-fastapi', 'aegis-arq'] },
  { label: 'AI models',      prefix: ['aegis-ollama-main', 'aegis-ollama-judge', 'aegis-ollama-vision', 'aegis-bge', 'aegis-deberta'] },
  { label: 'Vector / search',prefix: ['aegis-qdrant', 'aegis-opensearch'] },
  { label: 'Database',       prefix: ['aegis-postgres-primary', 'aegis-postgres-replica', 'aegis-pgbouncer'] },
  { label: 'Cache / queue',  prefix: ['aegis-redis-session', 'aegis-redis-queue'] },
  { label: 'Monitoring',     prefix: ['aegis-prometheus', 'aegis-grafana'] },
]

/**
 * Categorised grid of all 19 Docker service tiles.
 * Groups services by logical category with section headers.
 * Unknown services (not in category list) appear in a final "Other" group.
 */
export function ServiceStatusGrid({ services, isLoading, onServiceClick }: ServiceStatusGridProps) {
  const serviceMap = useMemo(() => {
    const map = new Map<string, ServiceHealth>()
    for (const svc of services) map.set(svc.name, svc)
    return map
  }, [services])

  if (isLoading) {
    return (
      <div className="space-y-6">
        {SERVICE_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <Skeleton className="h-2.5 w-28 mb-3" />
            <div className={cn('grid gap-3', cat.prefix.length <= 3 ? 'grid-cols-3' : 'grid-cols-5')}>
              {cat.prefix.map((name) => (
                <Skeleton key={name} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6" role="list" aria-label="Docker service statuses">
      {SERVICE_CATEGORIES.map((category) => {
        const categoryServices = category.prefix
          .map((name) => serviceMap.get(name) ?? {
            name,
            status: 'unknown' as ServiceStatus,
            response_time_ms: null,
            last_checked_at: new Date().toISOString(),
          })

        const gridCols = categoryServices.length <= 3
          ? 'grid-cols-3'
          : categoryServices.length === 4
          ? 'grid-cols-4'
          : 'grid-cols-5'

        return (
          <div key={category.label} role="group" aria-label={category.label}>
            <p className="section-label mb-2.5">{category.label}</p>
            <div className={cn('grid gap-3', gridCols)}>
              {categoryServices.map((service) => (
                <ServiceTile
                  key={service.name}
                  service={service}
                  onClick={onServiceClick}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

---

## FILE 3: src/app/(admin)/admin/system-health/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function HealthLoading() {
  return (
    <div className="px-6 py-5 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Overall banner */}
      <Skeleton className="h-10 w-full rounded-xl" />
      {/* Categories */}
      {[3, 2, 5, 2, 3, 2, 2].map((count, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-2.5 w-28" />
          <div className={`grid gap-3 ${count <= 3 ? 'grid-cols-3' : 'grid-cols-5'}`}>
            {[...Array(count)].map((_, j) => (
              <Skeleton key={j} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## FILE 4: src/app/(admin)/admin/system-health/page.tsx (COMPLETE)

```typescript
'use client'

import { useState } from 'react'
import { Activity, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DashboardRefreshIndicator } from '@/components/admin/DashboardRefreshIndicator'
import { ServiceStatusGrid } from '@/components/admin/ServiceStatusGrid'
import { Drawer } from '@/components/ui/drawer'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useSystemHealth } from '@/hooks/queries'
import { cn } from '@/lib/utils'

type ServiceStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown'

interface ServiceHealth {
  name: string
  status: ServiceStatus
  response_time_ms: number | null
  error_message?: string | null
  last_checked_at: string
}

const OVERALL_CONFIG = {
  healthy:  { bg: 'bg-success-bg  border-success-border',  icon: CheckCircle2,   text: 'All services healthy',      color: 'text-success-text'  },
  degraded: { bg: 'bg-warning-bg  border-warning-border',  icon: AlertTriangle,  text: 'Some services degraded',    color: 'text-warning-text'  },
  critical: { bg: 'bg-danger-bg   border-danger-border',   icon: XCircle,        text: 'Critical services down',    color: 'text-danger-text'   },
} as const

export default function AdminSystemHealthPage() {
  const { data: health, isLoading, dataUpdatedAt } = useSystemHealth()
  const [selectedService, setSelectedService] = useState<ServiceHealth | null>(null)

  const overallStatus = health?.overall_status ?? 'healthy'
  const config = OVERALL_CONFIG[overallStatus] ?? OVERALL_CONFIG.healthy
  const Icon = config.icon

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="System health"
        description="19-service Docker status monitor"
        actions={
          <DashboardRefreshIndicator
            dataUpdatedAt={dataUpdatedAt ?? Date.now()}
          />
        }
      />

      {/* Overall status banner */}
      {!isLoading && health && (
        <div
          className={cn(
            'flex items-center justify-between',
            'rounded-xl border px-4 py-3 mb-5',
            config.bg,
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2.5">
            <Icon className={cn('w-4 h-4 shrink-0', config.color)} aria-hidden="true" />
            <span className={cn('text-sm font-semibold', config.color)}>
              {config.text}
            </span>
          </div>

          {/* Counts */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-success font-medium tabular-nums">
              {health.total_healthy} healthy
            </span>
            {health.total_unhealthy > 0 && (
              <span className="text-danger font-medium tabular-nums">
                {health.total_unhealthy} down
              </span>
            )}
            <span className="text-text-tertiary tabular-nums">
              {health.services.length} total
            </span>
          </div>
        </div>
      )}

      {/* Service grid */}
      <ErrorBoundary section="service status grid">
        <ServiceStatusGrid
          services={health?.services ?? []}
          isLoading={isLoading}
          onServiceClick={setSelectedService}
        />
      </ErrorBoundary>

      {/* Service detail drawer */}
      <Drawer
        open={!!selectedService}
        onOpenChange={(open) => !open && setSelectedService(null)}
        title={selectedService?.name ?? ''}
        description={selectedService ? `Status: ${selectedService.status}` : ''}
        width="md"
      >
        {selectedService && (
          <ServiceDetailContent service={selectedService} />
        )}
      </Drawer>
    </AdminPageWrapper>
  )
}

// ── Service detail drawer content ─────────────────────────────

function ServiceDetailContent({ service }: { service: ServiceHealth }) {
  const statusColorClass =
    service.status === 'healthy'   ? 'text-success' :
    service.status === 'degraded'  ? 'text-warning' :
    service.status === 'unhealthy' ? 'text-danger'  : 'text-text-tertiary'

  return (
    <div className="space-y-5">
      {/* Status */}
      <div>
        <p className="section-label mb-1.5">Current status</p>
        <p className={cn('text-base font-semibold capitalize', statusColorClass)}>
          {service.status}
        </p>
      </div>

      {/* Response time */}
      {service.response_time_ms != null && (
        <div>
          <p className="section-label mb-1.5">Response time</p>
          <p className="text-sm text-text-primary tabular-nums">
            {service.response_time_ms}ms
          </p>
        </div>
      )}

      {/* Last checked */}
      <div>
        <p className="section-label mb-1.5">Last checked</p>
        <p className="text-sm text-text-secondary">
          {new Date(service.last_checked_at).toLocaleString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: 'numeric',
            month: 'short',
          })}
        </p>
      </div>

      {/* Error message (if unhealthy/degraded) */}
      {service.error_message && (
        <div>
          <p className="section-label mb-1.5 text-danger-text">Error message</p>
          <div className="bg-danger-bg border border-danger-border rounded-xl p-3">
            <p className="text-xs font-mono text-danger-text leading-relaxed whitespace-pre-wrap break-all">
              {service.error_message}
            </p>
          </div>
        </div>
      )}

      {/* Health check tip */}
      <div className="pt-2 border-t border-border-primary">
        <p className="text-xs text-text-tertiary leading-relaxed">
          Health status is checked via HTTP GET to each service&apos;s{' '}
          <code className="font-mono bg-bg-tertiary px-1 py-0.5 rounded text-[10px]">/health</code>{' '}
          endpoint every 30 seconds. Response time includes network latency within the Docker network.
        </p>
      </div>
    </div>
  )
}
```

---

## FILE 5: src/components/admin/charts/QueryVolumeChart.tsx (COMPLETE)

```typescript
'use client'

import { useTheme } from 'next-themes'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { ChartTooltip, CHART_COLORS, CHART_TICK_STYLE } from './ChartTooltip'
import { ResponsiveChart } from './ResponsiveChart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface QueryVolumeChartProps {
  data: Array<{ date: string; value: number }>
  isLoading?: boolean
  className?: string
}

export function QueryVolumeChart({ data, isLoading, className }: QueryVolumeChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="flex items-end gap-1.5 h-40">
          {[...Array(14)].map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${35 + Math.random() * 55}%` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('chart-card', className)}>
      <p className="chart-title">Query volume</p>
      <ResponsiveChart height={160} aria-label="Daily query volume over selected period">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} dy={6} />
          <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v} queries`} />}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar
            dataKey="value"
            name="Queries"
            fill={CHART_COLORS.blue}
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveChart>
    </div>
  )
}
```

---

## FILE 6: src/components/admin/charts/CachePerformanceChart.tsx (COMPLETE)

```typescript
'use client'

import { useTheme } from 'next-themes'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { ChartTooltip, CHART_COLORS, CHART_TICK_STYLE } from './ChartTooltip'
import { ResponsiveChart } from './ResponsiveChart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface CachePerformanceChartProps {
  data: Array<{ date: string; hit_rate: number; total_queries: number }>
  isLoading?: boolean
  className?: string
}

export function CachePerformanceChart({ data, isLoading, className }: CachePerformanceChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <Skeleton className="h-3 w-36 mb-4" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }

  // Convert hit_rate 0–1 to 0–100 for display
  const chartData = data.map((d) => ({ ...d, hit_rate_pct: Math.round(d.hit_rate * 100) }))

  return (
    <div className={cn('chart-card', className)}>
      <p className="chart-title">Cache hit rate</p>
      <ResponsiveChart height={160} aria-label="Cache hit rate trend over selected period">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} dy={6} />
          <YAxis
            domain={[0, 100]}
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v}%`} />}
            cursor={{ stroke: CHART_COLORS.purple, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Line
            type="monotone"
            dataKey="hit_rate_pct"
            name="Hit rate"
            stroke={CHART_COLORS.purple}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: CHART_COLORS.purple, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveChart>

      {/* Current value */}
      {data.length > 0 && (
        <div className="flex items-center justify-end mt-2">
          <span className="text-xs text-text-tertiary">
            Latest:{' '}
            <span className="font-semibold tabular-nums" style={{ color: CHART_COLORS.purple }}>
              {Math.round((data[data.length - 1]?.hit_rate ?? 0) * 100)}%
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
```

---

## FILE 7: src/components/admin/charts/TopModulesChart.tsx (COMPLETE)

```typescript
'use client'

import { useTheme } from 'next-themes'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { ChartTooltip, CHART_COLORS, CHART_TICK_STYLE } from './ChartTooltip'
import { ResponsiveChart } from './ResponsiveChart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ModuleData {
  module: string
  query_count: number
  avg_score: number
}

interface TopModulesChartProps {
  data: ModuleData[]
  isLoading?: boolean
  className?: string
}

function getBarColor(avgScore: number): string {
  if (avgScore >= 0.85) return CHART_COLORS.green
  if (avgScore >= 0.70) return CHART_COLORS.amber
  return CHART_COLORS.red
}

/**
 * Horizontal bar chart showing query count per SAP module.
 * Bar colour reflects average ValidationScore for that module
 * (green = high confidence, amber = moderate, red = low).
 */
export function TopModulesChart({ data, isLoading, className }: TopModulesChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-10 shrink-0" />
              <Skeleton className="h-5 rounded-sm" style={{ width: `${40 + i * 10}%` }} />
              <Skeleton className="h-3 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Sort by query count descending, take top 6
  const sorted = [...data]
    .sort((a, b) => b.query_count - a.query_count)
    .slice(0, 6)

  return (
    <div className={cn('chart-card', className)}>
      <p className="chart-title">Top SAP modules</p>
      <ResponsiveChart
        height={sorted.length * 36 + 20}
        aria-label="Query volume and average confidence score per SAP module"
      >
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis
            type="number"
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="module"
            tick={{ ...CHART_TICK_STYLE, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(v, name) =>
                  name === 'query_count'
                    ? `${v} queries`
                    : `${(Number(v) * 100).toFixed(1)}% avg score`
                }
              />
            }
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="query_count" name="Queries" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {sorted.map((entry, i) => (
              <Cell key={i} fill={getBarColor(entry.avg_score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveChart>

      {/* Score legend */}
      <div className="flex items-center gap-4 mt-2">
        {[
          { color: CHART_COLORS.green, label: '≥ 85%' },
          { color: CHART_COLORS.amber, label: '70–85%' },
          { color: CHART_COLORS.red,   label: '< 70%' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs text-text-tertiary">{label} avg score</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 8: src/app/(admin)/admin/analytics/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function AnalyticsLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d', 'All'].map((r) => (
            <Skeleton key={r} className="h-8 w-14 rounded-lg" />
          ))}
        </div>
      </div>
      {/* 2x2 chart grid + 1x2 bottom row */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 9: src/app/(admin)/admin/analytics/page.tsx (COMPLETE)

```typescript
'use client'

import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ValidationScoreChart } from '@/components/admin/charts/ValidationScoreChart'
import { ConfidenceDistChart } from '@/components/admin/charts/ConfidenceDistChart'
import { QueryVolumeChart } from '@/components/admin/charts/QueryVolumeChart'
import { CachePerformanceChart } from '@/components/admin/charts/CachePerformanceChart'
import { TopModulesChart } from '@/components/admin/charts/TopModulesChart'
import { RetrievalModeChart } from '@/components/admin/charts/RetrievalModeChart'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAdminAnalytics } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { ANALYTICS_RANGES } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Analytics page — multi-chart quality trend reporting.
 * Allows IT admins to understand AEGIS performance over time
 * using the 7d / 30d / 90d / All time range selector.
 *
 * Charts (6 total, arranged in 3 rows of 2):
 * Row 1: ValidationScore trend + Query volume
 * Row 2: Confidence distribution + Cache performance
 * Row 3: Top modules + Retrieval mode breakdown
 *
 * No live polling — data refreshes when the date range changes.
 */
export default function AdminAnalyticsPage() {
  const { analyticsRange, setAnalyticsRange } = useAdminStore()
  const { data: analytics, isLoading } = useAdminAnalytics(analyticsRange)

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Analytics"
        description="Quality trend reporting"
        actions={
          <div className="flex items-center gap-1.5">
            {ANALYTICS_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => setAnalyticsRange(range.value)}
                className={cn(
                  'text-xs font-medium px-3 h-8 rounded-lg border transition-colors',
                  analyticsRange === range.value
                    ? 'bg-accent-subtle border-border-focus text-accent-text'
                    : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
                )}
                aria-pressed={analyticsRange === range.value}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Row 1: Score trend + Query volume */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ErrorBoundary section="ValidationScore trend chart">
          <ValidationScoreChart
            data={analytics?.validation_score_trend ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>

        <ErrorBoundary section="query volume chart">
          <QueryVolumeChart
            data={analytics?.query_volume ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>
      </div>

      {/* Row 2: Confidence distribution + Cache performance */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ErrorBoundary section="confidence distribution chart">
          <ConfidenceDistChart
            data={analytics?.confidence_distribution ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>

        <ErrorBoundary section="cache performance chart">
          <CachePerformanceChart
            data={analytics?.cache_performance ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>
      </div>

      {/* Row 3: Top modules + Retrieval mode */}
      <div className="grid grid-cols-2 gap-3">
        <ErrorBoundary section="top modules chart">
          <TopModulesChart
            data={analytics?.top_modules ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>

        <ErrorBoundary section="retrieval mode chart">
          <RetrievalModeChart
            modeA={analytics?.retrieval_mode_usage?.at(-1)?.mode_a ?? 0}
            modeB={analytics?.retrieval_mode_usage?.at(-1)?.mode_b ?? 0}
            modeC={analytics?.retrieval_mode_usage?.at(-1)?.mode_c ?? 0}
            cacheHitRate={analytics?.cache_performance?.at(-1)?.hit_rate ?? 0}
            isLoading={isLoading}
          />
        </ErrorBoundary>
      </div>
    </AdminPageWrapper>
  )
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# System Health
# Step 1: 19 service tiles render in 7 category groups
# → All categories visible: Infrastructure, Application, AI Models, etc.
# → Each tile shows: service name (without aegis- prefix), status, response time

# Step 2: Status colours correct
# → healthy: subtle green background, pulsing green dot
# → degraded: amber background
# → unhealthy: red background
# → unknown: neutral gray

# Step 3: Overall banner
# → All healthy: green "All services healthy"
# → Mix: amber "Some services degraded" with counts

# Step 4: Tile click → drawer
# → Click any tile → Drawer slides in from right
# → Shows: status, response time, last checked, error message if unhealthy

# Step 5: 30-second polling
# → Network tab: useSystemHealth() refetches every 30s
# → DashboardRefreshIndicator countdown resets after each fetch

# Analytics
# Step 6: All 6 charts render
# → Row 1: ValidationScore AreaChart + Query Volume BarChart
# → Row 2: Confidence Dist BarChart + Cache Performance LineChart
# → Row 3: Top Modules horizontal BarChart + Retrieval Mode bars

# Step 7: Date range toggle
# → Click "7d" → charts update to 7-day data
# → Click "30d" → charts update (staleTime triggers refetch)
# → Click "90d" → 90-day data

# Step 8: TopModulesChart bar colours
# → SD (high score): green bar
# → Module with low score: red bar
# → Colour reflects avg_score, not the module itself

# Step 9: Chart error boundaries
# → If a chart receives malformed data and throws → ErrorBoundary shows retry
# → Other 5 charts continue displaying normally

npx tsc --noEmit  # Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F15: System health + analytics — ServiceTile, ServiceStatusGrid, QueryVolumeChart, CachePerformanceChart, TopModulesChart, health page, analytics page"
```

---
## QUICK ENTRY PIPELINE SECTION (Added in IMPL_29)

The System Health page gains a new section rendered below the existing service tiles.

Section title: "Quick Entry Pipeline"
Data source: GET /api/admin/knowledge-entries/pipeline-health
Type: QuickEntryPipelineHealth (IMPL_23 Section 8)
Polling: 30 seconds (same as existing service health refetchInterval)

Section header badge status logic:
  Green:  all status counts nominal (no failed, no partial_index)
  Amber:  any failed entries > 0 OR failed screenshots > 0 OR stale_config_count > 0
  Red:    failed entries > 5 OR partial_index entries > 5

Rows rendered in the section (full layout in IMPL_29 Section 8.1):
  Row 1: ARQ Queue depths — form entry queue + screenshot queue
  Row 2: Avg processing time last 24h
  Row 3: Entry status distribution (active / draft / processing / failed / partial_index / review_required)
  Row 4: Screenshot vision status distribution (complete / failed / pending / not_sap)
  Row 5: Quality comparison — Quick Entry avg score vs Document avg score
  Row 6: Feedback — entries with net negative feedback (last 30 days)
  Row 7: Storage — screenshot storage MB + files eligible for cleanup

useQuickEntryPipelineHealth hook (FRONTEND_36):
  Polling via useQuery with refetchInterval: 30_000
  Query key: ['quick-entry', 'health']
  Endpoint: GET /api/admin/knowledge-entries/pipeline-health


---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F15*
