"use client"

import { useState } from "react"
import { X, FileText, List, Settings, ChevronRight, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { orgName } from "@/lib/constants"

export function QuickEntryOnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)

  const STEPS = [
    {
      title: "What is Quick Entry?",
      content: (
        <div className="space-y-3 text-sm text-text-tertiary">
          <p>Quick Entry lets you add SAP knowledge directly through a structured form — no Word document or PDF required.</p>
          <p>The system automatically structures your input into optimised knowledge chunks that AEGIS searches when employees ask questions.</p>
          <p className="text-xs font-medium text-text-primary">Three entry types are available:</p>
          <ul className="space-y-1.5">
            {[
              { Icon: FileText, label: "Error Guide", desc: "For SAP errors with causes and resolution steps" },
              { Icon: List, label: "Procedure", desc: "Step-by-step instructions for SAP tasks" },
              { Icon: Settings, label: "Config Reference", desc: `Current configuration values at ${orgName}` },
            ].map(({ Icon, label, desc }) => (
              <li key={label} className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <span className="font-medium text-text-primary">{label}</span> — {desc}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      title: "Tips for the best results",
      content: (
        <div className="space-y-2.5 text-sm text-text-tertiary">
          {[
            "Always name the exact T-code and field in resolution steps",
            'Use "NONE" checkboxes only when genuinely not applicable — do not leave required fields blank',
            "Screenshots attached to a cause block are returned to employees alongside the answer",
            "Check the chunk preview before submitting to see exactly what AEGIS will index",
            "Config entries have review dates — confirm values are current when notified",
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-accent-subtle text-accent text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      ),
    },
  ]

  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={STEPS[step].title}>
      <div className="w-full max-w-md bg-bg-secondary rounded-xl shadow-2xl border border-border-primary overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <p className="text-sm font-semibold text-text-primary">{STEPS[step].title}</p>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 min-h-[200px]">{STEPS[step].content}</div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border-primary bg-bg-card">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={"w-1.5 h-1.5 rounded-full transition-colors " + (i === step ? "bg-accent" : "bg-border-primary hover:bg-text-tertiary")}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" aria-hidden="true" />
                Back
              </button>
            )}
            {isLast ? (
              <Button variant="default" size="sm" onClick={onClose}>
                Get started
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
                <ChevronRight className="w-3 h-3 ml-1" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
