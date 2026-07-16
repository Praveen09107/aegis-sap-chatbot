# FRONTEND_03: TAILWIND & GLOBALS SUPPLEMENTAL
## CSS Component Classes, Layout Templates, Dark Mode Patterns, Animation Reference
## Session F01 Implementation Guide (runs in same session as FRONTEND_01)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

This document is part of Session F01 — run after FRONTEND_01 sets up the token system.
It adds supplemental CSS patterns to `globals.css` and provides reference patterns
the agent uses when building every component across all 35 sessions.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session adds:**
- Additional `@layer components` entries to `src/app/globals.css`
- CSS Grid layout templates for three-panel and admin shell
- `@tailwindcss/typography` prose overrides for chat messages
- Dark mode coding patterns and common mistakes
- Complete animation class reference
- Recharts color integration patterns
- Component CSS pattern reference

---

## PART 1: @LAYER COMPONENTS — ADD TO globals.css

Append these entries inside the existing `@layer base` section, after the
custom properties but before the body style. Then add a new `@layer components` block.

```css
/* ─────────────────────────────────────────────────────────
   ADD TO @layer base IN globals.css (after :focus-visible block)
   ───────────────────────────────────────────────────────── */

/* Confidence aura borders — applied to AI response bubbles */
.aura-green    { border-left: 3px solid rgb(var(--color-success)); }
.aura-amber    { border-left: 3px solid rgb(var(--color-warning)); }
.aura-danger   { border-left: 3px solid rgb(var(--color-danger)); }
.aura-none     { border-left: 3px solid rgb(var(--color-border-primary)); }
.aura-streaming { border-left: 3px solid rgb(var(--color-border-secondary)); }

/* SAP entity chip base — applied to EntityChip component */
.chip-base {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
  font-family: var(--font-geist-mono), 'Consolas', monospace;
  letter-spacing: 0.02em;
  border: 1px solid;
  vertical-align: middle;
  white-space: nowrap;
}

/* ─────────────────────────────────────────────────────────
   NEW @layer components BLOCK — ADD TO END OF globals.css
   ───────────────────────────────────────────────────────── */

@layer components {

  /* ── Section label (UPPERCASE CAPS — used everywhere) ── */
  .section-label {
    @apply text-xs font-semibold text-text-tertiary uppercase tracking-[0.08em];
  }

  /* ── Card surfaces ── */
  .surface-card {
    @apply bg-bg-card border border-border-primary rounded-xl shadow-sm;
  }
  .surface-elevated {
    @apply bg-bg-card border border-border-primary rounded-xl shadow-md;
  }
  .surface-sunken {
    @apply bg-bg-sunken border border-border-primary rounded-lg;
  }

  /* ── SAP entity chip variants ── */
  .chip-error {
    @apply chip-base bg-danger-bg border-danger-border text-danger-text;
  }
  .chip-tcode {
    @apply chip-base bg-info-bg border-info-border text-info-text;
  }
  .chip-docnum {
    @apply chip-base bg-bg-tertiary border-border-primary text-text-secondary;
  }

  /* ── AI message prose content ── */
  /* Applied to the text container inside AIResponseBubble */
  .aegis-prose {
    @apply text-sm text-text-primary leading-relaxed;
  }
  .aegis-prose p {
    @apply mb-2 last:mb-0;
  }
  .aegis-prose strong {
    @apply font-semibold text-text-primary;
  }
  .aegis-prose ol {
    @apply list-decimal pl-5 space-y-1.5 mb-2;
  }
  .aegis-prose ul {
    @apply list-disc pl-5 space-y-1.5 mb-2;
  }
  .aegis-prose li {
    @apply text-text-primary;
  }
  .aegis-prose code {
    @apply font-mono text-xs bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5 text-text-primary;
  }
  .aegis-prose pre {
    @apply bg-bg-sunken border border-border-primary rounded-lg p-3 overflow-x-auto mb-2;
  }
  .aegis-prose pre code {
    @apply bg-transparent border-none p-0;
  }
  .aegis-prose h1, .aegis-prose h2, .aegis-prose h3 {
    @apply font-semibold text-text-primary mb-2 mt-4 first:mt-0;
  }
  .aegis-prose h1 { @apply text-lg; }
  .aegis-prose h2 { @apply text-base; }
  .aegis-prose h3 { @apply text-sm; }

  /* ── Admin navigation item ── */
  .nav-item {
    @apply relative flex items-center gap-2.5 px-4 py-2.5;
    @apply text-sm text-text-secondary rounded-none;
    @apply transition-colors duration-[var(--duration-normal)];
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus;
  }
  .nav-item:hover {
    @apply text-text-primary bg-bg-secondary/50;
  }
  .nav-item.active {
    @apply text-text-primary font-medium;
  }
  .nav-item.active::before {
    content: '';
    @apply absolute left-0 top-1/2 -translate-y-1/2;
    @apply w-[3px] h-5 bg-accent rounded-r-full;
  }

  /* ── Employee topbar brand ── */
  .topbar-brand {
    @apply flex items-center gap-2.5 h-full;
  }

  /* ── Input group (label + input stacked) ── */
  .input-group {
    @apply flex flex-col gap-1.5 w-full;
  }
  .input-group label {
    @apply text-sm font-medium text-text-secondary;
  }

  /* ── Metric value display ── */
  .metric-value {
    @apply text-4xl font-bold tabular-nums leading-none tracking-tight;
  }
  .metric-label {
    @apply text-xs font-semibold text-text-tertiary uppercase tracking-wider;
  }

  /* ── Status badge (service health) ── */
  .status-healthy   { @apply text-success bg-success-bg border-success-border; }
  .status-degraded  { @apply text-warning bg-warning-bg border-warning-border; }
  .status-unhealthy { @apply text-danger  bg-danger-bg  border-danger-border;  }
  .status-unknown   { @apply text-text-tertiary bg-bg-tertiary border-border-primary; }

  /* ── Admin chart card ── */
  .chart-card {
    @apply surface-card p-4 flex flex-col gap-3;
  }
  .chart-title {
    @apply section-label;
  }

  /* ── Divider with label (used in audit timeline) ── */
  .divider-label {
    @apply flex items-center gap-3 text-xs text-text-tertiary font-medium;
  }
  .divider-label::before,
  .divider-label::after {
    content: '';
    @apply flex-1 border-t border-border-primary;
  }
}
```

