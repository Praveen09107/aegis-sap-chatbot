"use client"

import { GripVertical, Plus, X } from "lucide-react"
import type { ProcedureFormData, ProcedureStep, ProcedureStepType, CommonError, QuickEntryScreenshot } from "@/types"
import { PROCEDURE_STEP_TYPE_OPTIONS, SCREENSHOT_MAX_OVERALL } from "@/lib/constants"
import { batchSteps, type StepWithNumber } from "@/lib/chunkAssembler"
import { lacksSpecificity } from "@/lib/specificityCheck"
import { useCrossReferenceCheck } from "@/hooks/useCrossReferenceCheck"
import { ScreenshotUploadZone } from "./ScreenshotUploadZone"
import { FormField, TextArea, NoneCheckboxField } from "./FormFieldPrimitives"

interface Props {
  data: Partial<ProcedureFormData>
  onChange: (data: Partial<ProcedureFormData>) => void
  entryId: string | null
  screenshots: QuickEntryScreenshot[]
  isReadOnly: boolean
}

const MIN_STEPS = 3

function newStep(): ProcedureStep {
  return { action: "", step_type: "normal", specificity_acknowledged: false, screenshot_ids: [] }
}

function newCommonError(): CommonError {
  return { error_code: "", cause_summary: "", see_document_id: "", reference_validated: false }
}

