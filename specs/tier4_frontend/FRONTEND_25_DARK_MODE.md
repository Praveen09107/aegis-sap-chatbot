# FRONTEND_25: DARK MODE
## Complete Dark Mode System — next-themes, Variables, Charts, Admin Enforcement
## Session F17 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F17: Dark mode system.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**No new component files to create.** This document specifies:
1. How next-themes is configured and how it works with the CSS variable system
2. The complete variable mapping (light ↔ dark)
3. Recharts dark mode colour configuration
4. Image and SVG dark mode handling
5. The admin portal forced dark mode pattern
6. Common dark mode pitfalls to avoid
7. Dark mode testing checklist

**Reference:** The CSS variables are defined in FRONTEND_01 (`globals.css`).
This document explains how they behave and how the two themes relate.

---

## PORTAL THEME ASSIGNMENTS

AEGIS has two portals with different default themes:

| Portal | Default theme | User can toggle? | Forced? |
|--------|--------------|-----------------|---------|
| Employee (`/`) | Light | Yes (ThemeToggle in topbar) | No |
| Admin (`/admin/*`) | Dark | Yes (ThemeToggle in topbar) | Soft-forced on mount |

"Soft-forced" means: the admin layout calls `setTheme('dark')` on mount via `useEffect`.
The user can still switch to light using the ThemeToggle, and that preference persists.
If they navigate away and back to admin, it will re-apply dark on mount only if their
stored preference is not explicitly 'light'.

```typescript
// In (admin)/layout.tsx — already implemented in FRONTEND_09:
useEffect(() => {
  // Only force dark if user hasn't explicitly chosen light
  const stored = localStorage.getItem('aegis-theme')
  if (stored !== 'light') {
    setTheme('dark')
  }
}, [setTheme])
```

---

## NEXT-THEMES CONFIGURATION

```typescript
// In src/components/shared/providers/ThemeProvider.tsx (FRONTEND_01):
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"          // Adds class="dark" to <html>
      defaultTheme="light"       // Employee portal default
      storageKey="aegis-theme"   // localStorage key
      disableTransitionOnChange  // Prevents flash during theme switch
    >
      {children}
    </NextThemesProvider>
  )
}
```

**`attribute="class"`** means next-themes toggles the `dark` class on `<html>`.
Our CSS variables are scoped with `.dark` selector (see FRONTEND_01 globals.css).

**`disableTransitionOnChange`** prevents color flashing during theme switch.
This is intentional — instant switch is cleaner than a jarring color fade across
the entire page simultaneously.

---

## CSS VARIABLE SYSTEM — COMPLETE MAPPING

All colour tokens are CSS custom properties on `:root` (light) and `.dark` (dark).
These are set in `globals.css` (FRONTEND_01). Reference table:

### Background tokens

| Variable | Light value | Dark value | Used for |
|----------|------------|-----------|---------|
| `--color-bg-primary` | `#F8FAFC` | `#060B14` | Admin portal background |
| `--color-bg-secondary` | `#F1F5F9` | `#0C1528` | Sidebar, page backgrounds |
| `--color-bg-card` | `#FFFFFF` | `#0F1C2E` | Cards, panels, modals |
| `--color-bg-tertiary` | `#E2E8F0` | `#162033` | Table headers, hover states |

### Text tokens

| Variable | Light | Dark | Used for |
|----------|-------|------|---------|
| `--color-text-primary` | `#0F172A` | `#F1F5F9` | All body text |
| `--color-text-secondary` | `#334155` | `#94A3B8` | Labels, descriptions |
| `--color-text-tertiary` | `#64748B` | `#475569` | Placeholders, hints, meta |

### Border tokens

| Variable | Light | Dark | Used for |
|----------|-------|------|---------|
| `--color-border-primary` | `#E2E8F0` | `#1E2A3D` | Table rows, card borders |
| `--color-border-secondary` | `#CBD5E1` | `#253447` | Active borders |
| `--color-border-focus` | `#06B6D4` | `#06B6D4` | Focus rings (same both) |

