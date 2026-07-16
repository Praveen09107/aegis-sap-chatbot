# FRONTEND_23: FRAMER MOTION
## Central Animation Variants Library and Component Animation Patterns
## Session F16 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F16: Framer Motion animation system.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/lib/
└── animations.ts          ← Central animation variants — import from here everywhere

src/components/shared/
└── PageTransition.tsx      ← Route change animation wrapper (optional, see below)
```

**Rule:** All `motion.*` usage across the app imports its variants from `src/lib/animations.ts`.
No inline variant objects — this ensures visual consistency and easy global adjustments.

---

## ANIMATION PHILOSOPHY

AEGIS targets a "Precision Console" aesthetic: animations must feel **swift and purposeful**,
never decorative. Every animation serves a functional purpose:

| Purpose | Duration | Easing |
|---------|----------|--------|
| Enter/appear | 150–200ms | ease-out (content arrives quickly) |
| Exit/dismiss | 100–150ms | ease-in (content leaves without ceremony) |
| Layout shift | 250–300ms | cubic-bezier(0.16, 1, 0.3, 1) (spring-like) |
| Expand/collapse | 200–250ms | cubic-bezier(0.16, 1, 0.3, 1) |

These map exactly to the `--duration-*` CSS variables in the design system:
```
--duration-fast:   100ms
--duration-normal: 150ms
--duration-slow:   250ms
```

**Reduced motion:** Every animated component must respect `prefers-reduced-motion`.
Use the `usePrefersReducedMotion()` hook (FRONTEND_05) to conditionally remove transforms.
When reduced motion is active: opacity transitions only (no translate/scale).

---

## FILE 1: src/lib/animations.ts (COMPLETE)

```typescript
/**
 * Central Framer Motion variants for AEGIS.
 * All motion components import from here — no inline variant definitions.
 *
 * Usage:
 *   import { FADE_UP, SLIDE_IN_RIGHT, CONTAINER_STAGGER } from '@/lib/animations'
 *   <motion.div variants={FADE_UP} initial="hidden" animate="visible" exit="exit" />
 */

import type { Variants, Transition } from 'framer-motion'

// ── Shared transitions ────────────────────────────────────────

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
}

export const EASE_OUT_EXPO: Transition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
}

export const EASE_IN_OUT: Transition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
}

// ── Basic entrance variants ────────────────────────────────────

/** Standard fade-in — use for tooltips, popovers, small UI elements */
export const FADE_IN: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15, ease: 'easeOut' } },
  exit:    { opacity: 0, transition: { duration: 0.1,  ease: 'easeIn'  } },
}

/** Fade + slide up — use for chat messages, cards, modals entering */
export const FADE_UP: Variants = {
  hidden:  { opacity: 0, y: 8  },
  visible: { opacity: 1, y: 0, transition: EASE_OUT_EXPO },
  exit:    { opacity: 0, y: 4, transition: { duration: 0.1, ease: 'easeIn' } },
}

/** Fade + slide down — use for dropdowns, context menus */
export const FADE_DOWN: Variants = {
  hidden:  { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0,  transition: EASE_OUT_EXPO },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.1, ease: 'easeIn' } },
}

/** Slide in from right — use for drawers, detail panels */
export const SLIDE_IN_RIGHT: Variants = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0,  transition: EASE_OUT_EXPO },
  exit:    { opacity: 0, x: 16, transition: { duration: 0.15, ease: 'easeIn' } },
}

/** Slide in from left — use for sidebar items, back navigation */
export const SLIDE_IN_LEFT: Variants = {
  hidden:  { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0,   transition: EASE_OUT_EXPO },
  exit:    { opacity: 0, x: -16, transition: { duration: 0.15, ease: 'easeIn' } },
}

/** Scale + fade — use for modals, command palette, badges */
export const SCALE_IN: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1,    transition: EASE_OUT_EXPO },
  exit:    { opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: 'easeIn' } },
}