---

## PART 2: CSS GRID LAYOUT TEMPLATES

These are the exact CSS Grid definitions for the two main portal layouts.
The agent MUST use these grid structures — do not invent alternative layouts.

### Employee Portal — Three-Panel Layout

```css
/* Applied to the main wrapper div in (employee)/layout.tsx */
.employee-shell {
  display: grid;
  grid-template-rows: var(--topbar-height) 1fr;
  grid-template-columns: 1fr;
  height: 100dvh;   /* dvh = dynamic viewport height, handles mobile browser chrome */
  max-height: 100dvh;
  overflow: hidden;
}

.employee-topbar {
  grid-row: 1;
  grid-column: 1;
}

.employee-body {
  grid-row: 2;
  grid-column: 1;
  display: grid;
  grid-template-columns:
    var(--employee-sidebar-width)
    1fr
    var(--employee-panel-width);
  overflow: hidden;
  min-width: 0;
}

/* Panel collapsed state — controlled by panelStore */
.employee-body[data-panel-collapsed="true"] {
  grid-template-columns:
    var(--employee-sidebar-width)
    1fr
    var(--employee-panel-icon-width);
}
```

**Tailwind equivalent (used in actual component):**
```typescript
// In (employee)/layout.tsx — the grid is defined here
<div className="flex flex-col h-dvh overflow-hidden">
  {/* Topbar — fixed height */}
  <div className="h-13 shrink-0">{topbar}</div>
  {/* Three-panel body */}
  <div
    className="flex-1 grid overflow-hidden"
    style={{
      gridTemplateColumns: panelCollapsed
        ? `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_ICON}px`
        : `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_WIDTH}px`,
    }}
  >
    {sidebar}
    {children}
    {panel}
  </div>
</div>
```

### Admin Portal — Sidebar + Main Layout

```typescript
// In (admin)/layout.tsx
<div className="flex h-dvh overflow-hidden bg-bg-primary">
  {/* Fixed-width sidebar */}
  <aside
    className="shrink-0 flex flex-col bg-bg-primary border-r border-border-primary overflow-y-auto"
    style={{ width: LAYOUT.ADMIN_SIDEBAR_WIDTH }}
  >
    {adminNav}
  </aside>

  {/* Scrollable main area */}
  <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
    {/* Sticky topbar */}
    <div className="h-13 shrink-0 border-b border-border-primary">{adminTopbar}</div>
    {/* Scrollable page content */}
    <div className="flex-1 overflow-y-auto">
      {children}
    </div>
  </main>
</div>
```

---

## PART 3: DARK MODE CODING PATTERNS

### Rule: Always use class-based tokens — never use Tailwind's `dark:` prefix for colors

