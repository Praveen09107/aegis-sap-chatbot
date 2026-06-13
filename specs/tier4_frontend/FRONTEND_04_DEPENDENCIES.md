# FRONTEND_04: DEPENDENCIES
## Complete Package Setup — Install This Before Any Other Session
## Run This Before Sessions F01–F18

---

## AGENT INSTRUCTIONS FOR THIS SESSION

This document is the **first thing to execute** before any frontend code is written.
All package versions are pinned. Do not upgrade unless AEGIS_MASTER_REFERENCE specifies otherwise.

**What this session creates:**
- `frontend/package.json` — complete with all pinned dependencies
- `frontend/postcss.config.js` — PostCSS configuration
- `frontend/.eslintrc.json` — ESLint configuration
- Installed node_modules
- Initialized shadcn/ui with `components.json`
- All shadcn/ui base components installed in `src/components/ui/`

---

## STEP 1: Create the Project (if starting fresh)

```bash
# From the monorepo root (same level as backend/)
npx create-next-app@15.0.3 frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git

cd frontend
```

**If the frontend directory already exists** (scaffolded separately), skip create-next-app and go directly to Step 2.

---

## FILE 1: frontend/package.json (COMPLETE — EXACT VERSIONS)

Replace the auto-generated package.json entirely with this:

```json
{
  "name": "aegis-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",

    "framer-motion": "11.11.11",
    "zustand": "4.5.5",
    "@tanstack/react-query": "5.59.20",
    "@tanstack/react-query-devtools": "5.59.20",

    "cmdk": "1.0.0",
    "sonner": "1.5.0",
    "next-themes": "0.3.0",

    "recharts": "2.13.0",

    "@dnd-kit/core": "6.1.0",
    "@dnd-kit/sortable": "8.0.0",
    "@dnd-kit/utilities": "3.2.2",

    "react-hook-form": "7.53.2",
    "zod": "3.23.8",
    "@hookform/resolvers": "3.9.1",

    "@react-pdf/renderer": "3.4.5",

    "date-fns": "3.6.0",
    "lucide-react": "0.460.0",

    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "tailwind-merge": "2.5.4",
    "tailwindcss-animate": "1.0.7",

    "@radix-ui/react-alert-dialog": "1.1.2",
    "@radix-ui/react-avatar": "1.1.1",
    "@radix-ui/react-checkbox": "1.1.2",
    "@radix-ui/react-dialog": "1.1.2",
    "@radix-ui/react-dropdown-menu": "2.1.2",
    "@radix-ui/react-label": "2.1.0",
    "@radix-ui/react-popover": "1.1.2",
    "@radix-ui/react-progress": "1.1.0",
    "@radix-ui/react-scroll-area": "1.2.0",
    "@radix-ui/react-select": "2.1.2",
    "@radix-ui/react-separator": "1.1.0",
    "@radix-ui/react-slot": "1.1.0",
    "@radix-ui/react-switch": "1.1.0",
    "@radix-ui/react-tabs": "1.1.0",
    "@radix-ui/react-toast": "1.2.2",
    "@radix-ui/react-tooltip": "1.1.3"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/node": "22.8.1",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",

    "tailwindcss": "3.4.14",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "@tailwindcss/typography": "0.5.15",

    "eslint": "8.57.1",
    "eslint-config-next": "15.0.3"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

---

## STEP 2: Install All Dependencies

```bash
cd frontend

# Clear any existing node_modules and lock file
rm -rf node_modules package-lock.json

# Install all dependencies from package.json
npm install

# Verify installation succeeded
npm ls --depth=0 2>/dev/null | head -40
```

**Expected output:** All packages listed without `UNMET DEPENDENCY` warnings.

---

## FILE 2: frontend/postcss.config.js

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

## FILE 3: frontend/.eslintrc.json

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "react/no-unescaped-entities": "off",
    "@next/next/no-img-element": "warn"
  }
}
```

---

## STEP 3: Initialize shadcn/ui

```bash
cd frontend

# Initialize shadcn/ui (answer prompts as shown below)
npx shadcn@latest init
```

