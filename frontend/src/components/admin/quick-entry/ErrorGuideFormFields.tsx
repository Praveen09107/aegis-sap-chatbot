"use client"

import { AlertTriangle, Plus, GripVertical, X } from "lucide-react"
import type { ErrorGuideFormData, CauseBlock, CausePriority, QuickEntryScreenshot } from "@/types"
import { CAUSE_PRIORITY_OPTIONS, SCREENSHOT_MAX_OVERALL } from "@/lib/constants"
import { ScreenshotUploadZone } from "./ScreenshotUploadZone"
import { FormField, TextArea, NoneCheckboxField } from "./FormFieldPrimitives"
import { lacksSpecificity } from "@/lib/specificityCheck"

interface Props {
  data: Partial<ErrorGuideFormData>
  onChange: (data: Partial<ErrorGuideFormData>) => void
  entryId: string | null
  screenshots: QuickEntryScreenshot[]
  isReadOnly: boolean
}

const MAX_CAUSES = 10

function newCause(): CauseBlock {
  return {
    cause_number: 0,
    priority: "common",
    cause_description: "",
    how_to_identify: "",
    resolution_steps: "",
    resolution_requires_admin: false,
    cause_obsolete: false,
    obsolete_reason: "",
    screenshot_ids: [],
    specificity_acknowledged: false,
  }
}

