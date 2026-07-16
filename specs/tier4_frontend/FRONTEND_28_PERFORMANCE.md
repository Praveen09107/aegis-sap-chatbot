# FRONTEND_28: PERFORMANCE
## Bundle Splitting, Dynamic Imports, Virtualization, Core Web Vitals
## Session F18 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F18 Part 2: Performance optimisation.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates/updates:**
```
src/components/admin/charts/
└── index.ts           ← Barrel with lazy-exported chart components

src/app/(employee)/
└── layout.tsx         ← Add dynamic import for OnboardingModal

src/app/(admin)/admin/tickets/
└── page.tsx           ← Add dynamic import for KanbanBoard

src/lib/
└── sessionExport.ts   ← Already dynamic — verify
```

---

## CORE WEB VITALS TARGETS

| Metric | Target | What it measures |
|--------|--------|-----------------|
| LCP (Largest Contentful Paint) | < 2.5s | Main content visible |
| FID / INP (Interaction to Next Paint) | < 200ms | Input responsiveness |
| CLS (Cumulative Layout Shift) | < 0.1 | Layout stability |
| FCP (First Contentful Paint) | < 1.8s | First pixel on screen |
| TTFB (Time to First Byte) | < 800ms | Server response |

AEGIS is desktop-only (≥1280px, Chrome/Firefox) — mobile LCP is not a concern.
The main CLS risk is async data loading causing layout shifts in MetricCard grids.
The main LCP concern is the admin dashboard chart area.

---

## BUNDLE SIZE STRATEGY

### Heavy dependencies and their sizes (approximate)

```
Recharts:        ~200KB gzipped  → Used only on admin pages
@dnd-kit:         ~28KB gzipped  → Used only on tickets page
framer-motion:    ~45KB gzipped  → Used everywhere (justified)
cmdk:             ~12KB gzipped  → Used everywhere (acceptable)
@react-pdf:       ~350KB gzipped → Used only for PDF export (MUST be dynamic)
date-fns:         ~15KB gzipped  → Tree-shaken well (acceptable)
```

### Target initial bundle sizes

```
Employee portal initial JS:   < 300KB gzipped
Admin portal initial JS:      < 350KB gzipped (more features)
Recharts chunk:               lazy-loaded, cached after first admin page visit
@dnd-kit chunk:               lazy-loaded, cached after first tickets page visit
@react-pdf chunk:             lazy-loaded only when export is triggered
```

---

## DYNAMIC IMPORTS — IMPLEMENTATION

### 1. Charts (Recharts) — admin pages only

Charts are used on dashboard, analytics, and health pages.
Load them lazily to keep the initial admin bundle light.

```typescript
// src/components/admin/charts/index.ts
// Replace direct imports with dynamic imports throughout admin pages:

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const ChartSkeleton = () => <Skeleton className="h-40 w-full rounded-xl" />

export const ValidationScoreChart = dynamic(
  () => import('./ValidationScoreChart').then(m => m.ValidationScoreChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const ConfidenceDistChart = dynamic(
  () => import('./ConfidenceDistChart').then(m => m.ConfidenceDistChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const RetrievalModeChart = dynamic(
  () => import('./RetrievalModeChart').then(m => m.RetrievalModeChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const QueryVolumeChart = dynamic(
  () => import('./QueryVolumeChart').then(m => m.QueryVolumeChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const CachePerformanceChart = dynamic(
  () => import('./CachePerformanceChart').then(m => m.CachePerformanceChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const TopModulesChart = dynamic(
  () => import('./TopModulesChart').then(m => m.TopModulesChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)
```

**Update all admin page imports** to use this barrel:
```typescript
// Before:
import { ValidationScoreChart } from '@/components/admin/charts/ValidationScoreChart'

// After:
import { ValidationScoreChart } from '@/components/admin/charts'
```

### 2. Kanban Board — tickets page only

```typescript
// In src/app/(admin)/admin/tickets/page.tsx:
import dynamic from 'next/dynamic'

// Replace static import:
// import { KanbanBoard } from '@/components/admin/KanbanBoard'

const KanbanBoardDynamic = dynamic(
  () => import('@/components/admin/KanbanBoard').then(m => ({ default: m.KanbanBoard })),
  {
    loading: () => (
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    ),
    ssr: false,  // dnd-kit requires browser APIs
  }
)
```

### 3. PDF Export — trigger-only

