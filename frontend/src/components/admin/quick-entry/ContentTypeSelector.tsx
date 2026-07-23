import { FileText, List, Settings, HelpCircle } from "lucide-react"
import type { QuickEntryContentType } from "@/types"
import { orgName } from "@/lib/constants"

interface TypeOption {
  type: QuickEntryContentType
  label: string
  description: string
  when: string
  icon: typeof FileText
}

interface Props {
  onSelect: (type: QuickEntryContentType) => void
  onShowOnboarding: () => void
}

export function ContentTypeSelector({ onSelect, onShowOnboarding }: Props) {
  const TYPE_OPTIONS: TypeOption[] = [
    {
      type: "error_guide",
      label: "Error Guide",
      description: "Document an SAP error with its causes and resolution steps",
      when: "An employee sees an error code or unexpected message in SAP",
      icon: FileText,
    },
    {
      type: "procedure",
      label: "Procedure",
      description: "Step-by-step instructions for completing an SAP task",
      when: "An employee needs to perform a specific business process in SAP",
      icon: List,
    },
    {
      type: "config",
      label: "Config Reference",
      description: `Current values of SAP configuration settings at ${orgName}`,
      when: "An employee needs to know the current settings, rates, or codes configured in SAP",
      icon: Settings,
    },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-10">
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h2 className="text-lg font-semibold text-text-primary mb-1">What type of knowledge are you adding?</h2>
          <p className="text-sm text-text-tertiary">Choose the template that best fits the information.</p>
        </div>

        <div className="flex flex-col gap-3">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.type}
                onClick={() => onSelect(opt.type)}
                className="flex items-start gap-4 p-4 rounded-xl border border-border-primary bg-bg-card hover:bg-bg-secondary hover:border-border-focus text-left transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0 group-hover:bg-accent-subtle">
                  <Icon className="w-4 h-4 text-text-tertiary group-hover:text-accent" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary mb-0.5">{opt.label}</p>
                  <p className="text-xs text-text-tertiary mb-1">{opt.description}</p>
                  <p className="text-[10px] text-text-tertiary">
                    <span className="font-medium">Use when:</span> {opt.when}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={onShowOnboarding}
          className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary mt-6 mx-auto"
        >
          <HelpCircle className="w-3 h-3" aria-hidden="true" />
          See example entries for each type
        </button>
      </div>
    </div>
  )
}