export function ProcedureFormFields({ data, onChange, entryId, screenshots, isReadOnly }: Props) {
  const steps = data.steps ?? []
  const commonErrors = data.common_errors ?? []
  const noCommonErrors = commonErrors.length === 1 && commonErrors[0].error_code === "NONE"

  function updateField<K extends keyof ProcedureFormData>(key: K, value: ProcedureFormData[K]) {
    onChange({ ...data, [key]: value })
  }

  function updateStep(index: number, patch: Partial<ProcedureStep>) {
    onChange({ ...data, steps: steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  }

  function addStep() {
    onChange({ ...data, steps: [...steps, newStep()] })
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return
    onChange({ ...data, steps: steps.filter((_, i) => i !== index) })
  }

  function updateCommonError(index: number, patch: Partial<CommonError>) {
    onChange({ ...data, common_errors: commonErrors.map((e, i) => (i === index ? { ...e, ...patch } : e)) })
  }

  function addCommonError() {
    onChange({ ...data, common_errors: [...commonErrors.filter((e) => e.error_code !== "NONE"), newCommonError()] })
  }

  function removeCommonError(index: number) {
    if (commonErrors.length <= 1) return
    onChange({ ...data, common_errors: commonErrors.filter((_, i) => i !== index) })
  }

  function toggleNoCommonErrors(checked: boolean) {
    onChange({ ...data, common_errors: checked ? [{ ...newCommonError(), error_code: "NONE" }] : [newCommonError()] })
  }

  const numberedSteps: StepWithNumber[] = steps.map((s, i) => ({ ...s, step_number: i + 1 }))
  const branchErrors = validateBranchPairing(numberedSteps)
  const batches = batchSteps(numberedSteps)

  return (
    <div className="space-y-6">
      <FormField label="Procedure name" required hint="A short, specific name for this procedure">
        <input
          type="text"
          value={data.procedure_name ?? ""}
          onChange={(e) => updateField("procedure_name", e.target.value)}
          disabled={isReadOnly}
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
      </FormField>

      <FormField label="Purpose" required hint="What business outcome does this procedure achieve?">
        <TextArea value={data.purpose ?? ""} onChange={(v) => updateField("purpose", v)} rows={2} disabled={isReadOnly} />
      </FormField>

      <FormField label="When to use" required hint="What situation or trigger calls for this procedure?">
        <TextArea value={data.when_to_use ?? ""} onChange={(v) => updateField("when_to_use", v)} rows={2} disabled={isReadOnly} />
      </FormField>

      <NoneCheckboxField
        label="Data required beforehand"
        required
        hint="Information the employee needs on hand before starting"
        noneLabel="No data required beforehand"
        value={data.data_required ?? ""}
        onChange={(v) => updateField("data_required", v)}
        disabled={isReadOnly}
        multiline
      />

      <NoneCheckboxField
        label="System conditions"
        required
        hint="Any prerequisite state the system must be in first"
        noneLabel="No specific system conditions"
        value={data.system_conditions ?? ""}
        onChange={(v) => updateField("system_conditions", v)}
        disabled={isReadOnly}
        multiline
      />

      <FormField label="Access required" required hint="The SAP role or authorization needed to perform this procedure">
        <input
          type="text"
          value={data.access_required ?? ""}
          onChange={(e) => updateField("access_required", e.target.value)}
          disabled={isReadOnly}
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
      </FormField>

      <div>
        <p className="text-[10px] text-text-tertiary mb-1.5">Screenshots of the procedure&apos;s starting screen:</p>
        <ScreenshotUploadZone
          entryId={entryId}
          associatedSection="proc_overview"
          screenshots={screenshots.filter((s) => s.associated_section === "proc_overview")}
          isReadOnly={isReadOnly}
          maxScreenshots={SCREENSHOT_MAX_OVERALL}
        />
      </div>

      {/* Steps */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">
          Steps <span className="text-danger">*</span>
          {steps.length < MIN_STEPS && <span className="text-warning ml-2">(at least {MIN_STEPS} required)</span>}
        </p>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const branchError = branchErrors[index]
            return (
              <StepCard
                key={index}
                step={step}
                index={index}
                branchError={branchError}
                onUpdate={(patch) => updateStep(index, patch)}
                onRemove={() => removeStep(index)}
                canRemove={steps.length > 1}
                isReadOnly={isReadOnly}
              />
            )
          })}
        </div>
        {!isReadOnly && (
          <button onClick={addStep} className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:underline">
            <Plus className="w-3 h-3" aria-hidden="true" />
            Add step
          </button>
        )}

        {batches.length > 0 && (
          <div className="mt-4 space-y-3">
            {batches.map((batch, batchIdx) => {
              const section = `proc_steps_${batchIdx + 1}`
              const stepNums = batch.map((s) => s.step_number)
              const rangeLabel = stepNums.length === 1 ? `${stepNums[0]}` : `${stepNums[0]}–${stepNums[stepNums.length - 1]}`
              return (
                <div key={section}>
                  <p className="text-[10px] text-text-tertiary mb-1.5">Screenshots for steps {rangeLabel}:</p>
                  <ScreenshotUploadZone
                    entryId={entryId}
                    associatedSection={section}
                    screenshots={screenshots.filter((s) => s.associated_section === section)}
                    isReadOnly={isReadOnly}
                    maxScreenshots={2}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <FormField label="Verification" required hint="What confirms the procedure was completed successfully?">
        <TextArea value={data.verification ?? ""} onChange={(v) => updateField("verification", v)} rows={2} disabled={isReadOnly} />
      </FormField>

      {/* Common errors */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">
          Common errors during this procedure <span className="text-danger">*</span>
        </p>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={noCommonErrors}
            disabled={isReadOnly}
            onChange={(e) => toggleNoCommonErrors(e.target.checked)}
            className="rounded border-border-primary"
          />
          No common errors for this procedure
        </label>

        {!noCommonErrors && (
          <>
            <div className="space-y-3">
              {commonErrors.map((err, index) => (
                <CommonErrorCard
                  key={index}
                  error={err}
                  onUpdate={(patch) => updateCommonError(index, patch)}
                  onRemove={() => removeCommonError(index)}
                  canRemove={commonErrors.length > 1}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>
            {!isReadOnly && (
              <button onClick={addCommonError} className="mt-2 flex items-center gap-1.5 text-xs text-accent hover:underline">
                <Plus className="w-3 h-3" aria-hidden="true" />
                Add common error
              </button>
            )}
          </>
        )}
      </div>

      <NoneCheckboxField
        label="Plant / site notes"
        hint="Variations to this procedure at specific plants or sites"
        noneLabel="No plant-specific variations"
        value={data.plant_notes ?? ""}
        onChange={(v) => updateField("plant_notes", v)}
        disabled={isReadOnly}
        multiline
      />

      <FormField label="Additional notes" hint="Version-specific information, edge cases, known limitations">
        <TextArea value={data.notes ?? ""} onChange={(v) => updateField("notes", v)} rows={2} disabled={isReadOnly} />
      </FormField>
    </div>
  )
}

function StepCard({
  step,
  index,
  branchError,
  onUpdate,
  onRemove,
  canRemove,
  isReadOnly,
}: {
  step: ProcedureStep
  index: number
  branchError?: string
  onUpdate: (patch: Partial<ProcedureStep>) => void
  onRemove: () => void
  canRemove: boolean
  isReadOnly: boolean
}) {
  const showSpecWarning = lacksSpecificity(step.action, step.specificity_acknowledged)

  return (
    <div className="rounded-lg border border-border-primary bg-bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isReadOnly && <GripVertical className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />}
          <span className="text-xs font-semibold text-text-primary">Step {index + 1}</span>
        </div>
        {!isReadOnly && (
          <button onClick={onRemove} disabled={!canRemove} className="text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed" aria-label={`Remove step ${index + 1}`}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <select
        value={step.step_type}
        disabled={isReadOnly}
        onChange={(e) => onUpdate({ step_type: e.target.value as ProcedureStepType })}
        className="w-full h-8 px-2 text-xs rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
      >
        {PROCEDURE_STEP_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} title={opt.description}>
            {opt.label}
          </option>
        ))}
      </select>

      <TextArea value={step.action} onChange={(v) => onUpdate({ action: v, specificity_acknowledged: false })} rows={2} disabled={isReadOnly} placeholder="Exact action with T-code, field, and value" />

      {showSpecWarning && (
        <div className="p-2 rounded bg-warning-bg border border-warning-border">
          <p className="text-[10px] text-warning-text">
            ⚠ This step may lack specificity. Name the exact T-code, field, and value, or acknowledge and continue.
          </p>
          <button onClick={() => onUpdate({ specificity_acknowledged: true })} className="text-[10px] text-accent hover:underline mt-1">
            ✓ Acknowledge and continue
          </button>
        </div>
      )}

      {branchError && (
        <div className="p-2 rounded bg-danger-bg border border-danger-border">
          <p className="text-[10px] text-danger-text">⚠ {branchError}</p>
        </div>
      )}
    </div>
  )
}

function CommonErrorCard({
  error,
  onUpdate,
  onRemove,
  canRemove,
  isReadOnly,
}: {
  error: CommonError
  onUpdate: (patch: Partial<CommonError>) => void
  onRemove: () => void
  canRemove: boolean
  isReadOnly: boolean
}) {
  const { status, result } = useCrossReferenceCheck(error.see_document_id)

  return (
    <div className="rounded-lg border border-border-primary bg-bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={error.error_code}
          onChange={(e) => onUpdate({ error_code: e.target.value })}
          disabled={isReadOnly}
          placeholder="Error code (e.g. VL150)"
          className="flex-1 h-8 px-2 text-xs rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
        {!isReadOnly && (
          <button onClick={onRemove} disabled={!canRemove} className="text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <TextArea value={error.cause_summary} onChange={(v) => onUpdate({ cause_summary: v })} rows={2} disabled={isReadOnly} placeholder="What causes this error during the procedure?" />

      <div>
        <input
          type="text"
          value={error.see_document_id}
          onChange={(e) => onUpdate({ see_document_id: e.target.value, reference_validated: false })}
          disabled={isReadOnly}
          placeholder="Cross-reference document ID (optional)"
          className="w-full h-8 px-2 text-xs rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
        {error.see_document_id && status === "checking" && <p className="text-[10px] text-text-tertiary mt-1">Checking reference…</p>}
        {error.see_document_id && status === "done" && result?.exists && (
          <ReferenceValidatedNote title={result.title} onConfirm={() => onUpdate({ reference_validated: true })} confirmed={error.reference_validated} />
        )}
        {error.see_document_id && status === "done" && !result?.exists && <p className="text-[10px] text-danger mt-1">No entry or document found with that ID.</p>}
      </div>
    </div>
  )
}

function ReferenceValidatedNote({ title, confirmed, onConfirm }: { title: string | null; confirmed: boolean; onConfirm: () => void }) {
  if (confirmed) {
    return <p className="text-[10px] text-success mt-1">✓ Reference confirmed{title ? `: ${title}` : ""}</p>
  }
  return (
    <button onClick={onConfirm} className="text-[10px] text-accent hover:underline mt-1">
      ✓ Found{title ? `: ${title}` : ""} — confirm reference
    </button>
  )
}

/** Client-side mirror of form_validator.py's _validate_branch_pairing stack check. */
function validateBranchPairing(steps: StepWithNumber[]): Record<number, string> {
  const errors: Record<number, string> = {}
  const stack: number[] = []
  steps.forEach((step, i) => {
    if (step.step_type === "branch_start") {
      stack.push(i)
    } else if (step.step_type === "branch_end") {
      if (stack.length === 0) {
        errors[i] = "branch_end has no matching branch_start."
      } else {
        stack.pop()
      }
    }
  })
  for (const unclosedIndex of stack) {
    errors[unclosedIndex] = "branch_start has no matching branch_end."
  }
  return errors
}
