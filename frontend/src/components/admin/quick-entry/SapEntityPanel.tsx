"use client"

import { useMemo } from "react"
import type { QuickEntryContentType, ErrorGuideFormData, ProcedureFormData } from "@/types"

interface Props {
  entities: { t_codes: string[]; error_codes: string[] }
  contentType: QuickEntryContentType
  formData: object
  documentId: string
  module: string
  onChunkPreview: () => void
}

function estimateChunkCount(contentType: QuickEntryContentType, formData: object): number {
  if (contentType === "config") return 2
  if (contentType === "error_guide") {
    const causes = (formData as Partial<ErrorGuideFormData>).causes ?? []
    const activeCauses = causes.filter((c) => !c.cause_obsolete).length
    return 1 + Math.max(1, activeCauses)
  }
  if (contentType === "procedure") {
    const stepCount = (formData as Partial<ProcedureFormData>).steps?.length ?? 0
    const batches = Math.ceil(stepCount / 5)
    return 1 + Math.max(1, batches)
  }
  return 0
}

export function SapEntityPanel({ entities, contentType, formData, documentId, module, onChunkPreview }: Props) {
  const chunkCount = useMemo(() => estimateChunkCount(contentType, formData), [contentType, formData])

  return (
    <div className="px-4 py-4 space-y-5">
      <div>
        <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-2">Live detection</p>

        <div className="mb-3">
          <p className="text-[10px] text-text-tertiary mb-1">SAP T-codes found:</p>
          {entities.t_codes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entities.t_codes.map((code) => (
                <span key={code} className="text-[10px] font-mono bg-accent-subtle text-accent px-1.5 py-0.5 rounded">
                  {code}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-text-tertiary italic">None detected yet — name T-codes in your fields</p>
          )}
        </div>

        <div>
          <p className="text-[10px] text-text-tertiary mb-1">Error codes found:</p>
          {entities.error_codes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entities.error_codes.map((code) => (
                <span key={code} className="text-[10px] font-mono bg-bg-tertiary text-text-primary px-1.5 py-0.5 rounded">
                  {code}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-text-tertiary italic">None detected</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1">Chunks to be created</p>
        <p className="text-2xl font-semibold text-text-primary">{chunkCount}</p>
        <p className="text-[10px] text-text-tertiary">
          {contentType === "error_guide" && "1 overview + 1 per cause"}
          {contentType === "procedure" && "1 overview + batches of 5 steps"}
          {contentType === "config" && "always 2 (overview + values)"}
        </p>
      </div>

      <button
        onClick={onChunkPreview}
        disabled={!documentId || !module}
        className="w-full text-xs text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed text-left"
      >
        Preview indexed chunks →
      </button>

      {module && (
        <p className="text-[10px] text-text-tertiary">
          Module: <span className="font-medium text-text-primary">{module}</span>
        </p>
      )}
    </div>
  )
}