```typescript
// ✅ CORRECT — uses CSS variable token classes
<div className="bg-bg-card border-border-primary text-text-primary">

// ❌ WRONG — hardcodes dark: prefix on color
<div className="bg-white dark:bg-navy-800 border-gray-200 dark:border-navy-600 text-gray-900 dark:text-gray-100">
```

The CSS variable system (defined in FRONTEND_01) handles dark mode automatically.
The `dark:` prefix is ONLY needed for these specific cases:

```typescript
// The ONLY valid uses of dark: prefix in AEGIS:

// 1. Box shadows (shadows have no CSS variable equivalent in Tailwind)
className="shadow-md dark:shadow-none dark:ring-1 dark:ring-border-primary"

// 2. Framer Motion inline styles that need theme awareness
// (use useTheme() hook to get current theme, then pick value)
const { theme } = useTheme()
const glowColor = theme === 'dark' ? 'rgba(6,182,212,0.15)' : 'rgba(6,182,212,0.08)'

// 3. Recharts chart colors (SVG doesn't support CSS variables)
// Use CHART_COLORS constants from FRONTEND_06 — they're readable in both modes
```

### Admin portal force-dark pattern

The admin `(admin)/layout.tsx` forces dark mode on mount:

```typescript
'use client'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()

  // Force dark mode for admin portal
  // This sets localStorage so it persists on admin page refreshes
  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  return <div className="dark">{children}</div>
}
```

### Smooth theme transitions

When toggling theme, add brief transitions to prevent harsh flashes.
This is already handled in `ThemeToggle.tsx` (FRONTEND_05). Do not add
transitions to individual components — they should use `transition-colors` only.

```typescript
// In ThemeToggle.tsx (already implemented in FRONTEND_05):
const root = document.documentElement
root.style.transition = 'background-color 200ms, color 200ms, border-color 200ms'
setTheme(theme === 'dark' ? 'light' : 'dark')
setTimeout(() => { root.style.transition = '' }, 200)
```

---

## PART 4: ANIMATION CLASS REFERENCE

Complete reference for all animation classes available via Tailwind config.
Agent should use these classes rather than writing custom animation CSS.

### Tailwind animation utilities

| Class | Effect | Duration | Usage |
|---|---|---|---|
| `animate-fade-in` | Opacity 0→1 | 150ms | New messages, modal content |
| `animate-slide-up` | Translate Y(8px)→0 + fade | 250ms | Cards, panels sliding in from bottom |
| `animate-slide-down` | Translate Y(-8px)→0 + fade | 250ms | Dropdowns, notifications |
| `animate-slide-right` | Translate X(16px)→0 + fade | 250ms | Panels sliding in from right |
| `animate-scale-in` | Scale 0.96→1 + fade | 150ms | Modals, dialogs, popovers |
| `animate-pulse-subtle` | Opacity 1→0.5→1 | 2.5s loop | Brand logo, skeleton alternative |
| `animate-status-pulse` | Scale + opacity | 2s loop | Connection status dots |
| `animate-shimmer` | Gradient sweep L→R | 2s loop | Skeleton loading states |
| `animate-blink` | Opacity 1→0→1 | 0.9s loop | Streaming cursor in chat |
| `animate-spin` | 360° rotation | 0.75s loop | Loading spinners (fast) |
| `animate-spin-slow` | 360° rotation | 2s loop | Background loading indicators |
| `animate-counter-up` | Slide up + fade | 400ms | Metric counter entrance |

### Delay utilities (add after animation class)

```typescript
// Use inline style for animation delay:
style={{ animationDelay: `${index * 50}ms` }}

// Or create a custom Tailwind class if used repeatedly:
// className="animate-slide-up [animation-delay:100ms]"
```

### Framer Motion variants (used in complex components)

```typescript
// Standard page transition variant
export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
}

// Standard card entrance (staggered)
export const CARD_STAGGER_CONTAINER = {
  animate: { transition: { staggerChildren: 0.05 } },
}
export const CARD_STAGGER_ITEM = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

// Command palette entrance
export const COMMAND_PALETTE_VARIANTS = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, scale: 0.97, transition: { duration: 0.1 } },
}

// Source panel collapse (spring)
export const PANEL_COLLAPSE_SPRING = {
  type: 'spring',
  stiffness: 400,
  damping: 40,
}

// Streaming message entrance
export const MESSAGE_ENTRANCE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
}
```

### prefers-reduced-motion rule

EVERY Framer Motion component must check `useReducedMotion()`:

```typescript
import { useReducedMotion } from 'framer-motion'

function AnimatedComponent() {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      variants={reducedMotion ? {} : PAGE_TRANSITION}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {content}
    </motion.div>
  )
}
```

