# FRONTEND_24: MICRO-INTERACTIONS
## Hover, Focus, Timing, Loading States and Interactive Feedback Patterns
## Session F16 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F16 Part 2: Micro-interaction patterns.
Run after FRONTEND_23_FRAMER_MOTION in the same session.

**This document provides patterns and implementations for:**
1. Interactive state feedback (hover, active, focus)
2. Loading state hierarchy
3. Count-up number animation for MetricCard
4. Streaming cursor blink
5. Status dot pulse
6. Skeleton shimmer
7. Typing indicator
8. The complete timing constant reference

**Most patterns are CSS/Tailwind and already applied in earlier component docs.**
This document consolidates them for reference and fills in the two missing implementations:
`useCountUp` hook and the complete `MetricCard` count-up wiring.

---

## TIMING SYSTEM REFERENCE

All durations come from `--duration-*` CSS variables (set in `globals.css`, FRONTEND_01).
Tailwind classes use these via `duration-[var(--duration-fast)]` etc.

```
--duration-fast:   100ms  → instant feedback (hover, button press)
--duration-normal: 150ms  → standard transitions (color, border, bg)
--duration-slow:   250ms  → layout changes, panel expansion
```

### When to use each

| Duration | Use for |
|----------|---------|
| `fast` (100ms) | Button press scale, link hover color, checkbox check |
| `normal` (150ms) | Background color, border color, text color, opacity |
| `slow` (250ms) | Panel collapse/expand, sidebar width, card shadow lift |

**Never go above 300ms for interactive feedback** — anything longer feels sluggish
in a dense admin interface.

---

## INTERACTIVE STATE PATTERNS

All interactive states are defined in `globals.css` via `@layer components`.
The patterns below explain the intent and show how to apply them consistently.

### 1. Button states

```css
/* Defined in globals.css — reproduced here for reference */
.btn-primary {
  @apply bg-accent text-white;
  @apply hover:bg-accent-hover active:scale-[0.97];
  @apply transition-all duration-[var(--duration-fast)];
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus;
}
```

The `active:scale-[0.97]` gives physical press feedback without being jarring.
Never use `active:scale-95` (too dramatic for a professional interface).

### 2. Card hover lift

```css
.surface-card {
  @apply bg-bg-card border border-border-primary rounded-xl;
  @apply transition-shadow duration-[var(--duration-slow)];
}

/* Applied via hover class on interactive cards: */
.surface-card-interactive {
  @apply surface-card;
  @apply hover:shadow-md hover:-translate-y-px;
  @apply cursor-pointer transition-all duration-[var(--duration-slow)];
}
```

Use `hover:-translate-y-px` (1px lift) + shadow increase.
Never use `hover:-translate-y-1` (4px) — too dramatic for a dense UI.

### 3. Nav item active state

```css
.nav-item {
  /* Base */
  @apply flex items-center gap-3 px-4 h-9 rounded-lg;
  @apply text-sm font-medium text-text-secondary;
  @apply transition-colors duration-[var(--duration-normal)];
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus;

  /* Hover */
  @apply hover:bg-bg-secondary hover:text-text-primary;
}

.nav-item.active {
  @apply bg-bg-secondary text-text-primary;
  @apply border-l-2 border-l-accent;
  @apply pl-[calc(1rem-2px)]; /* compensate for border width */
}
```

### 4. Input focus state

```css
input, textarea, select {
  @apply transition-colors duration-[var(--duration-normal)];
  @apply focus:outline-none focus:ring-1 focus:ring-border-focus focus:border-border-focus;
}
```

Focus ring uses `focus:ring-1` (not `ring-2`) for inputs — the border change + ring-1
is sufficient without being heavy.

---

## COUNT-UP ANIMATION — useCountUp hook

Used in MetricCard to animate numbers on first mount. Gives the dashboard a
"data loading in" feel that communicates freshness.

### FILE: src/hooks/useCountUp.ts (COMPLETE)

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