export function ErrorGuideFormFields({ data, onChange, entryId, screenshots, isReadOnly }: Props) {
  const causes = data.causes ?? []

  function updateField<K extends keyof ErrorGuideFormData>(key: K, value: ErrorGuideFormData[K]) {
    onChange({ ...data, [key]: value })
  }

  function updateCause(index: number, patch: Partial<CauseBlock>) {
    const next = causes.map((c, i) => (i === index ? { ...c, ...patch } : c))
    onChange({ ...data, causes: next })
  }

  function addCause() {
    if (causes.length >= MAX_CAUSES) return
    onChange({ ...data, causes: [...causes, newCause()] })
  }

  function removeCause(index: number) {
    if (causes.length <= 1) return
    onChange({ ...data, causes: causes.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-6">
      <FormField label="Issue description" required hint="One sentence describing the problem from the employee's perspective">
        <TextArea value={data.issue_description ?? ""} onChange={(v) => updateField("issue_description", v)} rows={2} disabled={isReadOnly} placeholder="Tax condition not capturing in Sale Order" />
      </FormField>

      <NoneCheckboxField
        label="SAP error code"
        required
        hint="The exact error code displayed in SAP (e.g. VL150)"
        noneLabel="No error code displayed"
        value={data.error_code ?? ""}
        onChange={(v) => updateField("error_code", v)}
        disabled={isReadOnly}
        multiline={false}
      />

      <NoneCheckboxField
        label="Exact SAP error message text"
        required
        hint="Copy the message exactly as SAP displays it, including any codes"
        noneLabel="No specific error message"
        value={data.error_message ?? ""}
        onChange={(v) => updateField("error_message", v)}
        disabled={isReadOnly}
        multiline
      />

      <FormField label="Description" required hint="Explain in more detail what happens and why this is a problem">
        <TextArea value={data.description ?? ""} onChange={(v) => updateField("description", v)} rows={3} disabled={isReadOnly} />
      </FormField>

      <FormField label="When does this typically occur?" required hint="Describe the business context and conditions that trigger this issue">
        <TextArea value={data.when_this_occurs ?? ""} onChange={(v) => updateField("when_this_occurs", v)} rows={3} disabled={isReadOnly} />
      </FormField>

      <div>
        <p className="text-[10px] text-text-tertiary mb-1.5 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
          Screenshots of the general error screen:
        </p>
        <ScreenshotUploadZone
          entryId={entryId}
          associatedSection="error_overview"
          screenshots={screenshots.filter((s) => s.associated_section === "error_overview")}
          isReadOnly={isReadOnly}
          maxScreenshots={SCREENSHOT_MAX_OVERALL}
        />
      </div>

      {/* Causes */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">
          Causes <span className="text-danger">*</span>
        </p>
        <div className="space-y-4">
          {causes.map((cause, index) => (
            <CauseCard
              key={index}
              cause={cause}
              index={index}
              onUpdate={(patch) => updateCause(index, patch)}
              onRemove={() => removeCause(index)}
              canRemove={causes.length > 1}
              entryId={entryId}
              screenshots={screenshots.filter((s) => s.associated_section === `cause_${index + 1}`)}
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
        {!isReadOnly && (
          <button
            onClick={addCause}
            disabled={causes.length >= MAX_CAUSES}
            className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            Add cause
          </button>
        )}
      </div>

      <FormField label="Success indicator" required hint="What specific SAP message or screen change confirms the issue is resolved?">
        <TextArea value={data.success_indicator ?? ""} onChange={(v) => updateField("success_indicator", v)} rows={2} disabled={isReadOnly} />
      </FormField>

      <FormField label="Escalation criteria" required hint="When should the employee stop and raise a support ticket?">
        <TextArea value={data.escalation_criteria ?? ""} onChange={(v) => updateField("escalation_criteria", v)} rows={2} disabled={isReadOnly} />
      </FormField>

      <NoneCheckboxField
        label="Admin-only resolution steps"
        required
        hint="Steps that AEGIS should not attempt on its own — requires IT admin involvement"
        noneLabel="No admin-only steps required for this issue"
        value={data.admin_steps ?? ""}
        onChange={(v) => updateField("admin_steps", v)}
        disabled={isReadOnly}
        multiline
      />

      <FormField label="Additional notes" hint="Version-specific information, edge cases, known limitations">
        <TextArea value={data.notes ?? ""} onChange={(v) => updateField("notes", v)} rows={2} disabled={isReadOnly} />
      </FormField>
    </div>
  )
}

function CauseCard({
  cause,
  index,
  onUpdate,
  onRemove,
  canRemove,
  entryId,
  screenshots,
  isReadOnly,
}: {
  cause: CauseBlock
  index: number
  onUpdate: (patch: Partial<CauseBlock>) => void
  onRemove: () => void
  canRemove: boolean
  entryId: string | null
  screenshots: QuickEntryScreenshot[]
  isReadOnly: boolean
}) {
  const showSpecWarning = lacksSpecificity(cause.resolution_steps, cause.specificity_acknowledged)

  return (
    <div className="rounded-lg border border-border-primary bg-bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isReadOnly && <GripVertical className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />}
          <span className="text-xs font-semibold text-text-primary">Cause {index + 1}</span>
        </div>
        {!isReadOnly && (
          <button onClick={onRemove} disabled={!canRemove} className="text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed" aria-label={`Remove cause ${index + 1}`}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <FormField label="Priority" size="sm">
        <div className="flex gap-1.5 flex-wrap">
          {CAUSE_PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isReadOnly}
              onClick={() => onUpdate({ priority: opt.value as CausePriority })}
              title={opt.description}
              className={
                "text-xs px-2.5 py-1 rounded-md border transition-colors " +
                (cause.priority === opt.value ? "bg-accent text-white border-transparent" : "border-border-primary text-text-secondary hover:bg-bg-secondary")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Cause description" size="sm" hint="What specific misconfiguration or missing data causes this issue?">
        <TextArea value={cause.cause_description} onChange={(v) => onUpdate({ cause_description: v })} rows={2} disabled={isReadOnly} />
      </FormField>

      <FormField label="How to identify" size="sm" hint="Which T-code, tab, or field does the admin check to confirm this cause?">
        <TextArea value={cause.how_to_identify} onChange={(v) => onUpdate({ how_to_identify: v })} rows={2} disabled={isReadOnly} />
      </FormField>

      <FormField label="Resolution steps" size="sm" hint="Exact steps with T-codes, field names, and values to enter">
        <TextArea
          value={cause.resolution_steps}
          onChange={(v) => onUpdate({ resolution_steps: v, specificity_acknowledged: false })}
          rows={3}
          disabled={isReadOnly}
        />
        {showSpecWarning && (
          <div className="mt-1.5 p-2 rounded bg-warning-bg border border-warning-border">
            <p className="text-[10px] text-warning-text">
              ⚠ This step may lack specificity. AEGIS answers are most useful when resolution steps name the exact T-code, field, and value to enter. If this level of detail isn&apos;t available, you can
              acknowledge and continue.
            </p>
            <button onClick={() => onUpdate({ specificity_acknowledged: true })} className="text-[10px] text-accent hover:underline mt-1">
              ✓ Acknowledge and continue
            </button>
          </div>
        )}
      </FormField>

      <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
        <input type="checkbox" checked={cause.resolution_requires_admin} disabled={isReadOnly} onChange={(e) => onUpdate({ resolution_requires_admin: e.target.checked })} className="rounded border-border-primary" />
        These steps require IT admin access
      </label>

      <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
        <input type="checkbox" checked={cause.cause_obsolete} disabled={isReadOnly} onChange={(e) => onUpdate({ cause_obsolete: e.target.checked })} className="rounded border-border-primary" />
        Mark this cause as obsolete (no longer applicable)
      </label>

      {cause.cause_obsolete && (
        <FormField label="Obsolete reason" required size="sm">
          <TextArea value={cause.obsolete_reason} onChange={(v) => onUpdate({ obsolete_reason: v })} rows={2} disabled={isReadOnly} />
        </FormField>
      )}

      <div>
        <p className="text-[10px] text-text-tertiary mb-1.5 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
          Screenshots for this cause:
        </p>
        <ScreenshotUploadZone entryId={entryId} associatedSection={`cause_${index + 1}`} screenshots={screenshots} isReadOnly={isReadOnly} maxScreenshots={3} />
      </div>
    </div>
  )
}