---

## PART 5: RECHARTS COLOR INTEGRATION

Recharts renders SVG — CSS custom properties do not work inside SVG elements.
Always use the static CHART_COLORS object (defined in FRONTEND_06).

```typescript
// src/components/admin/charts/ChartTooltip.tsx exports:
export const CHART_COLORS = {
  green:  '#10B981',   // success — confidence green
  amber:  '#F59E0B',   // warning — confidence amber
  red:    '#EF4444',   // danger  — insufficient/escalated
  cyan:   '#06B6D4',   // accent  — ValidationScore line
  blue:   '#3B82F6',   // info    — admin accent
  purple: '#8B5CF6',   // mode C  — Mode C queries
  gray:   '#64748B',   // muted   — no-badge / grid lines
  gridLine:  'rgba(226, 232, 240, 0.6)',   // light mode grid
  darkGrid:  'rgba(30, 42, 61, 0.8)',      // dark mode grid
}
```

### Using chart colors in components

```typescript
// ValidationScore line chart (AEGIS primary KPI)
<Line
  dataKey="validation_score"
  stroke={CHART_COLORS.cyan}
  strokeWidth={2.5}
  dot={false}
  activeDot={{ r: 4, fill: CHART_COLORS.cyan, strokeWidth: 0 }}
/>

// Confidence distribution bar chart
<Bar dataKey="green_count" fill={CHART_COLORS.green} radius={[3, 3, 0, 0]} />
<Bar dataKey="amber_count" fill={CHART_COLORS.amber} radius={[3, 3, 0, 0]} />
<Bar dataKey="none_count"  fill={CHART_COLORS.gray}  radius={[3, 3, 0, 0]} />

// Grid and axis
<CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} vertical={false} />
<XAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
<YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
```

### Dark mode chart colors

The static CHART_COLORS work in both light and dark modes — semantic colors like green, amber, and cyan are readable on both white and navy backgrounds. The grid lines change between modes:

```typescript
// Detect dark mode in chart components
import { useTheme } from 'next-themes'

function MyChart() {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  return (
    <ResponsiveChart height={200}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        {/* ... */}
      </AreaChart>
    </ResponsiveChart>
  )
}
```

---

## PART 6: TAILWIND PROSE CONFIGURATION

The `@tailwindcss/typography` plugin is installed (see FRONTEND_04).
For chat messages, use the `.aegis-prose` class defined in Part 1.
Do NOT use the `.prose` class directly — it overrides too many styles.

For the review queue split-pane (where admin reviews long correction text),
use the standard typography plugin:

```typescript
// In ReviewPane.tsx only — for rendering formatted answer text
<div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
  {answerContent}
</div>
```

**Typography prose overrides** — add to globals.css inside `@layer base`:

```css
/* Prose overrides for dark mode in admin review pane */
.dark .prose {
  --tw-prose-body: rgb(var(--color-text-primary));
  --tw-prose-headings: rgb(var(--color-text-primary));
  --tw-prose-links: rgb(var(--color-accent));
  --tw-prose-bold: rgb(var(--color-text-primary));
  --tw-prose-counters: rgb(var(--color-text-secondary));
  --tw-prose-bullets: rgb(var(--color-text-tertiary));
  --tw-prose-hr: rgb(var(--color-border-primary));
  --tw-prose-quotes: rgb(var(--color-text-secondary));
  --tw-prose-code: rgb(var(--color-danger-text));
  --tw-prose-pre-bg: rgb(var(--color-bg-sunken));
  --tw-prose-th-borders: rgb(var(--color-border-secondary));
  --tw-prose-td-borders: rgb(var(--color-border-primary));
}
```

---

## PART 7: RESPONSIVE BREAKPOINT GUIDE

AEGIS is desktop-only (min-width: 1280px). Breakpoints:

```
md  = 1280px  ← minimum supported width (base breakpoint)
lg  = 1440px  ← optimal design width (primary design target)
xl  = 1920px  ← wide monitor (extra spacing, wider panels)
```

### Usage pattern

```typescript
// The design is built FOR 1440px. Adjustments for 1280px use md:
// md: breakpoint means "at 1280px minimum"

// Extra padding on wide screens:
<div className="p-5 xl:p-6">

// Wider sidebar on XL:
// (Use LAYOUT constants and inline styles rather than Tailwind for exact values)

// NEVER use breakpoints below md (no sm:, no xs:) — AEGIS is desktop-only
```

### Below-minimum viewport

For viewports below 1280px, show a full-screen message:

