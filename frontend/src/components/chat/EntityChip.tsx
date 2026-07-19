"use client"

import { cn } from "@/lib/utils"
import type { SAPEntityType } from "@/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface EntityChipProps {
  type: SAPEntityType
  value: string
  /** Whether to show a tooltip explaining the entity type. Default: true */
  showTooltip?: boolean
  className?: string
}

const ENTITY_CONFIG: Record<SAPEntityType, { label: string; className: string; description: string }> = {
  error_code: {
    label: "Error",
    description: "SAP error code — click to search for solutions",
    className: "bg-danger-bg border-danger-border text-danger-text",
  },
  tcode: {
    label: "T-Code",
    description: "SAP transaction code — entry point for a workflow",
    className: "bg-info-bg border-info-border text-info-text",
  },
  doc_number: {
    label: "Doc",
    description: "SAP document number — purchase order, delivery, or invoice",
    className: "bg-bg-tertiary border-border-primary text-text-secondary",
  },
}

/**
 * SAP entity chip — renders colored monospace identifier chips. Used
 * inside SAPEntityHighlighter to replace detected SAP codes in text.
 *
 * Error codes: danger colors (VL150, F5201)
 * Transaction codes: info colors (VL01N, MM02)
 * Document numbers: neutral colors (4500012345)
 *
 * @example
 * <EntityChip type="error_code" value="VL150" />
 * <EntityChip type="tcode" value="VL01N" showTooltip={false} />
 */
export function EntityChip({ type, value, showTooltip = true, className }: EntityChipProps) {
  const config = ENTITY_CONFIG[type]

  const chip = (
    <span
      className={cn("chip-base", config.className, "transition-opacity duration-100", "hover:opacity-80", className)}
      role="mark"
      aria-label={`SAP ${config.label}: ${value}`}
    >
      {value}
    </span>
  )

  if (!showTooltip) return chip

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="bg-bg-card border border-border-primary text-text-primary text-xs max-w-[200px]">
          <p className="font-semibold">
            {config.label}: {value}
          </p>
          <p className="text-text-secondary mt-0.5">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