**When prompted, answer:**
```
Which style would you like to use? → Default
Which color would you like to use as base color? → Slate
Where is your global CSS file? → src/app/globals.css
Do you want to use CSS variables for colors? → Yes
Where is your tailwind.config.js located? → tailwind.config.js
Configure the import alias for components: → @/components
Configure the import alias for utils: → @/lib/utils
Are you using React Server Components? → Yes
Write configuration to components.json. Proceed? → Yes
```

**Verify components.json was created** (content should match FRONTEND_02_ARCHITECTURE.md FILE 10).

---

## STEP 4: Install All shadcn/ui Components

Run these commands in order. Each installs one or more components into `src/components/ui/`:

```bash
cd frontend

# Core interactive components
npx shadcn@latest add button
npx shadcn@latest add badge
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add textarea
npx shadcn@latest add label
npx shadcn@latest add separator

# Overlay components
npx shadcn@latest add dialog
npx shadcn@latest add alert-dialog
npx shadcn@latest add sheet
npx shadcn@latest add popover
npx shadcn@latest add tooltip
npx shadcn@latest add dropdown-menu

# Form components
npx shadcn@latest add select
npx shadcn@latest add checkbox
npx shadcn@latest add switch
npx shadcn@latest add progress

# Data display components
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add scroll-area
npx shadcn@latest add avatar
npx shadcn@latest add skeleton

# Special components
npx shadcn@latest add command
npx shadcn@latest add toast
```

**If shadcn asks about overwriting files, answer `y` (yes) to overwrite.**

---

## STEP 5: Verify All Components Installed

```bash
ls src/components/ui/
```

**Expected output (all files present):**
```
alert-dialog.tsx
avatar.tsx
badge.tsx
button.tsx
card.tsx
checkbox.tsx
command.tsx
dialog.tsx
dropdown-menu.tsx
input.tsx
label.tsx
popover.tsx
progress.tsx
scroll-area.tsx
select.tsx
separator.tsx
sheet.tsx
skeleton.tsx
switch.tsx
table.tsx
tabs.tsx
textarea.tsx
toast.tsx
tooltip.tsx
```

---

## STEP 6: Apply AEGIS Customizations to shadcn Components

The shadcn-installed components use generic Slate color variables. These need to be overridden to use our AEGIS token system. Replace the content of each file listed below.

### src/components/ui/button.tsx (OVERRIDE — AEGIS VARIANT SYSTEM)

