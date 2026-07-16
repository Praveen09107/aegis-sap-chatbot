# FRONTEND_01: DESIGN SYSTEM
## Complete Design Token System — The Foundation Everything Inherits From
## Session F01 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F01: The complete AEGIS design system.

Attach: FRONTEND_MASTER_REFERENCE.md and this document.

**What this session creates:**
- `frontend/src/app/globals.css` — All CSS custom properties for both modes
- `frontend/tailwind.config.js` — Complete Tailwind configuration
- `frontend/src/app/fonts.ts` — Geist + JetBrains Mono setup
- `frontend/src/app/layout.tsx` — Root layout with fonts, ThemeProvider, QueryProvider
- `frontend/src/lib/utils.ts` — cn() utility
- `frontend/src/types/index.ts` — Root TypeScript types
- `frontend/components.json` — shadcn/ui configuration

**Prerequisite:** npm install completed (see FRONTEND_04_DEPENDENCIES.md for full package list).

---

## DESIGN PHILOSOPHY

**Dual-environment:** Employee portal and admin portal are visually distinct environments. Employees see a clean, focused light interface. IT admins see a sophisticated dark monitoring console. The visual contrast communicates role instantly.

**"Precision Console" identity:** Deep navy (#060B14) as the dark base, electric cyan (#06B6D4) as the interactive accent. Not a generic purple-gradient AI aesthetic. Not a flat corporate blue. Sharp, technical, trustworthy.

**Semantic-first color:** Every color token has a meaning. Green = high confidence. Amber = verify. Red = escalated. Cyan = interactive. These never appear decoratively.

---

## COLOR SYSTEM

### Brand Palette (static, never changes between modes)

```
Navy (primary dark surface):
  navy-950: #020508    ← deepest background
  navy-900: #060B14    ← main dark background
  navy-800: #0D1525    ← card background (dark)
  navy-700: #141D2E    ← elevated card (dark)
  navy-600: #1E2A3D    ← strong border / hover state
  navy-500: #2A3D57    ← medium border
  navy-400: #3B5070    ← inactive element
  navy-300: #4D6280    ← muted text (dark)
  navy-200: #6B84A0    ← secondary text hint
  navy-100: #8FA8C2    ← subtle text

Cyan (interactive accent):
  cyan-300: #67E8F9    ← subtle glow, active indicators
  cyan-400: #22D3EE    ← hover state
  cyan-500: #06B6D4    ← PRIMARY ACCENT (buttons, links, focus rings)
  cyan-600: #0891B2    ← pressed state
  cyan-700: #0E7490    ← dark mode pressed
```

### Semantic Color System

The confidence system — used on every AI response:
```
SUCCESS (High confidence ≥ 0.85):  #10B981  (emerald)
WARNING (Moderate 0.70–0.84):      #F59E0B  (amber)
DANGER  (Insufficient <0.70):      #EF4444  (red)
```

Additional semantic colors:
```
INFO (admin accent, interactive):   #3B82F6  (blue)
PURPLE (Mode C queries, AI notes):  #8B5CF6  (violet)
```

---

## FILE 1: frontend/src/app/globals.css (COMPLETE FILE)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─────────────────────────────────────────────────────────
   CSS CUSTOM PROPERTIES
   RGB channel values (no rgb() wrapper) allow Tailwind
   opacity modifiers: bg-bg-primary/50 works correctly.
   ───────────────────────────────────────────────────────── */

@layer base {
  :root {
    /* ── Background ── */
    --color-bg-primary:    255 255 255;   /* white */
    --color-bg-secondary:  248 250 252;   /* gray-50 */
    --color-bg-tertiary:   241 245 249;   /* gray-100 */
    --color-bg-card:       255 255 255;   /* white card */
    --color-bg-elevated:   248 250 252;   /* slightly off-white elevated */
    --color-bg-sunken:     244 246 248;   /* inset areas, code blocks */

    /* ── Text ── */
    --color-text-primary:   15  23  42;   /* gray-900 */
    --color-text-secondary: 71  85 105;   /* gray-600 */
    --color-text-tertiary: 148 163 184;   /* gray-400 */
    --color-text-disabled: 203 213 225;   /* gray-300 */
    --color-text-inverse:  255 255 255;   /* white */

    /* ── Borders ── */
    --color-border-primary:   226 232 240; /* gray-200 */
    --color-border-secondary: 203 213 225; /* gray-300 */
    --color-border-strong:    148 163 184; /* gray-400 */
    --color-border-focus:       6 182 212; /* cyan-500 */

    /* ── Accent (cyan) ── */
    --color-accent:           6 182 212;  /* cyan-500 */
    --color-accent-hover:    34 211 238;  /* cyan-400 */
    --color-accent-pressed:   8 145 178;  /* cyan-600 */
    --color-accent-subtle:  236 254 255;  /* cyan-50 */
    --color-accent-text:     14 116 144;  /* cyan-800 */
    --color-accent-fg:      255 255 255;  /* text on accent bg */

    /* ── Success (confidence green) ── */
    --color-success:         16 185 129;  /* emerald-500 */
    --color-success-bg:     209 250 229;  /* emerald-100 */
    --color-success-border: 110 231 183;  /* emerald-300 */
    --color-success-text:     6  95  70;  /* emerald-800 */

    /* ── Warning (confidence amber) ── */
    --color-warning:        245 158  11;  /* amber-500 */
    --color-warning-bg:     254 243 199;  /* amber-100 */
    --color-warning-border: 252 211  77;  /* amber-300 */
    --color-warning-text:   146  64  14;  /* amber-800 */

    /* ── Danger (insufficient / error) ── */
    --color-danger:         239  68  68;  /* red-500 */
    --color-danger-bg:      254 226 226;  /* red-100 */
    --color-danger-border:  252 165 165;  /* red-300 */
    --color-danger-text:    153  27  27;  /* red-800 */

    /* ── Info (admin accent, interactive) ── */
    --color-info:            59 130 246;  /* blue-500 */
    --color-info-bg:        239 246 255;  /* blue-50 */
    --color-info-border:    186 230 253;  /* blue-200 */
    --color-info-text:       30  64 175;  /* blue-800 */

    /* ── Purple (Mode C queries) ── */
    --color-purple:         139  92 246;  /* violet-500 */
    --color-purple-bg:      237 233 254;  /* violet-100 */
    --color-purple-border:  196 181 253;  /* violet-300 */
    --color-purple-text:     91  33 182;  /* violet-800 */

    /* ── Shadows (light mode: drop shadows) ── */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow:    0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.10), 0 4px 6px rgba(0,0,0,0.05);
    --shadow-xl: 0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04);

    /* ── Animation ── */
    --duration-fast:   100ms;
    --duration-normal: 150ms;
    --duration-slow:   250ms;
    --duration-slower: 400ms;
    --ease-spring:   cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1);
    --ease-out:      cubic-bezier(0, 0, 0.2, 1);
    --ease-in:       cubic-bezier(0.4, 0, 1, 1);

    /* ── Layout constants ── */
    --topbar-height: 52px;
    --employee-sidebar-width: 180px;
    --employee-panel-width: 210px;
    --employee-panel-icon-width: 48px;
    --admin-sidebar-width: 220px;
    --compose-height: 64px;

    /* ── Z-index layers ── */
    --z-dropdown:     100;
    --z-sticky:       200;
    --z-overlay:      300;
    --z-modal:        400;
    --z-notification: 500;
    --z-command:      600;
    --z-toast:        700;
  }

  /* ─────────────────────────────────────────────────────────
     DARK MODE OVERRIDES
     Applied via class="dark" on <html> by next-themes
     ───────────────────────────────────────────────────────── */

  .dark {
    /* ── Background ── */
    --color-bg-primary:    6  11  20;   /* navy-900 */
    --color-bg-secondary: 13  21  37;   /* navy-800 */
    --color-bg-tertiary:  20  29  46;   /* navy-700 */
    --color-bg-card:      13  21  37;   /* navy-800 */
    --color-bg-elevated:  20  29  46;   /* navy-700 */
    --color-bg-sunken:     6  11  20;   /* navy-900 */

    /* ── Text ── */
    --color-text-primary:  241 245 249;  /* gray-100 */
    --color-text-secondary: 148 163 184; /* gray-400 */
    --color-text-tertiary:   77  98 128; /* navy-300 */
    --color-text-disabled:   42  61  87; /* navy-500 */
    --color-text-inverse:    15  23  42; /* gray-900 */

    /* ── Borders ── */
    --color-border-primary:   30  42  61; /* navy-600 */
    --color-border-secondary: 42  61  87; /* navy-500 */
    --color-border-strong:    77  98 128; /* navy-300 */
    --color-border-focus:      6 182 212; /* cyan-500 (same) */

    /* ── Accent (same values, dark adjusted subtleties) ── */
    --color-accent:          6 182 212;
    --color-accent-hover:   34 211 238;
    --color-accent-pressed:  8 145 178;
    --color-accent-subtle:  12  44  53;  /* very dark cyan tint */
    --color-accent-text:   103 232 249;  /* cyan-300 (lighter for dark bg) */
    --color-accent-fg:     255 255 255;

    /* ── Success (dark mode: deeper greens) ── */
    --color-success:          16 185 129;
    --color-success-bg:        6  53  36;  /* deep dark green */
    --color-success-border:    6  95  70;  /* dark green border */
    --color-success-text:    110 231 183;  /* light green text */

    /* ── Warning (dark mode: deeper ambers) ── */
    --color-warning:         245 158  11;
    --color-warning-bg:       52  31   5;  /* deep dark amber */
    --color-warning-border:  107  58  10;  /* dark amber border */
    --color-warning-text:    252 211  77;  /* light amber text */

    /* ── Danger (dark mode: deeper reds) ── */
    --color-danger:          239  68  68;
    --color-danger-bg:        45  14  14;  /* deep dark red */
    --color-danger-border:   107  23  23;  /* dark red border */
    --color-danger-text:     252 165 165;  /* light red text */

    /* ── Info (dark mode: deeper blues) ── */
    --color-info:             59 130 246;
    --color-info-bg:          15  30  60;  /* deep dark blue */
    --color-info-border:      30  58 138;  /* dark blue border */
    --color-info-text:       147 197 253;  /* light blue text */

    /* ── Purple (dark mode) ── */
    --color-purple:          139  92 246;
    --color-purple-bg:        30  20  60;
    --color-purple-border:    60  40 120;
    --color-purple-text:     196 181 253;  /* light violet text */

    /* ── Shadows (dark mode: subtle inner glow + deeper drops) ── */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.40);
    --shadow:    0 1px 3px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.03);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.04);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.04);
    --shadow-xl: 0 20px 25px rgba(0,0,0,0.70), inset 0 1px 0 rgba(255,255,255,0.04);
  }

  /* ─────────────────────────────────────────────────────────
     BASE ELEMENT STYLES
     ───────────────────────────────────────────────────────── */

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
  }

  body {
    @apply bg-bg-primary text-text-primary font-sans;
    font-feature-settings: "rlig" 1, "calt" 1, "ss01" 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  /* ── Scrollbar styling ── */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-border-primary rounded-full;
    transition: background var(--duration-normal) var(--ease-out);
  }
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-border-secondary;
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }

  /* ── Focus visible (keyboard navigation) ── */
  :focus-visible {
    outline: 2px solid rgb(var(--color-border-focus));
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* ── Text selection ── */
  ::selection {
    background: rgb(var(--color-accent-subtle));
    color: rgb(var(--color-text-primary));
  }

  /* ── Input reset ── */
  input, textarea, select {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  /* ── Button reset ── */
  button {
    font-family: inherit;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
  }

  /* ── Image defaults ── */
  img, video {
    max-width: 100%;
    display: block;
  }

  /* ── Anchor reset ── */
  a {
    color: inherit;
    text-decoration: none;
  }

  /* ── Code and monospace ── */
  code, kbd, pre, samp {
    font-family: var(--font-mono), 'Cascadia Code', 'Consolas', monospace;
  }
}

/* ─────────────────────────────────────────────────────────
   UTILITY CLASSES
   ───────────────────────────────────────────────────────── */

@layer utilities {
  /* Tabular numbers for metrics */
  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }

  /* SAP monospace styling for entity chips */
  .font-sap {
    font-family: var(--font-mono), 'Cascadia Code', 'Consolas', monospace;
    letter-spacing: 0.02em;
  }

  /* Text balance for headings */
  .text-balance {
    text-wrap: balance;
  }

  /* Truncate with ellipsis */
  .truncate-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .truncate-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Shimmer loading animation */
  .shimmer {
    background: linear-gradient(
      90deg,
      rgb(var(--color-bg-tertiary)) 0%,
      rgb(var(--color-bg-secondary)) 50%,
      rgb(var(--color-bg-tertiary)) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 2s linear infinite;
  }

  /* Confidence aura left borders */
  .aura-green {
    border-left: 3px solid rgb(var(--color-success));
  }
  .aura-amber {
    border-left: 3px solid rgb(var(--color-warning));
  }
  .aura-none {
    border-left: 3px solid rgb(var(--color-border-primary));
  }
  .aura-streaming {
    border-left: 3px solid rgb(var(--color-border-secondary));
  }

  /* Hide scrollbar but keep functionality */
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* Admin nav active indicator */
  .nav-active-indicator {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 20px;
    background: rgb(var(--color-accent));
    border-radius: 0 3px 3px 0;
  }

  /* Reduced motion: disable animations */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}

/* ─────────────────────────────────────────────────────────
   KEYFRAME ANIMATIONS
   ───────────────────────────────────────────────────────── */

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes slideUp {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes slideDown {
  0% { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes slideInRight {
  0% { opacity: 0; transform: translateX(16px); }
  100% { opacity: 1; transform: translateX(0); }
}

@keyframes scaleIn {
  0% { opacity: 0; transform: scale(0.96); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes pulseSubtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes counterUp {
  0% { transform: translateY(100%); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
```

---

## FILE 2: frontend/tailwind.config.js (COMPLETE FILE)

```javascript
const { fontFamily } = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Dark mode via class (managed by next-themes)
  darkMode: ['class'],
  
  // Content paths for tree-shaking
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/hooks/**/*.{js,ts,jsx,tsx}',
    './src/lib/**/*.{js,ts}',
  ],

  theme: {
    extend: {
      // ── Colors (CSS variable-based for theme switching) ──
      colors: {
        // Background
        'bg-primary':   'rgb(var(--color-bg-primary) / <alpha-value>)',
        'bg-secondary': 'rgb(var(--color-bg-secondary) / <alpha-value>)',
        'bg-tertiary':  'rgb(var(--color-bg-tertiary) / <alpha-value>)',
        'bg-card':      'rgb(var(--color-bg-card) / <alpha-value>)',
        'bg-elevated':  'rgb(var(--color-bg-elevated) / <alpha-value>)',
        'bg-sunken':    'rgb(var(--color-bg-sunken) / <alpha-value>)',

        // Text
        'text-primary':   'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        'text-tertiary':  'rgb(var(--color-text-tertiary) / <alpha-value>)',
        'text-disabled':  'rgb(var(--color-text-disabled) / <alpha-value>)',
        'text-inverse':   'rgb(var(--color-text-inverse) / <alpha-value>)',

        // Borders
        'border-primary':   'rgb(var(--color-border-primary) / <alpha-value>)',
        'border-secondary': 'rgb(var(--color-border-secondary) / <alpha-value>)',
        'border-strong':    'rgb(var(--color-border-strong) / <alpha-value>)',
        'border-focus':     'rgb(var(--color-border-focus) / <alpha-value>)',

        // Accent (cyan)
        accent:           'rgb(var(--color-accent) / <alpha-value>)',
        'accent-hover':   'rgb(var(--color-accent-hover) / <alpha-value>)',
        'accent-pressed': 'rgb(var(--color-accent-pressed) / <alpha-value>)',
        'accent-subtle':  'rgb(var(--color-accent-subtle) / <alpha-value>)',
        'accent-text':    'rgb(var(--color-accent-text) / <alpha-value>)',
        'accent-fg':      'rgb(var(--color-accent-fg) / <alpha-value>)',

        // Success (confidence green)
        success:          'rgb(var(--color-success) / <alpha-value>)',
        'success-bg':     'rgb(var(--color-success-bg) / <alpha-value>)',
        'success-border': 'rgb(var(--color-success-border) / <alpha-value>)',
        'success-text':   'rgb(var(--color-success-text) / <alpha-value>)',

        // Warning (confidence amber)
        warning:          'rgb(var(--color-warning) / <alpha-value>)',
        'warning-bg':     'rgb(var(--color-warning-bg) / <alpha-value>)',
        'warning-border': 'rgb(var(--color-warning-border) / <alpha-value>)',
        'warning-text':   'rgb(var(--color-warning-text) / <alpha-value>)',

        // Danger (insufficient)
        danger:           'rgb(var(--color-danger) / <alpha-value>)',
        'danger-bg':      'rgb(var(--color-danger-bg) / <alpha-value>)',
        'danger-border':  'rgb(var(--color-danger-border) / <alpha-value>)',
        'danger-text':    'rgb(var(--color-danger-text) / <alpha-value>)',

        // Info (admin / blue)
        info:             'rgb(var(--color-info) / <alpha-value>)',
        'info-bg':        'rgb(var(--color-info-bg) / <alpha-value>)',
        'info-border':    'rgb(var(--color-info-border) / <alpha-value>)',
        'info-text':      'rgb(var(--color-info-text) / <alpha-value>)',

        // Purple (Mode C)
        purple:           'rgb(var(--color-purple) / <alpha-value>)',
        'purple-bg':      'rgb(var(--color-purple-bg) / <alpha-value>)',
        'purple-border':  'rgb(var(--color-purple-border) / <alpha-value>)',
        'purple-text':    'rgb(var(--color-purple-text) / <alpha-value>)',

        // Static navy scale (for explicit dark-theme elements)
        navy: {
          950: '#020508',
          900: '#060B14',
          800: '#0D1525',
          700: '#141D2E',
          600: '#1E2A3D',
          500: '#2A3D57',
          400: '#3B5070',
          300: '#4D6280',
          200: '#6B84A0',
          100: '#8FA8C2',
        },

        // Static cyan scale (brand accent)
        'brand-cyan': {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
          700: '#0E7490',
        },
      },

      // ── Typography ──
      fontFamily: {
        sans: ['var(--font-geist)', ...fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...fontFamily.mono],
      },

      fontSize: {
        'xs':   ['11px', { lineHeight: '1.45', letterSpacing: '0.01em' }],
        'sm':   ['12px', { lineHeight: '1.5',  letterSpacing: '0.005em' }],
        'base': ['14px', { lineHeight: '1.6' }],
        'md':   ['15px', { lineHeight: '1.6' }],
        'lg':   ['16px', { lineHeight: '1.55' }],
        'xl':   ['18px', { lineHeight: '1.45', fontWeight: '500' }],
        '2xl':  ['20px', { lineHeight: '1.4' }],
        '3xl':  ['24px', { lineHeight: '1.3' }],
        '4xl':  ['30px', { lineHeight: '1.2' }],
        '5xl':  ['36px', { lineHeight: '1.1' }],
        '6xl':  ['48px', { lineHeight: '1.0' }],
      },

      fontWeight: {
        light:     '300',
        regular:   '400',
        medium:    '500',
        semibold:  '600',
        bold:      '700',
      },

      // ── Spacing (4px base unit) ──
      spacing: {
        '0.5':  '2px',
        '1':    '4px',
        '1.5':  '6px',
        '2':    '8px',
        '2.5':  '10px',
        '3':    '12px',
        '3.5':  '14px',
        '4':    '16px',
        '4.5':  '18px',
        '5':    '20px',
        '6':    '24px',
        '7':    '28px',
        '8':    '32px',
        '9':    '36px',
        '10':   '40px',
        '11':   '44px',
        '12':   '48px',
        '13':   '52px',   // topbar height
        '14':   '56px',
        '15':   '60px',
        '16':   '64px',   // compose bar height
        '18':   '72px',
        '20':   '80px',
        '24':   '96px',
        '28':   '112px',
        '32':   '128px',
        '36':   '144px',
        '40':   '160px',
        '44':   '176px',
        '48':   '192px',
        '52':   '208px',
        '56':   '224px',
      },

      // ── Border radius ──
      borderRadius: {
        none:  '0',
        sm:    '4px',
        DEFAULT: '6px',
        md:    '8px',
        lg:    '12px',
        xl:    '16px',
        '2xl': '20px',
        '3xl': '24px',
        full:  '9999px',
      },

      // ── Box shadows ──
      boxShadow: {
        sm:    'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md:    'var(--shadow-md)',
        lg:    'var(--shadow-lg)',
        xl:    'var(--shadow-xl)',
        none:  'none',
        // Special: inset glow for dark mode cards
        'inset-glow': 'inset 0 1px 0 rgba(255,255,255,0.06)',
        // Special: focus ring
        'focus-ring': '0 0 0 2px rgb(var(--color-border-focus))',
        // Special: accent glow
        'accent-glow': '0 0 0 3px rgba(6,182,212,0.25)',
      },

      // ── Z-index ──
      zIndex: {
        dropdown:     '100',
        sticky:       '200',
        overlay:      '300',
        modal:        '400',
        notification: '500',
        command:      '600',
        toast:        '700',
      },

      // ── Animations ──
      animation: {
        'fade-in':      'fadeIn var(--duration-normal) var(--ease-out) both',
        'slide-up':     'slideUp var(--duration-slow) var(--ease-spring) both',
        'slide-down':   'slideDown var(--duration-slow) var(--ease-spring) both',
        'slide-right':  'slideInRight var(--duration-slow) var(--ease-spring) both',
        'scale-in':     'scaleIn var(--duration-normal) var(--ease-spring) both',
        'pulse-subtle': 'pulseSubtle 2.5s var(--ease-in-out) infinite',
        'status-pulse': 'statusPulse 2s var(--ease-in-out) infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'blink':        'blink 0.9s step-start infinite',
        'spin':         'spin 0.75s linear infinite',
        'spin-slow':    'spin 2s linear infinite',
        'counter-up':   'counterUp var(--duration-slower) var(--ease-spring) both',
      },

      keyframes: {
        fadeIn:      { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:     { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown:   { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInRight:{ '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        scaleIn:     { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        pulseSubtle: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        statusPulse: { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.6', transform: 'scale(0.82)' } },
        shimmer:     { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        blink:       { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
        spin:        { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        counterUp:   { '0%': { transform: 'translateY(100%)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },

      transitionTimingFunction: {
        spring:    'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out':  'cubic-bezier(0.4, 0, 0.2, 1)',
        out:       'cubic-bezier(0, 0, 0.2, 1)',
        in:        'cubic-bezier(0.4, 0, 1, 1)',
      },

      transitionDuration: {
        fast:    '100ms',
        normal:  '150ms',
        slow:    '250ms',
        slower:  '400ms',
      },

      // ── Screen breakpoints (desktop-only design) ──
      screens: {
        md:  '1280px',   // minimum supported width
        lg:  '1440px',   // optimal width
        xl:  '1920px',   // wide monitors
      },
    },
  },

  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
}
```

---

## FILE 3: frontend/src/app/fonts.ts (COMPLETE FILE)

```typescript
import { Geist, Geist_Mono } from 'next/font/google'

/**
 * Geist: Primary UI font
 * - Clean, modern, excellent legibility at small sizes
 * - Used for all UI text, labels, buttons, navigation
 */
export const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

/**
 * Geist Mono: Technical/code font
 * - Used exclusively for SAP entity chips (error codes, T-codes, document numbers)
 * - Used for document IDs in attribution panels
 * - Used for metric values in admin dashboard
 * - Never used for general UI text
 */
export const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
})
```

---

## FILE 4: frontend/src/app/layout.tsx (ROOT LAYOUT — COMPLETE FILE)

```typescript
import type { Metadata, Viewport } from 'next'
import { geist, geistMono } from './fonts'
import { ThemeProvider } from '@/components/shared/providers/ThemeProvider'
import { QueryProvider } from '@/components/shared/providers/QueryProvider'
import { ToastProvider } from '@/components/shared/providers/ToastProvider'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'AEGIS — SAP Intelligence',
    template: '%s | AEGIS',
  },
  description: 'SAP ERP Helpdesk AI — Sona Comstar',
  robots: { index: false, follow: false }, // Internal tool
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning // next-themes requires this
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="min-h-screen bg-bg-primary font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"          // Employee portal default: light
          enableSystem={false}          // No OS detection — explicit toggle only
          disableTransitionOnChange={false}
          storageKey="aegis:dark-mode"
        >
          <QueryProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

---

## FILE 5: frontend/src/components/shared/providers/ThemeProvider.tsx

```typescript
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes/dist/types'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

---

## FILE 6: frontend/src/components/shared/providers/QueryProvider.tsx

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Global defaults — override per-query as needed
            staleTime: 30_000,          // 30 seconds before refetch
            gcTime: 5 * 60 * 1000,     // 5 minutes cache retention
            retry: 2,                   // Retry failed requests twice
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: false, // Explicit polling handles this
            refetchOnReconnect: true,   // Refetch on network reconnect
            throwOnError: false,        // Handle errors in components
          },
          mutations: {
            retry: 0,  // No retry on mutations
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
```

---

## FILE 7: frontend/src/components/shared/providers/ToastProvider.tsx

```typescript
'use client'

import { Toaster } from 'sonner'
import { useTheme } from 'next-themes'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()

  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        theme={theme as 'light' | 'dark' | 'system'}
        richColors
        closeButton
        duration={4000}
        toastOptions={{
          classNames: {
            toast: 'font-sans text-sm',
            title: 'font-medium',
            description: 'text-text-secondary',
          },
        }}
      />
    </>
  )
}
```

---

## FILE 8: frontend/src/lib/utils.ts (COMPLETE FILE)

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS classes with conflict resolution.
 * Always use cn() instead of string concatenation for Tailwind classes.
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-accent', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Format date to human-readable relative time.
 * Used in session sidebar cards.
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

/**
 * Group sessions by relative date.
 * Returns an ordered array of [label, sessions[]] tuples.
 */
export function groupSessionsByDate<T extends { updated_at: string }>(
  sessions: T[]
): Array<[string, T[]]> {
  const groups: Record<string, T[]> = {}
  const labelOrder: string[] = []

  for (const session of sessions) {
    const label = formatRelativeDate(session.updated_at)
    if (!groups[label]) {
      groups[label] = []
      labelOrder.push(label)
    }
    groups[label].push(session)
  }

  return labelOrder.map((label) => [label, groups[label]])
}

/**
 * Format validation score as percentage string.
 * @example formatScore(0.847) → "84.7%"
 */
export function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`
}

/**
 * Format bytes to human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Debounce a function call.
 * Used for search inputs and other high-frequency events.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Check if a string contains a SAP error code pattern.
 */
export function hasSAPEntities(text: string): boolean {
  const patterns = [
    /\b[A-Z]{1,2}\d{4}[A-Z]?\b/,    // Error codes: VL150, F5201
    /\b[A-Z]{2,6}\d{0,3}[A-Z]?\b/,  // T-codes: VL01N, MM02
    /\b\d{10,12}\b/,                  // Document numbers
  ]
  return patterns.some((p) => p.test(text))
}

/**
 * Sleep for a given number of milliseconds.
 * Used in retry logic.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

---

## FILE 9: frontend/src/types/index.ts (ROOT TYPES — COMPLETE FILE)

```typescript
// ── Confidence system ──
export type ConfidenceBadge = 'green' | 'amber' | 'none' | null

// ── Streaming state machine ──
export type StreamingState =
  | 'idle'
  | 'thinking'
  | 'retrieving'
  | 'generating'
  | 'streaming'
  | 'validating'
  | 'complete'
  | 'error'

// ── SAP entity types ──
export type SAPEntityType = 'error_code' | 'tcode' | 'doc_number'

export interface SAPEntity {
  type: SAPEntityType
  value: string
  start: number
  end: number
}

// ── Attribution panel ──
export interface AttributionPanel {
  primary_document_id: string
  primary_document_name: string
  verified_by: string
  verified_date: string
  secondary_sources: Array<{
    document_id: string
    chunk_type: string
    verified_date: string
  }>
  confidence_badge: ConfidenceBadge
}

// ── WebSocket message types ──
export type WSMessageType =
  | 'session_ready'
  | 'token'
  | 'stream_complete'
  | 'validation_result'
  | 'vision_refined_answer'
  | 'error'
  | 'correction'
  | 'pong'
  | 'retrieval_progress'

export interface WSMessage {
  type: WSMessageType
  session_id?: string
  token?: string
  validation_score?: number
  confidence_badge?: ConfidenceBadge
  attribution_panel?: AttributionPanel
  message?: string
  error_code?: string
  ticket_id?: string
  diagnostic_summary?: string
  stage?: 'retrieving' | 'crag' | 'generating' | 'validating'
}

// ── Chat message ──
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streamingState?: StreamingState
  validationScore?: number
  confidenceBadge?: ConfidenceBadge
  attributionPanel?: AttributionPanel | null
  visionContext?: {
    message: string
    diagnostic_summary: string
    error_code?: string
  } | null
  entities?: SAPEntity[]
}

// ── Session ──
export interface Session {
  id: string
  user_id_hash: string
  topic_summary: string
  created_at: string
  updated_at: string
  turn_count: number
  avg_confidence_score: number | null
  confidence_badge: ConfidenceBadge
  module_tags: string[]
  is_pinned: boolean
  is_unresolved: boolean
}

// ── Admin types ──
export interface DocumentRecord {
  document_id: string
  content_type: 'error_guide' | 'procedure' | 'config'
  module: string
  status: 'active' | 'processing' | 'failed' | 'deprecated'
  chunk_count: number
  last_verified_date: string
  verified_by: string
  ingested_at: string
}

export interface MetricsData {
  total_queries_today: number
  avg_validation_score: number
  green_badge_rate: number
  amber_badge_rate: number
  none_badge_rate: number
  open_tickets: number
  cache_hit_rate: number
  crag_insufficient_rate: number
  mode_a_rate: number
  mode_b_rate: number
  mode_c_rate: number
  last_updated_at: string
}

export interface ServiceHealth {
  name: string
  container_name: string
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown'
  response_time_ms: number | null
  last_checked_at: string
  error_message?: string | null
}

export interface SystemHealthData {
  services: ServiceHealth[]
  total_healthy: number
  total_unhealthy: number
  overall_status: 'healthy' | 'degraded' | 'critical'
  checked_at: string
}

// ── User preferences ──
export interface UserPreferences {
  dark_mode: boolean | null  // null = use system
  panel_collapsed: boolean
  pinned_session_ids: string[]
  onboarding_complete: boolean
  onboarding_step: number
}

// ── Filter types ──
export interface SessionFilters {
  search?: string
  module?: string
  confidence_badge?: ConfidenceBadge
  date_from?: string
  date_to?: string
  is_pinned?: boolean
  is_unresolved?: boolean
}

export interface DocFilters {
  content_type?: string
  module?: string
  status?: string
}

export interface AuditFilters {
  date_from?: string
  date_to?: string
  confidence_badge?: ConfidenceBadge
  module?: string
  request_type?: string
}
```

---

## FILE 10: frontend/components.json (shadcn/ui CONFIG)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## TYPOGRAPHY SCALE — USAGE GUIDE

The agent must use these classes consistently. No font-size values in inline styles.

```
text-xs   (11px) → Timestamps, legal text, meta labels, badge counts
text-sm   (12px) → Captions, secondary labels, table meta, chip text
text-base (14px) → Body text, messages, form inputs, primary content
text-md   (15px) → Slightly prominent body, card descriptions
text-lg   (16px) → Section headings, sidebar headers
text-xl   (18px) → Page sub-headers, modal titles
text-2xl  (20px) → Page titles (admin)
text-3xl  (24px) → Admin metric card numbers
text-4xl  (30px) → Hero metric numbers
text-5xl  (36px) → Large metric displays

Font weights:
font-regular  (400) → All body text
font-medium   (500) → Labels, nav items, badge text, chart labels
font-semibold (600) → Headings, strong emphasis
font-bold     (700) → Metric numbers (admin), brand marks

Mono font — ONLY for:
font-mono → SAP entity chips (error codes, T-codes, doc IDs)
font-mono → Document IDs in attribution panels
font-mono → Admin code/config values
```

---

## SPACING RHYTHM — USAGE GUIDE

```
Internal component padding:   p-3 (12px) to p-4 (16px)
Between related elements:     gap-2 (8px) to gap-3 (12px)
Between sections:             gap-4 (16px) to gap-6 (24px)
Panel padding:                p-4 (16px) to p-5 (20px)
Card padding:                 p-4 (16px)
Page content padding:         p-5 (20px) or p-6 (24px)
Section margin:               mb-6 (24px) to mb-8 (32px)
```

---

## DARK MODE IMPLEMENTATION NOTES

**Admin portal always starts dark.** The admin layout (`(admin)/layout.tsx`) forces dark mode on mount:
```typescript
// In admin layout only:
useEffect(() => {
  setTheme('dark')
}, [])
```

**Employee portal default is light** but respects the toggle. ThemeProvider stores preference in localStorage under `aegis:dark-mode`.

**Transition on toggle** — add this class to body to smooth the color transition:
```typescript
// When theme changes, body gets transitional styles:
document.documentElement.style.transition = 'background-color 200ms, color 200ms'
setTimeout(() => {
  document.documentElement.style.transition = ''
}, 200)
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Basic rendering
# → Open http://localhost:3000
# → Body background should be white (#FFFFFF)
# → All text should use Geist font (check DevTools → Computed → font-family)

# Step 2: Dark mode
# → No toggle exists yet (added in F17 session)
# → Manually add class="dark" to <html> in DevTools
# → Background should change to #060B14 (navy-900)
# → Text should change to light gray
# → All colors should update without any element staying wrong color

# Step 3: Font verification
# → Open any text element in DevTools
# → Computed font-family should show "Geist" first
# → Inspect a code element or SAP entity
# → Should show "Geist Mono" first

# Step 4: CSS variables
# → DevTools → Computed → Filter by "--color"
# → Should see all --color-bg-*, --color-text-*, etc. defined
# → Toggle dark class and verify all variables change

# Step 5: Tailwind classes
# → Create a test div: <div className="bg-bg-primary text-text-primary border border-border-primary p-4 rounded-md shadow" />
# → Should render correctly in both light and dark modes

# Step 6: TypeScript
# → npx tsc --noEmit
# → Should produce 0 errors

# Step 7: Tailwind build
# → npx tailwindcss build src/app/globals.css -o /tmp/test.css
# → Should produce valid CSS with all custom properties
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "F01: Design system — CSS tokens, Tailwind config, fonts, root layout, types"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F01*