/** Expand from top — use for notifications, banners, alert bars */
export const EXPAND_DOWN: Variants = {
  hidden:  { opacity: 0, height: 0, overflow: 'hidden' },
  visible: { opacity: 1, height: 'auto', transition: { ...EASE_OUT_EXPO, duration: 0.2 } },
  exit:    { opacity: 0, height: 0, transition: { duration: 0.15, ease: 'easeIn' } },
}

/** Bulk action bar slide-up from bottom */
export const SLIDE_UP_FROM_BOTTOM: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0,  transition: SPRING_SNAPPY },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.15, ease: 'easeIn' } },
}

// ── Page transitions ──────────────────────────────────────────

/**
 * Soft page transition — used by the Next.js layout wrappers.
 * Subtle: just opacity + tiny vertical offset. Admin portal uses this.
 */
export const PAGE_TRANSITION: Variants = {
  hidden:  { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0,       transition: { duration: 0.1, ease: 'easeIn' } },
}

// ── Stagger containers ────────────────────────────────────────

/**
 * Container that staggers children animation by 40ms.
 * Child components must also have a variants prop.
 *
 * @example
 * <motion.div variants={CONTAINER_STAGGER} initial="hidden" animate="visible">
 *   {items.map(item => (
 *     <motion.div key={item.id} variants={FADE_UP}>{item.label}</motion.div>
 *   ))}
 * </motion.div>
 */
export const CONTAINER_STAGGER: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
}

/** Tighter stagger for dense lists (4 or more items) */
export const CONTAINER_STAGGER_TIGHT: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.01,
    },
  },
}

// ── Onboarding step transitions ───────────────────────────────

/**
 * Direction-aware slide for onboarding step transitions.
 * Pass `custom={direction}` where direction is +1 (forward) or -1 (back).
 *
 * @example
 * const direction = useRef(1)
 * <AnimatePresence mode="wait" custom={direction.current}>
 *   <motion.div
 *     key={stepIndex}
 *     variants={ONBOARDING_STEP}
 *     custom={direction.current}
 *     initial="enter"
 *     animate="center"
 *     exit="exit"
 *   />
 * </AnimatePresence>
 */
export const ONBOARDING_STEP: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  }),
}

// ── Chat-specific variants ────────────────────────────────────

/**
 * Chat message bubble entry.
 * User bubble slides from right; AI bubble slides from left.
 * Pass `custom="user"` or `custom="assistant"` to the motion element.
 */
export const CHAT_MESSAGE: Variants = {
  hidden: (role: string) => ({
    opacity: 0,
    x: role === 'user' ? 12 : -12,
    y: 4,
  }),
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
}

/**
 * Streaming progress stage transition — used in StreamingProgress component.
 * Fades the stage label in as each stage changes.
 */
export const STREAMING_STAGE: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0,           transition: { duration: 0.1, ease: 'easeIn'  } },
}

// ── Admin-specific variants ───────────────────────────────────

/** Kanban card while being dragged (rotation handled by DragOverlay) */
export const KANBAN_DRAG_OVERLAY: Variants = {
  hidden:  { rotate: 0,   scale: 1    },
  visible: { rotate: 2.5, scale: 1.03, transition: SPRING_SNAPPY },
}

/**
 * Gap card sample query expansion.
 * Applied to the `<motion.ul>` containing sample queries.
 * (Height animation — needs `overflow: hidden` on parent)
 */
export const GAP_EXPAND: Variants = {
  hidden:  { height: 0, opacity: 0 },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
}

// ── Notification / toast variants ─────────────────────────────

/** Toast notification entry/exit — slides in from right, slides out to right */
export const TOAST_SLIDE: Variants = {
  hidden:  { opacity: 0, x: 40,  scale: 0.96 },
  visible: { opacity: 1, x: 0,   scale: 1,    transition: SPRING_SNAPPY },
  exit:    { opacity: 0, x: 32,  scale: 0.96, transition: { duration: 0.15 } },
}