```typescript
// In src/lib/sessionExport.ts — already handles this:
// The @react-pdf/renderer is imported inside the export function,
// so it's only loaded when the user triggers an export.

// Verify this pattern is in place:
export async function exportSessionAsPDF(messages: ChatMessage[], topic: string) {
  // Dynamic import — only loads @react-pdf when called:
  const { pdf } = await import('@react-pdf/renderer')
  const { SessionDocument } = await import('@/components/pdf/SessionDocument')

  const blob = await pdf(<SessionDocument messages={messages} topic={topic} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `aegis-${topic.slice(0, 30).replace(/\s+/g, '-')}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
```

### 4. Onboarding Modal — employee portal

```typescript
// In src/app/(employee)/page.tsx:
// The OnboardingModal is only shown once per user. Load it lazily.

import dynamic from 'next/dynamic'

const OnboardingModal = dynamic(
  () => import('@/components/onboarding/OnboardingModal').then(m => m.OnboardingModal),
  { ssr: false }
  // No loading state — it only shows after 800ms delay anyway
)
```

---

## TANSTACK QUERY — CACHE STRATEGY FOR PERFORMANCE

Intelligent caching eliminates redundant network requests and prevents
layout shifts from loading states.

```typescript
// Cache strategy per query type:

// 1. Live data (dashboard metrics, system health):
//    staleTime: 0 → always refetch
//    gcTime: 60s → keep in memory between navigations
useQuery({ staleTime: 0, gcTime: 60_000, refetchInterval: 30_000 })

// 2. Admin content (documents, registry, config):
//    staleTime: 30s → don't refetch within 30s of last fetch
//    gcTime: 5min → cache stays for portal session
useQuery({ staleTime: 30_000, gcTime: 5 * 60_000 })

// 3. Analytics (expensive computation):
//    staleTime: 5min → let the cache serve stale data for 5 minutes
//    gcTime: 15min → keep long after navigation away
useQuery({ staleTime: 5 * 60_000, gcTime: 15 * 60_000 })

// 4. Sessions (user's own history):
//    staleTime: 30s → reasonable for personal data
//    placeholderData: keep previous → prevents layout shift on filter change
useQuery({ staleTime: 30_000, placeholderData: (prev) => prev })

// 5. Preferences:
//    staleTime: Infinity → never refetch unless manually invalidated
useQuery({ staleTime: Infinity, gcTime: Infinity })
```

### Prefetching on hover

For the most common navigation path (employee → history, admin dashboard → documents),
prefetch on link hover:

```typescript
// In AdminNav.tsx — prefetch on link hover:
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { api } from '@/lib/api'

