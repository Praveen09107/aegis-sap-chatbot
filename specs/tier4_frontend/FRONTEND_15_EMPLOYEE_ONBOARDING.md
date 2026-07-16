# FRONTEND_15: EMPLOYEE ONBOARDING
## 5-Step Guided Walkthrough — First-Time Employee Experience
## Session F09 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F09 Part 2: Employee onboarding flow.
Run after FRONTEND_14 in the same session.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/components/onboarding/
├── OnboardingModal.tsx      ← Modal wrapper, step navigation, progress tracking
├── OnboardingStep.tsx       ← Renders a single step's content
└── OnboardingProgress.tsx   ← Step dot indicator at top of modal
```

---

## ONBOARDING DESIGN

The onboarding is a **full-screen overlay modal** (not a small dialog) that appears
once for first-time employees. It occupies the full viewport with a semi-transparent
backdrop and a centred content card.

```
┌────────────────────────────────────────────────────────────────┐
│                                            [Skip for now]      │
│                                                                │
│                    ● ○ ○ ○ ○  (step 2 of 5)                    │
│                                                                │
│         ╔══════════════════════════════════════╗              │
│         ║                                      ║              │
│         ║   ┌──────┐                           ║              │
│         ║   │  A   │  Welcome to AEGIS          ║              │
│         ║   └──────┘  SAP Intelligence          ║              │
│         ║                                      ║              │
│         ║   AEGIS answers your SAP questions    ║              │
│         ║   instantly using Sona Comstar's...   ║              │
│         ║                                      ║              │
│         ║         [← Back]  [Next →]           ║              │
│         ╚══════════════════════════════════════╝              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Key design decisions:
- Backdrop does NOT close the modal (prevents accidental dismissal)
- Escape key does NOT close (same reason)
- "Skip for now" is always available in top-right
- Step card is max-width 520px, centred
- Step transitions: slide left (forward) / slide right (back) with Framer Motion
- Progress dots show step position
- Step 5 replaces "Next" with "Start using AEGIS"

---

## THE 5 STEPS — COMPLETE CONTENT

### Step 1: Welcome

```
Title:    Welcome to AEGIS
Subtitle: Your SAP support assistant

Content:
AEGIS answers your SAP questions instantly using Sona Comstar's
verified internal documentation — error guides, procedures, and
configuration references.

What AEGIS can help with:
✓ SAP error codes (VL150, F5201, ME001...)
✓ Transaction procedures (VL01N, MM02, FB50...)
✓ System configuration and settings
✓ Step-by-step workflows

What AEGIS cannot do:
✗ Execute SAP transactions on your behalf
✗ Access live SAP system data
✗ Provide legal or financial advice
```

### Step 2: How to ask

```
Title:    How to ask
Subtitle: Better questions get better answers

Content:
Include: the error code, the transaction you were using, and what
you were trying to do.

Good examples:
[Card] "How do I fix VL150 when creating delivery in VL01N?"
[Card] "What causes F5201 in billing and how do I resolve it?"
[Card] "How do I check unrestricted stock with MMBE?"

Tips:
→ Be specific — mention the error code exactly
→ Mention the module (SD, FI, MM) if you know it
→ Describe what you were doing when the error appeared
```

### Step 3: Understanding responses

```
Title:    Understanding responses
Subtitle: Confidence tells you how reliable the answer is

Content:
Every AEGIS response shows a confidence indicator:

[🟢 High confidence]
Answer is strongly supported by verified documentation.
Trust this answer — it's been validated.

[🟡 Moderate confidence]  
Proceed carefully — check the source document to confirm.
The documentation may partially match your situation.

[🔴 Insufficient]
AEGIS couldn't find a reliable answer.
Your question has been escalated to IT for review.

Tip: Always check the source document reference shown below each response.
```

### Step 4: Screenshot feature

```
Title:    Attach SAP screenshots
Subtitle: Show AEGIS the exact error screen

Content:
AEGIS can analyse your SAP screenshot and provide more accurate answers.

How to attach:
[Illustration: drag-drop icon]
Drag and drop a screenshot onto the chat area

— or —

Click the 📎 button in the message bar to browse for a file.

Supported: PNG, JPG — up to 10MB

This is optional — you can always describe the error in text instead.
AEGIS analyses error messages, field values, and system context from screenshots.
```