// ── Loading skeleton pulse ─────────────────────────────────────

/**
 * Shimmer animation data for Framer Motion skeleton elements.
 * Used when shadcn's Skeleton component is not sufficient
 * (e.g., custom chart placeholder shapes).
 */
export const SKELETON_PULSE = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
}
```

---

## FILE 2: src/components/shared/PageTransition.tsx (COMPLETE)

```typescript
'use client'

import { motion } from 'framer-motion'
import { PAGE_TRANSITION } from '@/lib/animations'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

interface PageTransitionProps {
  children: React.ReactNode
  /** Key should match the route for AnimatePresence to detect changes */
  layoutKey?: string
}

/**
 * Wraps page content in a subtle entrance animation.
 * Use inside admin page.tsx files if you want per-page transitions.
 *
 * NOTE: This component is OPTIONAL. Most admin pages look fine without
 * explicit page-level transitions since the content loads progressively
 * via Suspense + loading.tsx. Only add it where the page content is
 * rendered fully synchronously.
 *
 * @example
 * // In a admin page.tsx that doesn't use Suspense:
 * export default function AdminXxxPage() {
 *   return (
 *     <PageTransition>
 *       <AdminPageWrapper>...</AdminPageWrapper>
 *     </PageTransition>
 *   )
 * }
 */
export function PageTransition({ children, layoutKey }: PageTransitionProps) {
  const reducedMotion = usePrefersReducedMotion()

  if (reducedMotion) return <>{children}</>

  return (
    <motion.div
      key={layoutKey}
      variants={PAGE_TRANSITION}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}
```

---

## HOW TO APPLY VARIANTS — COMPONENT-LEVEL REFERENCE

The table below maps each AEGIS UI element to the variant it should use.
Agents implementing any component should consult this table first.

### Employee portal

| Component | Variant | Notes |
|-----------|---------|-------|
| `UserBubble` | `CHAT_MESSAGE` with `custom="user"` | Slides from right |
| `AIResponseBubble` | `CHAT_MESSAGE` with `custom="assistant"` | Slides from left |
| `RelatedQuestions` chips | `CONTAINER_STAGGER` + `FADE_UP` per chip | Stagger after response completes |
| `StreamingProgress` stage labels | `STREAMING_STAGE` inside `AnimatePresence mode="wait"` | Stage text fades as stage changes |
| `ScreenshotDropZone` overlay | `FADE_IN` | Quick appear on drag-over |
| `ComposeBar` screenshot thumbnail | `SCALE_IN` | Thumbnail appears when screenshot selected |
| `OnboardingModal` step content | `ONBOARDING_STEP` with custom direction | Direction-aware slide |
| `OnboardingProgress` active dot | CSS transition only (width) | Keep in CSS, not Framer |

### Admin portal

| Component | Variant | Notes |
|-----------|---------|-------|
| `BulkActionBar` | `SLIDE_UP_FROM_BOTTOM` | Slides up from bottom when rows selected |
| `GapCard` sample queries | `GAP_EXPAND` | Height expansion on toggle |
| `KanbanCard` DragOverlay | `KANBAN_DRAG_OVERLAY` | Slight rotation on lift |
| `HistorySessionCard` | `FADE_UP` with `delay: index * 0.03` | Stagger on list load |
| `AdminNav` new badge | `SCALE_IN` | Pops when count changes |
| `DashboardRefreshIndicator` icon | CSS `animate-spin` | Keep in CSS for performance |

### Shared components

| Component | Variant | Notes |
|-----------|---------|-------|
| `CommandPalette` | `SCALE_IN` for the dialog itself | Backdrop uses `FADE_IN` |
| `Drawer` | `SLIDE_IN_RIGHT` | Sheet slides from right |
| `ConfirmDialog` | `SCALE_IN` | Small dialog appears |
| `OfflineBanner` | `EXPAND_DOWN` | Expands from top |
| `Toast` (sonner) | Handled by sonner — do NOT override | sonner has its own animation |
| `Skeleton` elements | shadcn's default pulse CSS — do NOT add Framer | CPU-efficient |

---

## ANIMATEPRESENCE PATTERNS

Always wrap conditionally rendered components in `<AnimatePresence>`.
Forgetting AnimatePresence = exit animations never fire.

### Pattern 1: Single element toggle

```typescript
import { AnimatePresence, motion } from 'framer-motion'
import { FADE_UP } from '@/lib/animations'

// In a component that conditionally shows a panel:
<AnimatePresence>
  {showPanel && (
    <motion.div
      key="panel"            // key is REQUIRED — must be stable
      variants={FADE_UP}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* panel content */}
    </motion.div>
  )}