### Accent tokens (same both themes)

The accent colour (`#06B6D4` electric cyan) is the same in both light and dark themes.
This is intentional — the cyan pops equally against white and navy backgrounds.

---

## RECHARTS DARK MODE CONFIGURATION

Recharts SVG elements do not inherit CSS variable colours automatically.
You must pass colours explicitly.

### ChartTooltip.tsx — color constants (update from FRONTEND_17)

```typescript
// In src/components/admin/charts/ChartTooltip.tsx:
// These constants are used by all chart components

export const CHART_COLORS = {
  cyan:    '#06B6D4',  // accent — same both themes
  blue:    '#3B82F6',
  green:   '#10B981',
  amber:   '#F59E0B',
  red:     '#EF4444',
  purple:  '#8B5CF6',
  gray:    '#64748B',

  // Grid lines — must check theme
  gridLine:  '#E2E8F0',   // light mode
  darkGrid:  '#1E2A3D',   // dark mode

  // Axis tick text — Recharts doesn't inherit CSS vars
  tickLight: '#64748B',   // --color-text-tertiary light
  tickDark:  '#475569',   // --color-text-tertiary dark
} as const

// Tick style — must be passed as `tick` prop to XAxis/YAxis
// Usage: <XAxis tick={CHART_TICK_STYLE} />  (uses useTheme to pick correct color)
import { useTheme } from 'next-themes'

export function useChartTickStyle() {
  const { theme } = useTheme()
  return {
    fontSize: 11,
    fontFamily: 'var(--font-geist-sans)',
    fill: theme === 'dark' ? CHART_COLORS.tickDark : CHART_COLORS.tickLight,
  }
}

// Static reference (for components that call useTheme internally):
export const CHART_TICK_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-geist-sans)',
  fill: '#64748B',  // overridden inline by components that use useTheme
} as const
```

### Per-chart dark mode pattern

Each chart component already calls `useTheme()` to get the correct grid colour:

```typescript
// Pattern used in ValidationScoreChart, ConfidenceDistChart, etc.:
const { theme } = useTheme()
const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

<CartesianGrid stroke={gridColor} />
```

**Rule:** The chart container background must always be **transparent** — the parent
`chart-card` div provides the dark background. Never hardcode a background on the SVG.

---

## IMAGE AND LOGO DARK MODE HANDLING

### Sona Comstar logo (public/logo.svg)

The logo is a single-color SVG. In both portals, it's placed on a cyan accent background:

```typescript
<div className="w-7 h-7 rounded-lg bg-accent">
  <Image
    src="/logo.svg"
    className="brightness-0 invert"  // forces white regardless of theme
  />
</div>
```

`brightness-0 invert` = white logo on the cyan background. Works in both themes.

### SAP module icons (if added later)

If icon images are added, use the `dark:` Tailwind variant:

```html
<!-- For images that need different treatment in dark mode: -->
<Image className="dark:invert dark:brightness-75" src="/icon.png" />
```

### Screenshots in AI responses

Screenshots uploaded by employees are displayed as-is in both themes.
No dark mode processing — the image is unchanged.

---

## THE DARK THEME SURFACE HIERARCHY

In dark mode, depth is conveyed through lighter backgrounds (opposite of light mode):

```
Darkest (furthest back) → Lightest (closest to user)

bg-primary    #060B14   ← Page background, admin nav background
bg-secondary  #0C1528   ← Sidebar background, section backgrounds
bg-card       #0F1C2E   ← Cards, panels, table rows
bg-tertiary   #162033   ← Table header, hover states, code blocks
```

**Rule:** Never place darker elements on lighter elements in dark mode.
A card (`bg-card`) must always sit on a background (`bg-secondary` or `bg-primary`).

---

## COMMON DARK MODE PITFALLS

### ❌ Pitfall 1: Hardcoded hex colours

```typescript
// WRONG — hardcoded hex is invisible in dark mode:
<div style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}>

// RIGHT — use CSS variables:
<div className="bg-bg-card text-text-primary">
```