```typescript
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium text-sm',
    'rounded-lg',
    'whitespace-nowrap select-none',
    'transition-all',
    'duration-[var(--duration-normal)]',
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-border-focus',
    'focus-visible:ring-offset-2',
    'focus-visible:ring-offset-bg-primary',
    'disabled:pointer-events-none',
    'disabled:opacity-50',
    'active:scale-[0.98]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-accent text-white shadow-sm',
          'hover:bg-accent-hover',
          'active:bg-accent-pressed',
        ].join(' '),
        destructive: [
          'bg-danger text-white shadow-sm',
          'hover:bg-danger/90',
        ].join(' '),
        outline: [
          'border border-border-primary bg-transparent',
          'text-text-primary',
          'hover:bg-bg-secondary',
          'hover:border-border-secondary',
        ].join(' '),
        secondary: [
          'bg-bg-tertiary text-text-primary',
          'border border-border-primary',
          'hover:bg-bg-secondary',
        ].join(' '),
        ghost: [
          'text-text-secondary bg-transparent',
          'hover:bg-bg-secondary hover:text-text-primary',
        ].join(' '),
        link: [
          'text-accent underline-offset-4 h-auto px-0',
          'hover:underline hover:text-accent-hover',
          'active:scale-100',
        ].join(' '),
        success: [
          'bg-success-bg text-success-text',
          'border border-success-border',
          'hover:bg-success/10',
        ].join(' '),
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs rounded-md',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9 rounded-lg p-0',
        'icon-sm': 'h-7 w-7 rounded-md p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

### src/components/ui/badge.tsx (OVERRIDE — AEGIS SEMANTIC VARIANTS)

```typescript
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
  {
    variants: {
      variant: {
        // Default (neutral)
        default: 'bg-bg-tertiary text-text-secondary border-border-primary text-xs px-2.5 py-0.5',
        outline: 'bg-transparent text-text-primary border-border-secondary text-xs px-2.5 py-0.5',

        // Confidence system (AEGIS core semantic colors — never use decoratively)
        success: 'bg-success-bg text-success-text border-success-border text-xs px-2.5 py-0.5',
        warning: 'bg-warning-bg text-warning-text border-warning-border text-xs px-2.5 py-0.5',
        danger:  'bg-danger-bg  text-danger-text  border-danger-border  text-xs px-2.5 py-0.5',

        // Info and mode colors
        info:    'bg-info-bg    text-info-text    border-info-border    text-xs px-2.5 py-0.5',
        purple:  'bg-purple-bg  text-purple-text  border-purple-border  text-xs px-2.5 py-0.5',

        // Document status (admin portal)
        active:      'bg-success-bg  text-success-text  border-success-border  text-xs px-2.5 py-0.5',
        deprecated:  'bg-bg-tertiary text-text-tertiary  border-border-primary  text-xs px-2.5 py-0.5',
        processing:  'bg-info-bg     text-info-text      border-info-border     text-xs px-2.5 py-0.5',
        failed:      'bg-danger-bg   text-danger-text    border-danger-border   text-xs px-2.5 py-0.5',
        pending:     'bg-warning-bg  text-warning-text   border-warning-border  text-xs px-2.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full shrink-0',
            variant === 'success' || variant === 'active'
              ? 'bg-success'
              : variant === 'warning' || variant === 'pending'
              ? 'bg-warning'
              : variant === 'danger' || variant === 'failed'
              ? 'bg-danger'
              : variant === 'info' || variant === 'processing'
              ? 'bg-info'
              : 'bg-text-tertiary'
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
```

### src/components/ui/input.tsx (OVERRIDE — AEGIS STYLING)

```typescript
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  errorMessage?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, errorMessage, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            'flex h-10 w-full rounded-lg border px-3 py-2',
            'bg-bg-secondary text-sm text-text-primary',
            'placeholder:text-text-tertiary',
            'transition-colors duration-[var(--duration-normal)]',
            'focus-visible:outline-none',
            'focus-visible:border-border-focus',
            'focus-visible:ring-1 focus-visible:ring-border-focus',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
            error
              ? 'border-danger-border focus-visible:border-danger focus-visible:ring-danger'
              : 'border-border-primary',
            className
          )}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        />
        {error && errorMessage && (
          <p className="mt-1.5 text-xs text-danger-text" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
```

### src/components/ui/skeleton.tsx (OVERRIDE — AEGIS SHIMMER)

```typescript
import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rounded pill shape — useful for badge placeholders */
  pill?: boolean
  /** Circle shape — useful for avatar placeholders */
  circle?: boolean
}

function Skeleton({ className, pill, circle, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-bg-tertiary',
        pill ? 'rounded-full' : circle ? 'rounded-full' : 'rounded-md',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

/**
 * Shimmer variant with gradient sweep animation.
 * Use for skeleton loading states that need more visual activity.
 */
function SkeletonShimmer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'shimmer rounded-md',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton, SkeletonShimmer }
```

### src/components/ui/card.tsx (OVERRIDE — AEGIS CARD SYSTEM)

```typescript
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva(
  'rounded-xl border text-text-primary transition-shadow',
  {
    variants: {
      variant: {
        default:  'bg-bg-card border-border-primary shadow-sm',
        elevated: 'bg-bg-card border-border-primary shadow-md',
        ghost:    'bg-transparent border-transparent shadow-none',
        sunken:   'bg-bg-sunken border-border-primary shadow-none',
        accent:   'bg-accent-subtle border-border-focus shadow-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5 p-4 pb-0', className)}
      {...props}
    />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-semibold leading-tight text-text-primary', className)}
      {...props}
    >
      {children}
    </h3>
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-text-secondary leading-relaxed', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center p-4 pt-0', className)}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
```

---

## STEP 7: Verify shadcn/ui Installation

```bash
cd frontend

# Check lib/utils.ts was created by shadcn
cat src/lib/utils.ts
# Expected: contains `cn` function using clsx + tailwind-merge

# Check components.json is correct
cat components.json | grep '"style"'
# Expected: "style": "default"

# Attempt build to catch any immediate errors
npm run build 2>&1 | tail -20
# Expected: Compilation completed (may show route list)
```

---

## STEP 8: Install Additional Required Packages

Some packages aren't available through shadcn and must be installed separately:

```bash
cd frontend

# PDF rendering (session export)
npm install @react-pdf/renderer@3.4.5

# Drag and drop (kanban tickets page)
npm install @dnd-kit/core@6.1.0 @dnd-kit/sortable@8.0.0 @dnd-kit/utilities@3.2.2

# Chart library (admin analytics)
npm install recharts@2.13.0

# Date utilities
npm install date-fns@3.6.0

# Toast notifications (already installed as dependency of shadcn, verify it exists)
npm ls sonner

# Animation library
npm install framer-motion@11.11.11

# State management
npm install zustand@4.5.5

# Server state / polling
npm install @tanstack/react-query@5.59.20 @tanstack/react-query-devtools@5.59.20

# Command palette
npm install cmdk@1.0.0

# Form validation
npm install react-hook-form@7.53.2 zod@3.23.8 @hookform/resolvers@3.9.1

# Theme management
npm install next-themes@0.3.0

# Icon library (should already be installed by shadcn)
npm ls lucide-react
```

---

## STEP 9: Full Verification

```bash
cd frontend

# 1. TypeScript: zero errors
npx tsc --noEmit
echo "TypeScript: $?"
# Expected: TypeScript: 0

# 2. ESLint: no blocking errors
npx next lint
# Expected: No ESLint errors (warnings are acceptable)

# 3. Build: completes without errors
npm run build
# Expected: Build succeeds

# 4. Development server: starts
npm run dev &
DEV_PID=$!
sleep 6
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# Expected: 200

kill $DEV_PID
```

---

## PACKAGE PURPOSE REFERENCE

| Package | Purpose | Used in |
|---|---|---|
| `next` | App framework, routing, API routes | Everywhere |
| `react`, `react-dom` | UI rendering | Everywhere |
| `framer-motion` | Page transitions, component animations | All animated components |
| `zustand` | Client-side UI state (chat, panels, admin) | All interactive pages |
| `@tanstack/react-query` | Server state, 30s admin polling | Admin pages, session history |
| `cmdk` | Command palette (⌘K) | CommandPalette component |
| `sonner` | Toast notifications | ToastProvider, api.ts |
| `recharts` | Admin dashboard charts, analytics | Admin dashboard, analytics |
| `@dnd-kit/*` | Kanban drag-and-drop (tickets page) | KanbanBoard component |
| `react-hook-form` | Admin forms (registry, config, review) | Admin form pages |
| `zod` | Schema validation for all forms | Form schemas |
| `@react-pdf/renderer` | Session PDF export | sessionExport.ts |
| `date-fns` | Date formatting, relative time | Session sidebar, audit trail |
| `next-themes` | Dark/light mode toggle system | ThemeProvider |
| `lucide-react` | Icon set used throughout UI | All components |
| `class-variance-authority` | Variant-based component styling | All UI components |
| `clsx` + `tailwind-merge` | Class merging utility (cn function) | Every component |
| `tailwindcss-animate` | CSS animation utilities via Tailwind | Animation classes |
| `@tailwindcss/typography` | Prose styling for text content | Chat message content |
| `@radix-ui/*` | Accessible headless UI primitives | via shadcn/ui components |

---

## TROUBLESHOOTING

**Issue: `npx shadcn@latest` fails or uses wrong version**
```bash
npx shadcn@2.1.6 init  # Pin to specific shadcn version
```

**Issue: `@react-pdf/renderer` canvas error during build**
```bash
# Ensure next.config.js has:
# webpack: (config) => { config.resolve.alias.canvas = false; return config }
```

**Issue: `framer-motion` causes "ReactDOM.render is no longer supported" warning**
```bash
# Framer Motion 11 requires React 18 — verify react version:
npm ls react | grep react@
```

**Issue: Tailwind classes not applying in dark mode**
```bash
# Ensure darkMode: ['class'] is in tailwind.config.js
# Ensure next-themes ThemeProvider has attribute="class"
```

**Issue: cmdk has TypeScript errors**
```bash
# cmdk 1.0.0 requires TypeScript 5+
npm ls typescript
```

---

## COMMIT

```bash
cd frontend
git add -A
git commit -m "F04: Dependencies — package.json, shadcn/ui initialized, all components installed"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F04 (run before F01)*