</AnimatePresence>
```

### Pattern 2: List of items (stagger)

```typescript
import { motion } from 'framer-motion'
import { CONTAINER_STAGGER, FADE_UP } from '@/lib/animations'

// In a list that loads or filters:
<motion.ul
  variants={CONTAINER_STAGGER}
  initial="hidden"
  animate="visible"
>
  {items.map((item) => (
    <motion.li key={item.id} variants={FADE_UP}>
      {/* item content */}
    </motion.li>
  ))}
</motion.ul>
```

### Pattern 3: Tab/step content swap (mode="wait")

```typescript
// Replace one piece of content with another (like timeline/table toggle):
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}          // changes key to trigger exit → enter
    variants={FADE_IN}
    initial="hidden"
    animate="visible"
    exit="exit"
  >
    {activeTab === 'timeline' ? <AuditTimeline /> : <DataTable />}
  </motion.div>
</AnimatePresence>
```

### Pattern 4: Reduced motion fallback

```typescript
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { motion } from 'framer-motion'
import { FADE_UP } from '@/lib/animations'

function AnimatedCard({ children }: { children: React.ReactNode }) {
  const reducedMotion = usePrefersReducedMotion()

  // Skip all transforms — just render children
  if (reducedMotion) return <div>{children}</div>

  return (
    <motion.div variants={FADE_UP} initial="hidden" animate="visible">
      {children}
    </motion.div>
  )
}
```

---

## PERFORMANCE RULES

1. **Never animate `width` or `height` without `layout`** — use `layout` prop for layout changes
2. **Prefer `opacity` and `transform` only** — these are GPU-composited and never trigger layout
3. **Use `will-change: transform`** cautiously — only on elements that animate repeatedly
4. **Skeleton loading** — use CSS `animate-pulse` (Tailwind), NOT Framer Motion. Framer Motion adds JS overhead for a visual-only effect
5. **Charts (Recharts)** — handle their own animations internally. Do NOT wrap Recharts components in Framer Motion
6. **100+ list items** — disable `CONTAINER_STAGGER` for long lists (stagger delay becomes too long). Only stagger lists ≤ 12 items
7. **Drag and drop** — dnd-kit manages its own transform. Never apply Framer Motion variants to elements using `useSortable`

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Chat message animation
# → Send a message → user bubble slides in from right
# → AI response bubble slides in from left as streaming starts

# Step 2: Reduced motion
# → Enable "Reduce motion" in OS settings
# → Send another message → bubbles appear without sliding
# → Only opacity transition

# Step 3: BulkActionBar
# → Select rows in Documents page
# → Action bar slides up from bottom with spring motion

# Step 4: Onboarding step transitions
# → Open onboarding modal, click Next
# → Content slides left (forward)
# → Click Back → content slides right (backward)

# Step 5: OfflineBanner
# → Simulate offline (DevTools → Network → Offline)
# → Banner expands smoothly from top
# → Go back online → banner collapses

# Step 6: CommandPalette
# → Press ⌘K → palette scales in from slightly smaller
# → Press Escape → scales out

npx tsc --noEmit  # Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F16: Framer Motion — animations.ts variants library, component animation reference, AnimatePresence patterns"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F16*
