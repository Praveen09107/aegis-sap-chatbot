# FRONTEND_17: ADMIN DASHBOARD
## Live Metrics Dashboard — The Command Centre for AEGIS Quality
## Session F10 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F10 Part 2: The admin dashboard page.
Run after FRONTEND_16 in the same session.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/app/(admin)/admin/dashboard/
├── page.tsx                    ← Complete dashboard page
└── loading.tsx                 ← Skeleton loading state

src/components/admin/charts/
├── ValidationScoreChart.tsx    ← 7-day ValidationScore area chart
├── ConfidenceDistChart.tsx     ← 7-day confidence distribution bar chart
└── RetrievalModeChart.tsx      ← Retrieval mode breakdown (A/B/C)

src/components/admin/
└── GapEventsList.tsx           ← Knowledge gap events summary list
```

---

## DASHBOARD LAYOUT

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard    Live quality overview   ↻ Updated 22s · Next 8s  │
├─────────────────────────────────────────────────────────────────┤
│  p-6  max-w-[1200px]                                            │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │247       │ │0.84      │ │71%       │ │5         │          │
│  │queries   │ │avg score │ │green     │ │tickets   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                 │
│  ┌──────────────────────────┐ ┌──────────────────────────┐     │
│  │  ValidationScore 7d      │ │  Confidence distribution  │     │
│  │  Area chart — cyan       │ │  Stacked bars G/A/N 7d   │     │
│  └──────────────────────────┘ └──────────────────────────┘     │
│                                                                 │
│  ┌────────────────┐ ┌───────────────────────────────────────┐  │
│  │  Retrieval mode│ │  Knowledge gap events         View → │  │
│  │  Radial chart  │ │  ● VL150 · SD · 23 this week          │  │
│  │  A / B / C     │ │  ● F5201 · FI · 11 this week          │  │
│  └────────────────┘ └───────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## DATA CONTRACTS

### MetricsData (from `GET /api/admin/metrics`)

```typescript
// Defined in src/types/index.ts (FRONTEND_01)
interface MetricsData {
  total_queries_today: number       // e.g. 247
  avg_validation_score: number      // e.g. 0.84
  green_badge_rate: number          // e.g. 0.71  (71%)
  amber_badge_rate: number          // e.g. 0.22
  none_badge_rate: number           // e.g. 0.07
  open_tickets: number              // e.g. 5
  cache_hit_rate: number            // e.g. 0.34
  crag_insufficient_rate: number    // e.g. 0.07
  mode_a_rate: number               // CRAG-corrected rate
  mode_b_rate: number               // Standard retrieval rate
  mode_c_rate: number               // Insufficient rate
  last_updated_at: string           // ISO timestamp
  // 7-day trend data (included in metrics response):
  validation_score_7d: Array<{ date: string; score: number }>
  confidence_dist_7d: Array<{ date: string; green: number; amber: number; none: number }>
  gap_events: Array<{
    query_pattern: string
    module: string
    doc_category: string
    count_this_week: number
    severity: 'high' | 'medium' | 'low'
  }>
}
```

---

## FILE 1: src/components/admin/charts/ValidationScoreChart.tsx (COMPLETE)

```typescript
'use client'

import { useTheme } from 'next-themes'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartTooltip, CHART_COLORS, CHART_TICK_STYLE } from './ChartTooltip'
import { ResponsiveChart } from './ResponsiveChart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ValidationScoreChartProps {
  data: Array<{ date: string; score: number }>
  isLoading?: boolean
  className?: string
}

// Gradient ID for the area fill — unique per chart instance
const GRADIENT_ID = 'aegis-vs-gradient'

/**
 * ValidationScore 7-day trend — AreaChart with gradient fill.
 *
 * Design:
 * - Cyan line (#06B6D4) with 2px stroke
 * - Gradient fill: cyan 20% opacity → transparent
 * - No data dots (activeDot only on hover: radius 4)
 * - Y axis: 0.60–1.00 range (don't show full 0–1)
 * - X axis: short day labels (Mon, Tue...)
 * - Dashed reference line at 0.85 (green threshold)
 * - Tooltip: custom AEGIS tooltip
 *
 * @example
 * <ValidationScoreChart
 *   data={metrics.validation_score_7d}
 *   isLoading={isLoading}
 * />
 */