interface UseCountUpOptions {
  target: number
  duration?: number   // ms — how long the count-up takes
  decimals?: number   // number of decimal places to show
  enabled?: boolean   // set false to skip animation
}

/**
 * Animates a number from 0 (or a previous value) up to `target`.
 * Respects prefers-reduced-motion — returns the target immediately if set.
 *
 * @example
 * const displayValue = useCountUp({ target: 247, duration: 800 })
 * // Renders: 0 → 1 → 5 → 23 → 247 over 800ms using easeOut
 *
 * @example with decimals:
 * const score = useCountUp({ target: 0.841, duration: 600, decimals: 3 })
 * // Renders: "0.000" → ... → "0.841"
 */
export function useCountUp({
  target,
  duration = 700,
  decimals = 0,
  enabled = true,
}: UseCountUpOptions): string {
  const reducedMotion = usePrefersReducedMotion()
  const [current, setCurrent] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const rafRef = useRef<number>()
  const prevTargetRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled || reducedMotion) {
      setCurrent(target)
      return
    }

    const startValue = prevTargetRef.current
    const diff = target - startValue
    prevTargetRef.current = target

    if (diff === 0) return

    startTimeRef.current = null

    function tick(now: number) {
      if (!startTimeRef.current) startTimeRef.current = now
      const elapsed = now - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(startValue + diff * eased)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setCurrent(target)
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, enabled, reducedMotion])

  return current.toFixed(decimals)
}
```

### MetricCard integration (how to wire useCountUp)

```typescript
// In MetricCard.tsx — add the format-specific rendering:

function MetricValue({
  value,
  format,
  animateCount,
}: {
  value: number
  format: 'integer' | 'percentage' | 'score'
  animateCount: boolean
}) {
  const decimals = format === 'integer' ? 0 : format === 'percentage' ? 1 : 3
  const displayValue = useCountUp({
    target: value,
    duration: 700,
    decimals,
    enabled: animateCount,
  })

  if (format === 'percentage') return <>{displayValue}%</>
  if (format === 'score')      return <>{displayValue}</>
  return <>{parseInt(displayValue).toLocaleString('en-IN')}</>
}
```

---

## STREAMING CURSOR

The blinking text cursor shown at the end of AI streaming content.
Already defined as a component in FRONTEND_08 (`StreamingCursor.tsx`),
but the CSS animation is documented here for completeness.

```css
/* In globals.css @layer components: */
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background-color: var(--color-accent);
  border-radius: 1px;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 800ms ease-in-out infinite;
}

/* Disabled when prefers-reduced-motion: */
@media (prefers-reduced-motion: reduce) {
  .streaming-cursor { animation: none; opacity: 1; }
}
```

---

## STATUS DOT PULSE

The pulsing animation on "healthy" service tiles and "connected" WebSocket indicators.
Defined in `globals.css` and applied via `animate-status-pulse`.

```css
/* In globals.css: */
@keyframes status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(0.85); }
}

.animate-status-pulse {
  animation: status-pulse 2s ease-in-out infinite;
}

/* Static on reduced motion: */
@media (prefers-reduced-motion: reduce) {
  .animate-status-pulse { animation: none; }
}
```

Usage — in StatusDot and ServiceTile:
```typescript
<span
  className={cn(
    'w-2 h-2 rounded-full bg-success',
    status === 'online' && 'animate-status-pulse',  // only pulse when active
  )}
/>
```

**Rule:** Only pulse when status is actively GOOD (connected, healthy). A pulsing
red dot is anxious; a static red dot is a clear error state. Never pulse danger/warning dots.

---

## LOADING STATE HIERARCHY

Different loading contexts require different patterns. Use the right one:

### 1. Page-level loading → `loading.tsx`

Every admin page has a `loading.tsx` using `<Skeleton />` components.
Skeletons match the layout of the real page (same columns, widths, heights).

```
Rule: loading.tsx skeleton should look like a blurred screenshot of the page.
```

### 2. Section loading → `isLoading` prop on components

DataTable, MetricCard, charts all accept `isLoading` and render their own skeletons.
The page renders immediately; sections show their own loading states.

```typescript
// Good pattern in page.tsx:
const { data, isLoading } = useAdminDocuments()
return (
  <AdminPageWrapper>
    <AdminPageHeader ... />
    {/* Table renders even while loading — shows skeleton rows */}
    <DataTable data={data ?? []} isLoading={isLoading} ... />
  </AdminPageWrapper>
)
```

### 3. Button/action loading → `loading` prop on Button

```typescript
<Button loading={deprecate.isPending} onClick={handleDeprecate}>
  Deprecate