### Step 5: You're ready!

```
Title:    You're ready to start
Subtitle: Ask your first question

Content:
Try one of these to get started:

[Chip] "How do I fix the VL150 error in VL01N?"
[Chip] "What is the current posting period for FI?"
[Chip] "How do I create a YDSA scheduling agreement?"
[Chip] "How do I check stock with MMBE?"

Or type your own question below.

[Button] Start using AEGIS →
```

---

## FILE 1: src/components/onboarding/OnboardingProgress.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'

interface OnboardingProgressProps {
  totalSteps: number
  currentStep: number  // 0-indexed
  className?: string
}

/**
 * Step progress dots shown at the top of the onboarding modal.
 * Current step shows filled dot; others show empty dots.
 *
 * @example
 * <OnboardingProgress totalSteps={5} currentStep={1} />
 * // Renders: ● ○ ○ ○ ○   (step 2 of 5, 0-indexed)
 */
export function OnboardingProgress({
  totalSteps,
  currentStep,
  className,
}: OnboardingProgressProps) {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="tablist"
      aria-label={`Onboarding step ${currentStep + 1} of ${totalSteps}`}
    >
      {[...Array(totalSteps)].map((_, i) => (
        <span
          key={i}
          role="tab"
          aria-selected={i === currentStep}
          aria-label={`Step ${i + 1}`}
          className={cn(
            'rounded-full transition-all duration-[var(--duration-slow)]',
            i === currentStep
              ? 'w-5 h-2 bg-accent'   // active: wider pill shape
              : i < currentStep
              ? 'w-2 h-2 bg-accent/40' // completed: smaller, dimmed
              : 'w-2 h-2 bg-border-secondary', // upcoming: neutral
          )}
        />
      ))}
      <span className="ml-1 text-xs text-text-tertiary tabular-nums">
        {currentStep + 1} / {totalSteps}
      </span>
    </div>
  )
}
```

---

## FILE 2: src/components/onboarding/OnboardingStep.tsx (COMPLETE)

```typescript
'use client'

import Image from 'next/image'
import { Check, X, ArrowRight, ImageIcon, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EntityChip } from '@/components/chat/EntityChip'
import { ConfidenceBadge } from '@/components/chat/ConfidenceBadge'

export interface StepContent {
  id: number
  title: string
  subtitle: string
  render: () => React.ReactNode
}

/**
 * Renders the content of a single onboarding step.
 * Each step has a unique layout defined in its render function.
 */
export function OnboardingStep({ step }: { step: StepContent }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="text-center space-y-1.5">
        <h2 className="text-xl font-bold text-text-primary">{step.title}</h2>
        <p className="text-sm text-text-secondary">{step.subtitle}</p>
      </div>
      {/* Dynamic content */}
      <div>{step.render()}</div>
    </div>
  )
}

// ── Step content definitions ──────────────────────────────────