export function ValidationScoreChart({
  data,
  isLoading,
  className,
}: ValidationScoreChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <Skeleton className="h-3 w-40 mb-4" />
        <div className="flex items-end gap-1 h-40">
          {[...Array(7)].map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1"
              style={{ height: `${55 + i * 6}%` }}
            />
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="flex-1 h-2.5" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('chart-card', className)}>
      <p className="chart-title">ValidationScore — 7-day trend</p>

      <ResponsiveChart
        height={160}
        aria-label="ValidationScore trend over the last 7 days"
      >
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.cyan} stopOpacity={0.25} />
              <stop offset="100%" stopColor={CHART_COLORS.cyan} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke={gridColor}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            dy={6}
          />

          <YAxis
            domain={[0.6, 1.0]}
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v.toFixed(1)}
            ticks={[0.6, 0.7, 0.85, 1.0]}
          />

          <Tooltip
            content={
              <ChartTooltip
                formatter={(value) => Number(value).toFixed(3)}
                labelFormatter={(l) => `${l}`}
              />
            }
            cursor={{ stroke: CHART_COLORS.cyan, strokeWidth: 1, strokeDasharray: '4 2' }}
          />

          {/* Green threshold reference line at 0.85 */}
          {/* Using a custom dot-dash approach via the data */}

          <Area
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={CHART_COLORS.cyan}
            strokeWidth={2.5}
            fill={`url(#${GRADIENT_ID})`}
            dot={false}
            activeDot={{
              r: 4,
              fill: CHART_COLORS.cyan,
              stroke: 'transparent',
              strokeWidth: 0,
            }}
          />
        </AreaChart>
      </ResponsiveChart>

      {/* Threshold legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <span
            className="w-6 h-0.5 bg-success opacity-60"
            style={{ borderTop: `1.5px dashed ${CHART_COLORS.green}` }}
          />
          <span className="text-xs text-text-tertiary">0.85 threshold</span>
        </div>
        {data.length > 0 && (
          <span className="text-xs text-text-tertiary ml-auto tabular-nums">
            Latest:{' '}
            <span className="font-semibold text-accent">
              {data[data.length - 1]?.score.toFixed(3)}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
```

---

## FILE 2: src/components/admin/charts/ConfidenceDistChart.tsx (COMPLETE)

```typescript
'use client'

import { useTheme } from 'next-themes'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ChartTooltip, CHART_COLORS, CHART_TICK_STYLE } from './ChartTooltip'
import { ResponsiveChart } from './ResponsiveChart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ConfidenceDistChartProps {
  data: Array<{ date: string; green: number; amber: number; none: number }>
  isLoading?: boolean
  className?: string
}

/**
 * Confidence distribution — 7-day stacked bar chart.
 * Shows proportion of Green / Amber / None responses per day.
 *
 * Design:
 * - Stacked bars: green on bottom, amber in middle, none on top
 * - Y axis: 0–100 (percentage of responses per day)
 * - Rounded top on the topmost visible bar
 * - Custom legend below chart
 * - Each bar has rounded top-corners only
 */
export function ConfidenceDistChart({
  data,
  isLoading,
  className,
}: ConfidenceDistChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <Skeleton className="h-3 w-44 mb-4" />
        <div className="flex items-end gap-1.5 h-40">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: '90%' }} />
          ))}
        </div>
        <div className="flex gap-3 mt-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('chart-card', className)}>
      <p className="chart-title">Confidence distribution — 7 days</p>

      <ResponsiveChart
        height={160}
        aria-label="Confidence badge distribution over the last 7 days"
      >
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={gridColor}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            dy={6}
          />

          <YAxis
            domain={[0, 100]}
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
          />

          <Tooltip
            content={
              <ChartTooltip
                formatter={(v, name) => `${Number(v).toFixed(1)}%`}
              />
            }
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />

          {/* Stacked bars: green (bottom) → amber → none (top) */}
          <Bar
            dataKey="green"
            name="Green"
            stackId="confidence"
            fill={CHART_COLORS.green}
            radius={[0, 0, 2, 2]}  // Only round the bottom bar at bottom
          />
          <Bar
            dataKey="amber"
            name="Amber"
            stackId="confidence"
            fill={CHART_COLORS.amber}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="none"
            name="Insufficient"
            stackId="confidence"
            fill={CHART_COLORS.gray}
            radius={[3, 3, 0, 0]}  // Round top of the topmost bar
          />
        </BarChart>
      </ResponsiveChart>

      {/* Custom legend */}
      <div className="flex items-center gap-4 mt-2">
        {[
          { color: CHART_COLORS.green, label: 'Green' },
          { color: CHART_COLORS.amber, label: 'Amber' },
          { color: CHART_COLORS.gray,  label: 'Insufficient' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="text-xs text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 3: src/components/admin/charts/RetrievalModeChart.tsx (COMPLETE)

```typescript
'use client'

import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts'
import { ResponsiveChart } from './ResponsiveChart'
import { CHART_COLORS } from './ChartTooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface RetrievalModeChartProps {
  modeA: number   // 0–1 fraction
  modeB: number
  modeC: number
  cacheHitRate: number
  isLoading?: boolean
  className?: string
}

/**
 * Retrieval mode breakdown.
 * Mode A = CRAG-corrected answer (best)
 * Mode B = Standard retrieval answer
 * Mode C = Insufficient / escalated
 * Cache = Cached response (no retrieval needed)
 *
 * Design: Horizontal bar display (simpler than radial for 4 values)
 * Each bar is a percentage of total queries.
 */
export function RetrievalModeChart({
  modeA,
  modeB,
  modeC,
  cacheHitRate,
  isLoading,
  className,
}: RetrievalModeChartProps) {
  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-2.5 flex-1 rounded-full" />
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const modes = [
    {
      label: 'Mode A',
      sublabel: 'CRAG-corrected',
      value: modeA,
      color: CHART_COLORS.cyan,
    },
    {
      label: 'Mode B',
      sublabel: 'Standard',
      value: modeB,
      color: CHART_COLORS.blue,
    },
    {
      label: 'Mode C',
      sublabel: 'Insufficient',
      value: modeC,
      color: CHART_COLORS.red,
    },
    {
      label: 'Cache',
      sublabel: 'Hit',
      value: cacheHitRate,
      color: CHART_COLORS.purple,
    },
  ]

  return (
    <div className={cn('chart-card', className)}>
      <p className="chart-title">Retrieval mode breakdown</p>

      <div className="space-y-3 mt-2" role="list" aria-label="Retrieval mode percentages">
        {modes.map(({ label, sublabel, value, color }) => {
          const pct = Math.round(value * 100)
          return (
            <div
              key={label}
              className="flex items-center gap-3"
              role="listitem"
            >
              <div className="w-16 shrink-0">
                <p className="text-xs font-semibold text-text-primary">{label}</p>
                <p className="text-[10px] text-text-tertiary">{sublabel}</p>
              </div>

              <div
                className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${pct}%`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>

              <span
                className="text-xs font-semibold tabular-nums text-text-secondary w-8 text-right shrink-0"
              >
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## FILE 4: src/components/admin/GapEventsList.tsx (COMPLETE)

```typescript
'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface GapEvent {
  query_pattern: string
  module: string
  doc_category: string
  count_this_week: number
  severity: 'high' | 'medium' | 'low'
}

interface GapEventsListProps {
  events: GapEvent[]
  isLoading?: boolean
  maxItems?: number
  className?: string
}

const SEVERITY_DOT: Record<GapEvent['severity'], string> = {
  high:   'bg-danger',
  medium: 'bg-warning',
  low:    'bg-purple',
}

/**
 * Knowledge gap events list — shown on the admin dashboard.
 * Shows top N gap patterns with frequency and quick navigation.
 *
 * Full analysis is available on the Knowledge Gaps page.
 */
export function GapEventsList({
  events,
  isLoading,
  maxItems = 5,
  className,
}: GapEventsListProps) {
  if (isLoading) {
    return (
      <div className={cn('chart-card', className)}>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-t border-border-primary">
            <Skeleton className="w-2 h-2 rounded-full shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('chart-card flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p className="chart-title">Knowledge gap events</p>
        <Link
          href="/admin/knowledge-gaps"
          className={cn(
            'text-xs text-accent hover:text-accent-hover transition-colors',
            'flex items-center gap-1',
          )}
        >
          View all
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <p className="text-xs text-text-tertiary py-4 text-center">
          No recurring gap events this week
        </p>
      ) : (
        <div role="list" aria-label="Top knowledge gap events">
          {events.slice(0, maxItems).map((event, i) => (
            <Link
              key={i}
              href={`/admin/knowledge-gaps`}
              className={cn(
                'flex items-center gap-3 py-2.5',
                'border-t border-border-primary first:border-t-0',
                'hover:bg-bg-secondary -mx-4 px-4 transition-colors',
                'group',
              )}
              role="listitem"
            >
              {/* Severity dot */}
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  SEVERITY_DOT[event.severity],
                )}
                aria-hidden="true"
              />

              {/* Pattern text */}
              <span className="flex-1 text-sm text-text-primary truncate group-hover:text-accent transition-colors">
                {event.query_pattern}
              </span>

              {/* Module tag */}
              <span className="text-xs font-mono text-text-tertiary bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5 shrink-0">
                {event.module}
              </span>

              {/* Count */}
              <span className="text-xs text-text-tertiary tabular-nums shrink-0 w-20 text-right">
                {event.count_this_week} this week
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## FILE 5: src/app/(admin)/admin/dashboard/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <Skeleton className="h-3 w-40" />
            <div className="flex items-end gap-1.5 h-40">
              {[...Array(7)].map((_, j) => (
                <Skeleton key={j} className="flex-1" style={{ height: `${50 + j * 6}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="surface-card p-4 space-y-3">
          <Skeleton className="h-3 w-32" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
          ))}
        </div>
        <div className="surface-card p-4 col-span-2 space-y-2">
          <Skeleton className="h-3 w-40" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="w-2 h-2 rounded-full shrink-0" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