</Button>
```

The `loading` prop shows a spinner inside the button and disables it.
**Never use a separate spinner next to a button** — put it inside the button.

### 4. Inline loading → `<Spinner />` component

For loading states inside a section that doesn't have its own loading indicator:

```typescript
// Example: sessions loading in topbar
{isFetching && <Spinner size="xs" className="ml-2" label="Refreshing..." />}
```

Use `isFetching` (not `isLoading`) to show background refetch without hiding content.

### 5. Full-screen loading → `<LoadingScreen />`

Only used in layout.tsx while auth initializes. Should never appear after initial load.

---

## FOCUS MANAGEMENT PATTERNS

### Focus trap for modals

Dialogs (shadcn Dialog component) handle focus trapping via Radix UI automatically.
For custom modal-like components (CommandPalette, Drawer), Radix also handles it.

**When to manually manage focus:**
- After a mutation completes and a new UI element should receive focus
- When opening a Drawer, focus the first interactive element inside

```typescript
// In ReviewItemDetail.tsx — after item advances:
useEffect(() => {
  textareaRef.current?.focus()
}, [item?.id])  // re-focus textarea when item changes
```

### Focus ring visibility

Focus rings are ONLY visible for keyboard navigation (`:focus-visible`, not `:focus`).
The design system applies `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus`
to all interactive elements.

```
Rule: Never use focus: alone for visible rings. Always use focus-visible:
```

---

## HOVER INTERACTION SUMMARY TABLE

| Element | Hover effect | Transition |
|---------|-------------|------------|
| Button (outline) | border-color → border-secondary, text → primary | 100ms |
| Button (ghost) | bg-bg-secondary | 100ms |
| Nav item | bg-bg-secondary, text → primary | 150ms |
| Session card | bg-bg-card, border | 150ms |
| DataTable row | bg-bg-secondary | 150ms |
| Kanban card | shadow-md | 150ms |
| Service tile | shadow-md, scale 1.02 | 150ms |
| History session card | shadow-md, -translate-y-px | 250ms |
| Link | text → accent | 100ms |
| Audit trail row | bg-bg-secondary, text → accent | 150ms |

---

## VERIFICATION CHECKLIST

```bash
# Step 1: Count-up animation
# → Load /admin/dashboard
# → Metric cards should count from 0 to their values over ~700ms
# → Enable "Reduce motion" → values appear instantly

# Step 2: Streaming cursor
# → Send a chat message
# → During streaming: blinking cursor appears at end of text
# → After completion: cursor disappears

# Step 3: Status pulse
# → System health page → healthy service tiles have pulsing green dot
# → Degraded/unhealthy tiles have STATIC colored dot (no pulse)

# Step 4: Button press feedback
# → Click any primary button
# → Should see brief scale-down (0.97) then spring back

# Step 5: Card hover lift
# → Hover over a history session card
# → Should lift 1px + shadow increases
# → Hover over a kanban card → shadow increases

# Step 6: Input focus
# → Click into any input
# → Border changes to accent + ring-1 appears
# → Should be focus-visible only — tabbing triggers ring, mouse click does not

# Step 7: Loading state hierarchy
# → Navigate to /admin/documents
# → loading.tsx skeleton should appear first (matching layout)
# → Then real content replaces skeleton
# → While background refetch: small spinner in header, content stays

npx tsc --noEmit
```

---

## COMMIT

```bash
git add -A
git commit -m "F16: Micro-interactions — useCountUp, animation patterns, focus management, loading state hierarchy"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F16 (Part 2)*