### ❌ Pitfall 2: Tailwind colour classes without dark: variant

```typescript
// WRONG — white/slate from Tailwind's default palette:
<p className="text-white bg-slate-900">

// RIGHT — always use semantic token classes:
<p className="text-text-primary bg-bg-card">
```

### ❌ Pitfall 3: Recharts with hardcoded fill colours

```typescript
// WRONG — fixed dark fill is wrong in light mode:
<CartesianGrid stroke="#1E2A3D" />

// RIGHT — derive from theme:
const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine
<CartesianGrid stroke={gridColor} />
```

### ❌ Pitfall 4: Using `bg-white` instead of `bg-bg-card`

```typescript
// WRONG — bg-white is always white, even in dark mode:
<div className="bg-white border border-gray-200">

// RIGHT:
<div className="bg-bg-card border border-border-primary">
```

### ❌ Pitfall 5: Shadow colours that look wrong in dark mode

```typescript
// WRONG — default Tailwind shadows use rgba(0,0,0,...) which is fine on light
// but may look odd on dark backgrounds with glow effects:
<div className="shadow-lg">

// OK — standard shadows work acceptably in dark mode in most cases.
// For accent glow: use border-border-focus/30 instead of a shadow.
```

### ❌ Pitfall 6: `next/image` with no explicit dimensions in dark mode

```typescript
// Not a dark mode issue per se, but Image without explicit width/height
// causes layout shift when theme changes. Always set dimensions.
<Image src="..." width={32} height={32} />
```

---

## THEMEABLE COMPONENT AUDIT CHECKLIST

Run this checklist when implementing any new component:

```
□ All background colours use bg-bg-* token classes
□ All text colours use text-text-* token classes
□ All border colours use border-border-* token classes
□ No hardcoded hex values in style= attributes
□ No bare Tailwind colours (slate-*, white, black) without dark: variant
□ Recharts components use useTheme() for grid/tick colours
□ SVG illustrations use currentColor or CSS variables
□ Image components: logo uses brightness-0 invert trick
□ Shadows: default Tailwind shadows are acceptable
□ The component renders correctly when class="dark" is on <html>
```

---

## DARK MODE TESTING STEPS

```bash
cd frontend && npm run dev

# Step 1: Employee portal light mode (default)
# → http://localhost:3000/ → should be white/light background
# → ThemeToggle in topbar → click → dark mode activates
# → Reload → should remember dark preference

# Step 2: Admin portal dark mode enforcement
# → http://localhost:3000/admin/dashboard → should be dark immediately
# → ThemeToggle in topbar → click → switches to light
# → Reload → stays at user's preference (no force after first visit)

# Step 3: Chat interface in dark mode
# → Enable dark on employee portal
# → Chat bubbles: user (right-aligned, accent bg) and AI (left, card bg)
# → Both should be readable with correct text colours

# Step 4: Charts in dark mode
# → /admin/dashboard in dark mode
# → All Recharts charts: dark grid lines, correct tick label colours
# → No white boxes or broken chart areas

# Step 5: DataTable in dark mode
# → /admin/documents in dark mode
# → Table header: bg-bg-secondary
# → Row hover: bg-bg-secondary
# → Borders: border-border-primary (navy)

# Step 6: Modals in dark mode
# → Open ConfirmDialog in dark mode
# → Dialog background: bg-bg-card
# → No white flash on open

# Step 7: System health service tiles in dark mode
# → /admin/system-health in dark mode
# → Healthy tiles: subtle green tint over dark bg
# → Text readable against dark background

# Step 8: Skeleton in both themes
# → Skeletons should have visible contrast in both light and dark
# → Should NOT be invisible (white on white) or too harsh (black on black)
```

---

## COMMIT

```bash
git add -A
git commit -m "F17: Dark mode — next-themes config, CSS variable mapping, Recharts dark mode, pitfalls guide, testing checklist"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F17*