```typescript
// Add to root layout.tsx AFTER the main content
<div className="fixed inset-0 z-toast bg-bg-primary flex flex-col items-center justify-center gap-4 text-center p-8 md:hidden">
  <p className="text-lg font-semibold text-text-primary">
    AEGIS requires a minimum screen width of 1280px
  </p>
  <p className="text-sm text-text-secondary max-w-xs">
    Please use a desktop or laptop browser to access AEGIS.
  </p>
</div>
```

---

## PART 8: SPACING AND PADDING GUIDE

The 4px base unit system. Quick reference for component padding:

```
Component              Padding      Class
────────────────────────────────────────────
Card                   16px         p-4
Card header            16px 16px 0  px-4 pt-4
Card content           16px         p-4
Panel                  16px–20px    p-4 lg:p-5
Admin page content     20px–24px    p-5 lg:p-6
Topbar                 0 20px       px-5
Admin sidebar nav item 10px 16px    py-2.5 px-4
Button (default)       0 16px       px-4 (h-10 via buttonVariants)
Input                  0 12px       px-3 (h-10 via inputVariants)
Badge                  1.5px 10px   px-2.5 py-0.5
Table cell             12px 16px    px-4 py-3 (from shadcn Table)
Modal                  24px         p-6
```

---

## PART 9: Z-INDEX USAGE GUIDE

Use Tailwind z-index classes that map to CSS variable layers:

```
z-dropdown      (100)  → Session context menu, dropdowns, tooltips
z-sticky        (200)  → Admin topbar, BulkActionBar floating toolbar
z-overlay       (300)  → Modal backdrop, sheet backdrop
z-modal         (400)  → Dialog/Modal content, Sheet content
z-notification  (500)  → [NOT IN DEMO] Push notifications
z-command       (600)  → CommandPalette (must be above everything)
z-toast         (700)  → Sonner toast container (highest)
```

```typescript
// Examples:
className="z-dropdown"    // session context menu
className="z-modal"       // ConfirmDialog content
className="z-command"     // CommandPalette overlay
// In Sonner configuration: already handled by ToastProvider
```

---

## PART 10: COMMON CSS MISTAKES TO AVOID

```typescript
// ❌ WRONG — hardcoded color in any component file
<div style={{ backgroundColor: '#060B14' }} />
<div className="bg-[#060B14]" />

// ✅ CORRECT — CSS variable token
<div className="bg-bg-primary" />

// ❌ WRONG — dark: prefix for colors
<div className="text-gray-900 dark:text-gray-100" />

// ✅ CORRECT — semantic token
<div className="text-text-primary" />

// ❌ WRONG — arbitrary opacity without token
<div className="opacity-50" style={{ color: '#10B981' }} />

// ✅ CORRECT — Tailwind opacity modifier on token
<div className="text-success/50" />

// ❌ WRONG — fixed height instead of layout token
<div className="h-[52px]" />  // topbar height

// ✅ CORRECT — CSS variable via inline style
<div style={{ height: LAYOUT.EMPLOYEE_TOPBAR_HEIGHT }} />
// or: <div className="h-13" />  (13 * 4px = 52px via our custom spacing)

// ❌ WRONG — z-index as arbitrary value
<div className="z-[600]" />

// ✅ CORRECT — semantic z-index class
<div className="z-command" />

// ❌ WRONG — Framer Motion without reduced-motion check
<motion.div animate={{ x: 100 }} />

// ✅ CORRECT — with reduced-motion fallback
const reducedMotion = useReducedMotion()
<motion.div animate={reducedMotion ? {} : { x: 100 }} />
```

---

## VERIFICATION CHECKLIST

After adding Part 1 CSS to globals.css, verify:

```bash
cd frontend && npm run dev

# 1. chip-base class works
# → Apply .chip-error to a span containing "VL150"
# → Should render with danger bg/border/text colors

# 2. aegis-prose class works
# → Apply .aegis-prose to a div containing <p>, <ol>, <strong>
# → Should render with correct spacing, no default browser styling

# 3. section-label class works
# → Apply .section-label to a span
# → Should be uppercase, tracked, tertiary color, 11px

# 4. surface-card class works
# → Apply .surface-card to a div
# → Should render card with bg-card, border, rounded-xl, shadow-sm
# → In dark mode: navy-800 background, navy-600 border

# 5. Build without CSS errors
npm run build 2>&1 | grep -i "error"
# Expected: no CSS errors
```

---

## COMMIT (run after FRONTEND_01 session completes)

```bash
git add -A
git commit -m "F01: Design system supplemental — @layer components, layout templates, dark mode patterns, animation reference"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F01 (supplement to FRONTEND_01)*
