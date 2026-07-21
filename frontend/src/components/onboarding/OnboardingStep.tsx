"use client"

import Image from "next/image"
import { Check, X, ArrowRight, ImageIcon, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { orgName } from "@/lib/constants"
import { EntityChip } from "@/components/chat/EntityChip"
import { ConfidenceBadge } from "@/components/chat/ConfidenceBadge"

export interface StepContent {
  id: number
  title: string
  subtitle: string
  render: () => React.ReactNode
}

/**
 * Renders the content of a single onboarding step.
 * Each step has a unique layout defined in its own render function.
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
    title: "Welcome to AEGIS",
    subtitle: "Your SAP support assistant",
    render: () => (
      <div className="space-y-5">
        {/* Logo mark */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-lg">
            <Image
              src="/logo.svg"
              alt={orgName}
              width={36}
              height={36}
              className="object-contain brightness-0 invert"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
        </div>

        <p className="text-sm text-text-secondary text-center leading-relaxed max-w-xs mx-auto">
          AEGIS answers your SAP questions instantly using {orgName}&apos;s verified internal
          documentation — error guides, procedures, and configuration references.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Can do */}
          <div className="surface-sunken rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-success uppercase tracking-wider">What AEGIS helps with</p>
            {[
              "SAP error codes (VL150, F5201...)",
              "Transaction procedures (VL01N...)",
              "System configuration",
              "Step-by-step workflows",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-xs text-text-secondary leading-snug">{item}</span>
              </div>
            ))}
          </div>

          {/* Cannot do */}
          <div className="surface-sunken rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              What AEGIS cannot do
            </p>
            {["Execute SAP transactions", "Access live SAP data", "Provide legal advice", "Make system changes"].map(
              (item) => (
                <div key={item} className="flex items-start gap-2">
                  <X className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-xs text-text-tertiary leading-snug">{item}</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    ),
  },

  // ── STEP 2: How to ask ────────────────────────────────────────
  {
    id: 1,
    title: "How to ask",
    subtitle: "Better questions get better answers",
    render: () => (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed text-center">
          Include the error code, the transaction you were using, and what you were trying to do.
        </p>

        {/* Good examples */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-success uppercase tracking-wider">Good question examples</p>
          {[
            { text: "How do I fix ", code: "VL150", rest: " when creating delivery in ", code2: "VL01N", rest2: "?" },
            { text: "What causes the ", code: "F5201", rest: " billing error and how do I resolve it?", code2: null, rest2: null },
            { text: "How do I check unrestricted stock using ", code: "MMBE", rest: "?", code2: null, rest2: null },
          ].map((example, i) => (
            <div key={i} className="surface-card px-3 py-2.5 rounded-xl text-sm text-text-primary">
              {example.text}
              <EntityChip type="error_code" value={example.code} showTooltip={false} />
              {example.rest}
              {example.code2 && <EntityChip type="tcode" value={example.code2} showTooltip={false} />}
              {example.rest2}
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="space-y-2 pt-1">
          {[
            "Be specific — mention the exact error code",
            "Mention what transaction you were using",
            "Describe what you were trying to do",
          ].map((tip) => (
            <div key={tip} className="flex items-start gap-2">
              <ArrowRight className="w-3 h-3 text-accent shrink-0 mt-0.5" aria-hidden="true" />
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
    title: "Understanding responses",
    subtitle: "Confidence tells you how reliable the answer is",
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
              The answer is strongly supported by verified SAP documentation. You can trust this
              answer.
            </p>
          </div>

          {/* Amber */}
          <div className="surface-card rounded-xl p-4 space-y-2 border-l-4 border-l-warning">
            <ConfidenceBadge badge="amber" showTooltip={false} />
            <p className="text-sm font-medium text-text-primary">Moderate confidence</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              Proceed carefully — check the source document reference shown below the response to
              verify the steps apply to your situation.
            </p>
          </div>

          {/* None */}
          <div className="surface-card rounded-xl p-4 space-y-2 border-l-4 border-l-danger">
            <ConfidenceBadge badge="none" showTooltip={false} />
            <p className="text-sm font-medium text-text-primary">Insufficient</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              AEGIS could not find a reliable answer. Your question has been automatically
              escalated to IT for review.
            </p>
          </div>
        </div>
      </div>
    ),
  },

  // ── STEP 4: Screenshots ───────────────────────────────────────
  {
    id: 3,
    title: "Attach SAP screenshots",
    subtitle: "Show AEGIS the exact error screen",
    render: () => (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed text-center">
          AEGIS can analyse your SAP screenshot and provide more accurate, context-aware answers.
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
            <span className="font-medium">Supported:</span> PNG, JPG — up to 10MB. This feature is
            optional — you can always describe the error in text instead.
          </p>
        </div>
      </div>
    ),
  },

  // ── STEP 5: Ready ─────────────────────────────────────────────
  {
    id: 4,
    title: "You're ready to start",
    subtitle: "Ask your first question",
    render: () => (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary text-center leading-relaxed">
          Try one of these common questions, or type your own.
        </p>

        {/* Starter question chips */}
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            "How do I fix VL150 in VL01N?",
            "What is the current FI posting period?",
            "How do I create a YDSA agreement?",
            "How do I check stock with MMBE?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full",
                "bg-bg-secondary border border-border-primary text-text-secondary",
                "hover:bg-bg-tertiary hover:text-text-primary hover:border-border-secondary",
                "transition-all duration-[var(--duration-normal)]",
                "active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              )}
              aria-label={`Start with: ${q}`}
              // Click handler set in OnboardingModal (calls onComplete + starts chat)
              data-starter-question={q}
            >
              {q}
            </button>
          ))}
        </div>

        <p className="text-xs text-text-tertiary text-center">
          You can re-open this walkthrough anytime from the{" "}
          <span className="font-medium text-text-secondary">command palette (⌘K)</span>
        </p>
      </div>
    ),
  },
]