## FILE 6: src/app/(admin)/admin/dashboard/page.tsx (COMPLETE)

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { Upload, CheckSquare, Activity } from 'lucide-react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DashboardRefreshIndicator } from '@/components/admin/DashboardRefreshIndicator'
import { MetricCard, MetricCardGrid } from '@/components/admin/MetricCard'
import { ValidationScoreChart } from '@/components/admin/charts/ValidationScoreChart'
import { ConfidenceDistChart } from '@/components/admin/charts/ConfidenceDistChart'
import { RetrievalModeChart } from '@/components/admin/charts/RetrievalModeChart'
import { GapEventsList } from '@/components/admin/GapEventsList'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAdminMetrics } from '@/hooks/queries'
import { usePollingCountdown } from '@/hooks/usePollingCountdown'
import { cn } from '@/lib/utils'
import { TIMING } from '@/lib/constants'

/**
 * Admin Dashboard — the live quality command centre.
 *
 * Data source: useAdminMetrics() polling every 30 seconds.
 * All charts and metrics come from a single endpoint (/admin/metrics).
 * This keeps the dashboard to one API call.
 */
export default function AdminDashboardPage() {
  const router = useRouter()
  const { data: metrics, isLoading, dataUpdatedAt } = useAdminMetrics()

  return (
    <AdminPageWrapper>
      {/* Page header with refresh indicator */}
      <AdminPageHeader
        title="Dashboard"
        description="Live quality overview"
        actions={
          <DashboardRefreshIndicator
            dataUpdatedAt={dataUpdatedAt ?? Date.now()}
          />
        }
      />

      {/* ── Row 1: KPI metric cards ── */}
      <ErrorBoundary section="metrics">
        <MetricCardGrid>
          <MetricCard
            label="Queries today"
            value={metrics?.total_queries_today ?? 0}
            format="integer"
            color="white"
            isLoading={isLoading}
            animateCount
            trend={
              metrics
                ? {
                    value: 'Live count',
                    direction: 'neutral',
                  }
                : undefined
            }
          />
          <MetricCard
            label="Avg ValidationScore"
            value={metrics?.avg_validation_score ?? 0}
            format="score"
            color={
              !metrics
                ? 'white'
                : metrics.avg_validation_score >= 0.85
                ? 'green'
                : metrics.avg_validation_score >= 0.70
                ? 'amber'
                : 'red'
            }
            isLoading={isLoading}
            animateCount
            trend={
              metrics
                ? {
                    value: `${(metrics.green_badge_rate * 100).toFixed(0)}% green`,
                    direction: 'neutral',
                  }
                : undefined
            }
          />
          <MetricCard
            label="Green badge rate"
            value={metrics?.green_badge_rate ?? 0}
            format="percentage"
            color={
              !metrics ? 'white'
              : metrics.green_badge_rate >= 0.7 ? 'green'
              : metrics.green_badge_rate >= 0.5 ? 'amber'
              : 'red'
            }
            isLoading={isLoading}
            animateCount
            trend={
              metrics
                ? {
                    value: `${(metrics.cache_hit_rate * 100).toFixed(0)}% cache hit`,
                    direction: 'neutral',
                  }
                : undefined
            }
          />
          <MetricCard
            label="Open tickets"
            value={metrics?.open_tickets ?? 0}
            format="integer"
            color={
              !metrics ? 'white'
              : metrics.open_tickets === 0 ? 'green'
              : metrics.open_tickets <= 5 ? 'white'
              : 'amber'
            }
            isLoading={isLoading}
            animateCount
            trend={
              metrics?.open_tickets && metrics.open_tickets > 0
                ? {
                    value: 'Needs review',
                    direction: 'up',
                    upIsPositive: false,
                  }
                : undefined
            }
          />
        </MetricCardGrid>
      </ErrorBoundary>

      {/* ── Row 2: Charts ── */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <ErrorBoundary section="ValidationScore chart">
          <ValidationScoreChart
            data={metrics?.validation_score_7d ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>

        <ErrorBoundary section="confidence distribution chart">
          <ConfidenceDistChart
            data={metrics?.confidence_dist_7d ?? []}
            isLoading={isLoading}
          />
        </ErrorBoundary>
      </div>

      {/* ── Row 3: Retrieval mode + Gap events ── */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        <ErrorBoundary section="retrieval mode chart">
          <RetrievalModeChart
            modeA={metrics?.mode_a_rate ?? 0}
            modeB={metrics?.mode_b_rate ?? 0}
            modeC={metrics?.mode_c_rate ?? 0}
            cacheHitRate={metrics?.cache_hit_rate ?? 0}
            isLoading={isLoading}
          />
        </ErrorBoundary>

        <div className="col-span-2">
          <ErrorBoundary section="gap events list">
            <GapEventsList
              events={metrics?.gap_events ?? []}
              isLoading={isLoading}
              maxItems={5}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── Review queue alert banner ── */}
      {!isLoading && metrics && metrics.open_tickets > 0 && (
        <div
          className={cn(
            'mt-3 flex items-center justify-between',
            'bg-warning-bg border border-warning-border rounded-xl px-4 py-3',
          )}
          role="alert"
        >
          <div className="flex items-center gap-2.5">
            <CheckSquare className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
            <span className="text-sm text-warning-text font-medium">
              {metrics.open_tickets} ticket{metrics.open_tickets > 1 ? 's' : ''} need
              {metrics.open_tickets === 1 ? 's' : ''} review
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin/review-queue')}
            className="border-warning-border text-warning-text hover:bg-warning-bg"
          >
            Review now
          </Button>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="mt-4 flex items-center gap-3">
        <p className="text-xs text-text-tertiary">Quick actions:</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/admin/documents')}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload document
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/admin/system-health')}
        >
          <Activity className="w-3.5 h-3.5" />
          System health
        </Button>
      </div>
    </AdminPageWrapper>
  )
}
```

---

## CHART DATA SHAPE — MOCK DATA FOR DEVELOPMENT

When the backend endpoint is not yet available, use this mock data to test chart rendering:

```typescript
// In page.tsx, replace useAdminMetrics() with mock data during development:
const MOCK_METRICS = {
  total_queries_today: 247,
  avg_validation_score: 0.841,
  green_badge_rate: 0.71,
  amber_badge_rate: 0.22,
  none_badge_rate: 0.07,
  open_tickets: 5,
  cache_hit_rate: 0.34,
  crag_insufficient_rate: 0.07,
  mode_a_rate: 0.15,
  mode_b_rate: 0.51,
  mode_c_rate: 0.07,
  last_updated_at: new Date().toISOString(),
  validation_score_7d: [
    { date: 'Mon', score: 0.797 },
    { date: 'Tue', score: 0.812 },
    { date: 'Wed', score: 0.798 },
    { date: 'Thu', score: 0.831 },
    { date: 'Fri', score: 0.849 },
    { date: 'Sat', score: 0.837 },
    { date: 'Sun', score: 0.841 },
  ],
  confidence_dist_7d: [
    { date: 'Mon', green: 68, amber: 24, none: 8 },
    { date: 'Tue', green: 70, amber: 22, none: 8 },
    { date: 'Wed', green: 67, amber: 25, none: 8 },
    { date: 'Thu', green: 72, amber: 21, none: 7 },
    { date: 'Fri', green: 74, amber: 20, none: 6 },
    { date: 'Sat', green: 71, amber: 22, none: 7 },
    { date: 'Sun', green: 71, amber: 22, none: 7 },
  ],
  gap_events: [
    { query_pattern: 'VL150 delivery creation error', module: 'SD', doc_category: 'SD-ERR', count_this_week: 23, severity: 'high' as const },
    { query_pattern: 'F5201 billing account determination', module: 'FI', doc_category: 'FI-ERR', count_this_week: 11, severity: 'medium' as const },
    { query_pattern: 'YDSA scheduling agreement creation', module: 'SD', doc_category: 'SD-PROC', count_this_week: 8, severity: 'medium' as const },
    { query_pattern: 'Current FI posting period', module: 'FI', doc_category: 'FI-CFG', count_this_week: 6, severity: 'low' as const },
    { query_pattern: 'MM60 backflush error resolution', module: 'MM', doc_category: 'MM-ERR', count_this_week: 5, severity: 'low' as const },
  ],
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Dashboard loads with correct layout
# → http://localhost:3000/admin/dashboard (must be it-admin)
# → Dark background, 4 metric cards, 2 charts, bottom row

# Step 2: Metric card animation
# → Refresh the page
# → Numbers should count up from 0 on first mount
# → Green color: avg score card (if score >= 0.85)

# Step 3: Charts render correctly
# → ValidationScore chart: area with cyan fill, 7 day points visible
# → Confidence chart: stacked bars green/amber/gray
# → Retrieval mode: 4 horizontal progress bars with percentages

# Step 4: 30-second polling
# → Open Network tab
# → GET /api/proxy/admin/metrics fires on load
# → Fires again exactly 30 seconds later
# → DashboardRefreshIndicator shows countdown and resets on refetch

# Step 5: Gap events list
# → Events listed with severity dots (red/amber/purple)
# → "View all" link navigates to /admin/knowledge-gaps
# → Clicking a row also navigates to knowledge gaps

# Step 6: Review queue alert
# → If open_tickets > 0: amber banner shows at bottom
# → "Review now" button navigates to /admin/review-queue

# Step 7: Error boundaries
# → If a chart throws an error (bad data), ErrorBoundary shows retry UI
# → Other sections remain visible

# Step 8: Loading skeleton
# → Navigating away and back shows loading.tsx skeleton first
# → Skeleton matches the live layout (4 cols, 2 cols, 3 cols)

# Step 9: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F10: Admin dashboard — MetricCardGrid, ValidationScoreChart, ConfidenceDistChart, RetrievalModeChart, GapEventsList, 30s polling"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F10 (Part 2)*