function AdminNavItem({ href, label }: { href: string; label: string }) {
  const queryClient = useQueryClient()

  function handleMouseEnter() {
    if (href === '/admin/documents') {
      queryClient.prefetchQuery({
        queryKey: queryKeys.admin.documents(),
        queryFn: () => api.get('admin/documents'),
        staleTime: 30_000,
      })
    }
  }

  return (
    <Link href={href} onMouseEnter={handleMouseEnter} className="nav-item">
      {label}
    </Link>
  )
}
```

---

## SESSION LIST VIRTUALIZATION

If a user has many sessions (>100), the `SessionSidebar` and `HistoryPage`
will render many DOM nodes. Use windowing for the history page.

### When to apply virtualization

```
SessionSidebar (180px wide): max 50 visible items → virtualize if > 100 sessions
HistoryPage:                 50 items per page → pagination handles this (no virtualization needed)
DataTable:                   8–12 rows per page → pagination handles this
```

### TanStack Virtual for SessionSidebar

```typescript
// Add to SessionSidebar.tsx if sessions > 100:
// Install: already in package.json via @tanstack/react-virtual

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function VirtualizedSessionList({
  sessions,
  activeId,
  pinnedIds,
  onSelect,
}: {
  sessions: Session[]
  activeId: string | null
  pinnedIds: Set<string>
  onSelect: (id: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,  // estimated session card height in px
    overscan: 5,             // render 5 extra items outside view
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto scrollbar-hide">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const session = sessions[virtualItem.index]
          return (
            <div
              key={session.id}
              style={{
                position: 'absolute',
                top: virtualItem.start,
                left: 0,
                right: 0,
                height: virtualItem.size,
              }}
            >
              <SessionCard
                session={session}
                isActive={session.id === activeId}
                isPinned={pinnedIds.has(session.id)}
                onSelect={() => onSelect(session.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Use VirtualizedSessionList when sessions.length > 100:
function SessionSidebar({ sessions }: { sessions: Session[] }) {
  // ...existing state...
  const useVirtual = sortedFiltered.length > 100

  return (
    <aside ...>
      {/* header + search */}
      {useVirtual ? (
        <VirtualizedSessionList sessions={sortedFiltered} ... />
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* existing grouped rendering */}
        </div>
      )}
    </aside>
  )
}
```

---

## CLS PREVENTION — LAYOUT STABILITY

Cumulative Layout Shift occurs when content appears after the initial render
and pushes other content. Key patterns to prevent it:

### 1. Reserve space for async data

```typescript
// MetricCard — always renders at fixed height even while loading:
<div className="surface-card p-4 h-[104px] flex flex-col justify-between">
  {isLoading ? (
    <Skeleton className="h-8 w-20" />
  ) : (
    <span className="text-3xl font-bold">{value}</span>
  )}
</div>

// Rule: Always set explicit height on cards that load async data.
// h-[104px] is the MetricCard canonical height — do not change.
```

### 2. Charts: fixed height containers

```typescript
// All charts use fixed height in ResponsiveChart:
<ResponsiveContainer width="100%" height={160}>
  {/* Recharts content */}
</ResponsiveContainer>

// The chart-card div has fixed min-height:
.chart-card {
  @apply surface-card p-4;
  min-height: 220px;  /* prevents height jumping as chart loads */
}
```

### 3. TanStack Query placeholderData prevents shift on filter change

```typescript
// Without placeholderData: list disappears → reappears on filter change (CLS)
// With placeholderData: previous data shows during refetch (no shift)
const { data } = useSessions(filters, {
  placeholderData: (prev) => prev,
})
```

### 4. Image dimensions always specified

```typescript
// Next.js Image with explicit dimensions prevents CLS:
<Image src="/logo.svg" width={32} height={32} alt="Logo" />

// Never use Image without width/height in a layout-critical area.
```

---

## NEXT.JS APP ROUTER PERFORMANCE PATTERNS

### Server vs Client components

```
Default: all components are Server Components (zero JS sent to browser)
Add 'use client' only when needed:
  - useState, useEffect, event handlers → 'use client'
  - TanStack Query hooks → 'use client'
  - Framer Motion → 'use client'
  - next-themes useTheme → 'use client'

Keep as Server Components (no 'use client'):
  - loading.tsx → renders on server, no JS needed
  - Static layout wrappers → AdminPageWrapper, AdminPageHeader
  - Error page structure → but error.tsx must be 'use client'
```

### Route Segment Config

```typescript
// For admin pages that must always show fresh data (dashboard, health):
// Add to dashboard/page.tsx and system-health/page.tsx:
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

---

## BUNDLE ANALYSIS — HOW TO RUN

```bash
# Install bundle analyzer (dev dependency):
npm install --save-dev @next/bundle-analyzer

# next.config.js (already set up in FRONTEND_02):
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
module.exports = withBundleAnalyzer(nextConfig)

# Run analysis:
ANALYZE=true npm run build

# Opens two browser tabs:
# - Client bundles (what ships to the browser)
# - Server bundles (what runs on the server)

# Target: no single chunk > 200KB gzipped in the critical path
```

---

## VERIFICATION STEPS

```bash
# Step 1: Bundle size check
ANALYZE=true npm run build
# → Verify @react-pdf is NOT in the initial bundle
# → Verify recharts is in a separate chunk (not main)
# → Verify dnd-kit is only loaded on the tickets page chunk

# Step 2: Dynamic import loads on demand
# → Open /admin/dashboard → check Network tab
# → Charts chunk should load after initial render
# → Navigate to /admin/tickets → dnd-kit chunk loads then

# Step 3: PDF export loads lazily
# → Open /history → no @react-pdf in Network tab
# → Click Export PDF → @react-pdf chunk loads then
# → Second export: chunk already cached, no new request

# Step 4: CLS test
# → Open Chrome DevTools → Performance → Record
# → Navigate to /admin/dashboard
# → Check CLS score → should be < 0.1

# Step 5: Session list virtualization (if applicable)
# → With > 100 sessions, scroll the sidebar
# → DOM should show only ~15 session cards (not all 100+)
# → Scrolling should be smooth (no jank)

# Step 6: Lighthouse audit (production build)
npm run build && npm start
# → Run Lighthouse on http://localhost:3000/admin/dashboard
# → LCP < 2.5s, CLS < 0.1, INP < 200ms
```

---

## COMMIT

```bash
git add -A
git commit -m "F18: Performance — dynamic imports for charts/kanban/PDF, TanStack cache strategy, CLS prevention, virtualization"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F18 (Part 2)*