export const ONBOARDING_STEPS: StepContent[] = [
  // ── STEP 1: Welcome ──────────────────────────────────────────
  {
    id: 0,
    title: 'Welcome to AEGIS',
    subtitle: 'Your SAP support assistant',
    render: () => (
      <div className="space-y-5">
        {/* Logo mark */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-lg">
            <Image
              src="/logo.svg"
              alt="Sona Comstar"
              width={36}
              height={36}
              className="object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        </div>

        <p className="text-sm text-text-secondary text-center leading-relaxed max-w-xs mx-auto">
          AEGIS answers your SAP questions instantly using Sona Comstar&apos;s
          verified internal documentation — error guides, procedures, and
          configuration references.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Can do */}
          <div className="surface-sunken rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-success uppercase tracking-wider">
              What AEGIS helps with
            </p>
            {[
              'SAP error codes (VL150, F5201...)',
              'Transaction procedures (VL01N...)',
              'System configuration',
              'Step-by-step workflows',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                <span className="text-xs text-text-secondary leading-snug">{item}</span>
              </div>
            ))}
          </div>

          {/* Cannot do */}
          <div className="surface-sunken rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              What AEGIS cannot do
            </p>
            {[
              'Execute SAP transactions',
              'Access live SAP data',
              'Provide legal advice',
              'Make system changes',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <X className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                <span className="text-xs text-text-tertiary leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },

  // ── STEP 2: How to ask ────────────────────────────────────────
  {
    id: 1,
    title: 'How to ask',
    subtitle: 'Better questions get better answers',
    render: () => (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed text-center">
          Include the error code, the transaction you were using, and what you
          were trying to do.
        </p>

        {/* Good examples */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-success uppercase tracking-wider">
            Good question examples
          </p>
          {[
            { text: 'How do I fix ', code: 'VL150', rest: ' when creating delivery in ', code2: 'VL01N', rest2: '?' },
            { text: 'What causes the ', code: 'F5201', rest: ' billing error and how do I resolve it?', code2: null, rest2: null },
            { text: 'How do I check unrestricted stock using ', code: 'MMBE', rest: '?', code2: null, rest2: null },
          ].map((example, i) => (
            <div
              key={i}
              className="surface-card px-3 py-2.5 rounded-xl text-sm text-text-primary"
            >
              {example.text}
              <EntityChip type="error_code" value={example.code} showTooltip={false} />
              {example.rest}
              {example.code2 && (
                <EntityChip type="tcode" value={example.code2} showTooltip={false} />
              )}
              {example.rest2}
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="space-y-2 pt-1">
          {[
            'Be specific — mention the exact error code',
            'Mention what transaction you were using',
            'Describe what you were trying to do',
          ].map((tip) => (
            <div key={tip} className="flex items-start gap-2">
              <ArrowRight className="w-3 h-3 text-accent shrink-0 mt-0.5" />
              <span className="text-xs text-text-secondary">{tip}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // ── STEP 3: Understanding responses ──────────────────────────
  {
    id: 2,
    title: 'Understanding responses',
    subtitle: 'Confidence tells you how reliable the answer is',
    render: () => (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed text-center">
          Every AEGIS response shows a confidence indicator.
        </p>

        <div className="space-y-3">
          {/* Green */}
          <div className="surface-card rounded-xl p-4 space-y-2 border-l-4 border-l-success">
            <ConfidenceBadge badge="green" showTooltip={false} />
            <p className="text-sm font-medium text-text-primary">High confidence</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              The answer is strongly supported by verified SAP documentation.
              You can trust this answer.
            </p>
          </div>

          {/* Amber */}
          <div className="surface-card rounded-xl p-4 space-y-2 border-l-4 border-l-warning">
            <ConfidenceBadge badge="amber" showTooltip={false} />
            <p className="text-sm font-medium text-text-primary">Moderate confidence</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              Proceed carefully — check the source document reference shown below
              the response to verify the steps apply to your situation.
            </p>
          </div>

          {/* None */}
          <div className="surface-card rounded-xl p-4 space-y-2 border-l-4 border-l-danger">
            <ConfidenceBadge badge="none" showTooltip={false} />
            <p className="text-sm font-medium text-text-primary">Insufficient</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              AEGIS could not find a reliable answer. Your question has been
              automatically escalated to IT for review.
            </p>
          </div>
        </div>
      </div>
    ),
  },

  // ── STEP 4: Screenshots ───────────────────────────────────────
  {
    id: 3,
    title: 'Attach SAP screenshots',
    subtitle: 'Show AEGIS the exact error screen',
    render: () => (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed text-center">
          AEGIS can analyse your SAP screenshot and provide more accurate,
          context-aware answers.
        </p>

        {/* Methods */}
        <div className="grid grid-cols-2 gap-3">
          <div className="surface-sunken rounded-xl p-4 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-accent-subtle border border-border-focus/30 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Drag &amp; drop</p>
              <p className="text-xs text-text-tertiary mt-1">
                Drag a screenshot onto the chat area — a drop zone will appear
              </p>
            </div>
          </div>

          <div className="surface-sunken rounded-xl p-4 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-accent-subtle border border-border-focus/30 flex items-center justify-center">
              <Paperclip className="w-5 h-5 text-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">File picker</p>
              <p className="text-xs text-text-tertiary mt-1">
                Click the 📎 button in the message bar to browse for a file
              </p>
            </div>
          </div>
        </div>

        <div className="surface-sunken rounded-xl px-4 py-3">
          <p className="text-xs text-text-secondary text-center leading-relaxed">
            <span className="font-medium">Supported:</span> PNG, JPG — up to 10MB.
            This feature is optional — you can always describe the error in text instead.
          </p>
        </div>
      </div>
    ),
  },

  // ── STEP 5: Ready ─────────────────────────────────────────────
  {
    id: 4,
    title: "You're ready to start",
    subtitle: 'Ask your first question',
    render: () => (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary text-center leading-relaxed">
          Try one of these common questions, or type your own.
        </p>

        {/* Starter question chips */}
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            'How do I fix VL150 in VL01N?',
            'What is the current FI posting period?',
            'How do I create a YDSA agreement?',
            'How do I check stock with MMBE?',
          ].map((q) => (
            <button
              key={q}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-full',
                'bg-bg-secondary border border-border-primary text-text-secondary',
                'hover:bg-bg-tertiary hover:text-text-primary hover:border-border-secondary',
                'transition-all duration-[var(--duration-normal)]',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              )}
              aria-label={`Start with: ${q}`}
              // Note: click handler set in OnboardingModal (calls onComplete + starts chat)
              data-starter-question={q}
            >
              {q}
            </button>
          ))}
        </div>

        <p className="text-xs text-text-tertiary text-center">
          You can re-open this walkthrough anytime from the{' '}
          <span className="font-medium text-text-secondary">command palette (⌘K)</span>
        </p>
      </div>
    ),
  },
]
```

---

## FILE 3: src/components/onboarding/OnboardingModal.tsx (COMPLETE)

```typescript
'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OnboardingProgress } from './OnboardingProgress'
import { OnboardingStep, ONBOARDING_STEPS } from './OnboardingStep'
import { cn } from '@/lib/utils'
import { LIMITS } from '@/lib/constants'
import { useChatStore } from '@/stores/chatStore'

interface OnboardingModalProps {
  open: boolean
  onComplete: () => void
}

/**
 * Full-screen onboarding modal for first-time employees.
 *
 * State management:
 * - currentStep: 0-indexed step position
 * - direction: +1 (forward) / -1 (back) for slide animation
 *
 * Dismissal:
 * - "Skip for now" button → marks complete, closes
 * - "Start using AEGIS" on step 5 → marks complete, closes
 * - Backdrop click → does NOT close (prevent accidental dismissal)
 * - Escape key → does NOT close
 *
 * Starter question handling:
 * - On step 5, starter chips have data-starter-question attribute
 * - Clicking a chip: onComplete() + sends the question to chatStore
 */
export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const reducedMotion = useReducedMotion()
  const { setComposeValue } = useChatStore()

  const totalSteps = ONBOARDING_STEPS.length
  const step = ONBOARDING_STEPS[currentStep]
  const isLastStep = currentStep === totalSteps - 1

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setDirection(1)
      setCurrentStep((s) => s + 1)
    }
  }, [currentStep, totalSteps])

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1)
      setCurrentStep((s) => s - 1)
    }
  }, [currentStep])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  const handleFinish = useCallback(() => {
    onComplete()
  }, [onComplete])

  // Handle starter question chip click on step 5
  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const questionEl = target.closest('[data-starter-question]') as HTMLElement | null
      if (questionEl) {
        const question = questionEl.getAttribute('data-starter-question') ?? ''
        setComposeValue(question)
        onComplete()
      }
    },
    [onComplete, setComposeValue]
  )

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
    // Note: Escape intentionally does NOT close the modal
  }

  // Slide variants for step transitions
  const slideVariants = {
    enter: (dir: number) => ({
      x: reducedMotion ? 0 : dir * 40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: reducedMotion ? 0 : dir * -40,
      opacity: 0,
    }),
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop — does NOT close on click */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Skip button — always visible */}
      <button
        onClick={handleSkip}
        className={cn(
          'absolute top-4 right-4 z-modal+1',
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
          'text-xs font-medium text-white/70 hover:text-white',
          'hover:bg-white/10',
          'transition-all duration-[var(--duration-normal)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
        )}
        aria-label="Skip onboarding walkthrough"
      >
        <X className="w-3 h-3" />
        Skip for now
      </button>

      {/* Modal card */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg',
          'bg-bg-card border border-border-primary rounded-2xl shadow-xl',
          'overflow-hidden',
        )}
      >
        {/* Progress area */}
        <div className="flex items-center justify-center pt-5 pb-2">
          <OnboardingProgress totalSteps={totalSteps} currentStep={currentStep} />
        </div>

        {/* Step content with slide animation */}
        <div
          className="overflow-hidden px-6 pb-2"
          style={{ minHeight: 360 }}
          onClick={handleContentClick}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div id="onboarding-title" className="sr-only">
                Step {currentStep + 1} of {totalSteps}: {step.title}
              </div>
              <OnboardingStep step={step} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-primary">
          {/* Back button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={currentStep === 0}
            aria-label="Previous step"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          {/* Step label (centre) */}
          <span className="text-xs text-text-tertiary tabular-nums" aria-hidden="true">
            Step {currentStep + 1} of {totalSteps}
          </span>

          {/* Next / Finish button */}
          {isLastStep ? (
            <Button
              size="sm"
              onClick={handleFinish}
              className="gap-1.5"
              aria-label="Finish onboarding and start using AEGIS"
            >
              Start using AEGIS
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={goNext}
              aria-label="Next step"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## ONBOARDING STATE MANAGEMENT

### Storage

Onboarding completion is stored in localStorage (not backend) for simplicity.
Device-specific, which is acceptable — the walkthrough can be shown on a new device.

```typescript
// Read in (employee)/page.tsx:
const completed = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
if (!completed) setShowOnboarding(true)

// Written on complete:
function handleOnboardingComplete() {
  localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
  setShowOnboarding(false)
}
```

### Re-triggering onboarding

Users can re-open the walkthrough via the command palette:
```typescript
// In ONBOARDING_STEPS context, the "⌘K → Keyboard shortcuts" command palette
// has an item: "Restart walkthrough"
// This clears STORAGE_KEYS.ONBOARDING_COMPLETE and sets showOnboarding=true
// Implement in command palette's actions list (FRONTEND_07)
```

### Feature flag

Onboarding is controlled by the `NEXT_PUBLIC_ONBOARDING_ENABLED` feature flag:
```typescript
// In page.tsx (already implemented in FRONTEND_12):
if (!FEATURES.ONBOARDING) return  // skip onboarding check
```

---

## ACCESSIBILITY

```
aria-modal="true"                    → Screen reader knows this is a modal
aria-labelledby="onboarding-title"  → sr-only title element
role="dialog"                        → Correct semantic role
onKeyDown arrow navigation           → Keyboard step navigation
Focus trap: NOT implemented          → Trade-off: simpler UX, skip button is reachable
Note: Full focus trap would require a FocusTrap library — omitted for this scope
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Onboarding appears for first-time users
# → Clear localStorage: localStorage.removeItem('aegis:onboarding-complete')
# → Reload http://localhost:3000/
# → Onboarding modal should appear after 800ms delay

# Step 2: Step navigation works
# → Click "Next" → step 2 slides in from right
# → Click "Back" → step 1 slides in from left
# → Progress dots update correctly

# Step 3: Skip dismisses modal
# → Click "Skip for now"
# → Modal closes, chat is accessible
# → localStorage: aegis:onboarding-complete = "true"
# → Reload → onboarding does NOT appear again

# Step 4: Step 5 starter questions
# → Navigate to step 5 (the last step)
# → Click a starter question chip
# → Modal closes
# → Compose bar pre-filled with that question

# Step 5: "Start using AEGIS" on last step
# → Click button on step 5
# → Modal closes, localStorage flag set

# Step 6: Reduced motion
# → Enable "Reduce motion" in OS accessibility settings
# → Step transitions should be instant (no slide animation)

# Step 7: All step content renders correctly
# → Step 1: logo + two-column can/cannot grid
# → Step 2: entity chips visible in example questions
# → Step 3: three confidence badge cards with aura borders
# → Step 4: two method cards (drag-drop, file picker)
# → Step 5: starter question chips + finish button

# Step 8: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F09: Employee onboarding — 5-step modal with progress dots, step transitions, starter questions"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F09 (Part 2)*
