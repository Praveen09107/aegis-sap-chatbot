"use client"

import { Plus, X } from "lucide-react"
import type { ConfigFormData, CurrentValuesGroup, RelatedError, CurrentValuesMode, QuickEntryScreenshot } from "@/types"
import { SCREENSHOT_MAX_OVERALL } from "@/lib/constants"
import { useCrossReferenceCheck } from "@/hooks/useCrossReferenceCheck"
import { ScreenshotUploadZone } from "./ScreenshotUploadZone"
import { FormField, TextArea } from "./FormFieldPrimitives"

interface Props {
  data: Partial<ConfigFormData>
  onChange: (data: Partial<ConfigFormData>) => void
  entryId: string | null
  screenshots: QuickEntryScreenshot[]
  isReadOnly: boolean
}

function newGroup(): CurrentValuesGroup {
  return { group_name: "", parameters: [{ name: "", value: "" }] }
}

function newRelatedError(): RelatedError {
  return { error_code: "", misconfiguration_cause: "", see_document_id: "", reference_validated: false }
}

export function ConfigFormFields({ data, onChange, entryId, screenshots, isReadOnly }: Props) {
  const mode: CurrentValuesMode = data.current_values_mode ?? "structured"
  const groups = data.current_values_structured ?? []
  const relatedErrors = data.related_errors ?? []
  const noRelatedErrors = relatedErrors.length === 1 && relatedErrors[0].error_code === "NONE"

  function updateField<K extends keyof ConfigFormData>(key: K, value: ConfigFormData[K]) {
    onChange({ ...data, [key]: value })
  }

  function updateGroup(index: number, patch: Partial<CurrentValuesGroup>) {
    onChange({ ...data, current_values_structured: groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) })
  }

  function addGroup() {
    onChange({ ...data, current_values_structured: [...groups, newGroup()] })
  }

  function removeGroup(index: number) {
    onChange({ ...data, current_values_structured: groups.filter((_, i) => i !== index) })
  }

  function updateParameter(groupIndex: number, paramIndex: number, patch: Partial<{ name: string; value: string }>) {
    const group = groups[groupIndex]
    const nextParams = group.parameters.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p))
    updateGroup(groupIndex, { parameters: nextParams })
  }

  function addParameter(groupIndex: number) {
    updateGroup(groupIndex, { parameters: [...groups[groupIndex].parameters, { name: "", value: "" }] })
  }

  function removeParameter(groupIndex: number, paramIndex: number) {
    const group = groups[groupIndex]
    if (group.parameters.length <= 1) return
    updateGroup(groupIndex, { parameters: group.parameters.filter((_, i) => i !== paramIndex) })
  }

  function updateRelatedError(index: number, patch: Partial<RelatedError>) {
    onChange({ ...data, related_errors: relatedErrors.map((e, i) => (i === index ? { ...e, ...patch } : e)) })
  }

  function addRelatedError() {
    onChange({ ...data, related_errors: [...relatedErrors.filter((e) => e.error_code !== "NONE"), newRelatedError()] })
  }

  function removeRelatedError(index: number) {
    if (relatedErrors.length <= 1) return
    onChange({ ...data, related_errors: relatedErrors.filter((_, i) => i !== index) })
  }

  function toggleNoRelatedErrors(checked: boolean) {
    onChange({ ...data, related_errors: checked ? [{ ...newRelatedError(), error_code: "NONE" }] : [newRelatedError()] })
  }

  return (
    <div className="space-y-6">
      <FormField label="Configuration name" required hint="A short, specific name for this configuration">
        <input
          type="text"
          value={data.configuration_name ?? ""}
          onChange={(e) => updateField("configuration_name", e.target.value)}
          disabled={isReadOnly}
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
      </FormField>

      <FormField label="SAP table (optional)" hint="The SAP table this configuration is stored in, if known">
        <input
          type="text"
          value={data.table_name ?? ""}
          onChange={(e) => updateField("table_name", e.target.value)}
          disabled={isReadOnly}
          placeholder="e.g. TVAK"
          className="w-full h-9 px-3 text-sm font-mono rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary placeholder:font-sans"
        />
      </FormField>

      <FormField label="What this controls" required hint="Explain in detail what business behavior this configuration governs">
        <TextArea value={data.what_this_controls ?? ""} onChange={(v) => updateField("what_this_controls", v)} rows={3} disabled={isReadOnly} />
      </FormField>

      <FormField label="Access — view" required hint="Who can view this configuration">
        <input
          type="text"
          value={data.access_view ?? ""}
          onChange={(e) => updateField("access_view", e.target.value)}
          disabled={isReadOnly}
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
      </FormField>

      <FormField label="Access — change" required hint="Who can change this configuration">
        <input
          type="text"
          value={data.access_change ?? ""}
          onChange={(e) => updateField("access_change", e.target.value)}
          disabled={isReadOnly}
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        />
      </FormField>

      <FormField label="Change frequency" required hint="How often does this configuration typically change, in practice?">
        <input
          type="text"
          value={data.change_frequency ?? ""}
          onChange={(e) => updateField("change_frequency", e.target.value)}
          disabled={isReadOnly}
          placeholder="e.g. Rarely — only during major SAP upgrades"
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary"
        />
      </FormField>

      <div>
        <p className="text-[10px] text-text-tertiary mb-1.5">Screenshots of the configuration screen:</p>
        <ScreenshotUploadZone
          entryId={entryId}
          associatedSection="cfg_overview"
          screenshots={screenshots.filter((s) => s.associated_section === "cfg_overview")}
          isReadOnly={isReadOnly}
          maxScreenshots={SCREENSHOT_MAX_OVERALL}
        />
      </div>

      {/* Current production values */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">
          Current production values <span className="text-danger">*</span>
        </p>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => updateField("current_values_mode", "structured")}
            className={"text-xs px-2.5 py-1 rounded-md border transition-colors " + (mode === "structured" ? "bg-accent text-white border-transparent" : "border-border-primary text-text-secondary hover:bg-bg-secondary")}
          >
            Structured
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => updateField("current_values_mode", "free_text")}
            className={"text-xs px-2.5 py-1 rounded-md border transition-colors " + (mode === "free_text" ? "bg-accent text-white border-transparent" : "border-border-primary text-text-secondary hover:bg-bg-secondary")}
          >
            Free text
          </button>
        </div>

        {mode === "structured" ? (
          <div className="space-y-3">
            {groups.map((group, groupIndex) => (
              <div key={groupIndex} className="rounded-lg border border-border-primary bg-bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={group.group_name}
                    onChange={(e) => updateGroup(groupIndex, { group_name: e.target.value })}
                    disabled={isReadOnly}
                    placeholder="Group name (e.g. Tax condition types)"
                    className="flex-1 h-8 px-2 text-xs rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary"
                  />
                  {!isReadOnly && (
                    <button onClick={() => removeGroup(groupIndex)} className="text-text-tertiary hover:text-danger">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {group.parameters.map((param, paramIndex) => (
                    <div key={paramIndex} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) => updateParameter(groupIndex, paramIndex, { name: e.target.value })}
                        disabled={isReadOnly}
                        placeholder="Parameter"
                        className="flex-1 h-7 px-2 text-[11px] rounded border border-border-primary bg-bg-secondary text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary"
                      />
                      <input
                        type="text"
                        value={param.value}
                        onChange={(e) => updateParameter(groupIndex, paramIndex, { value: e.target.value })}
                        disabled={isReadOnly}
                        placeholder="Value"
                        className="flex-1 h-7 px-2 text-[11px] rounded border border-border-primary bg-bg-secondary text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary"
                      />
                      {!isReadOnly && (
                        <button onClick={() => removeParameter(groupIndex, paramIndex)} disabled={group.parameters.length <= 1} className="text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!isReadOnly && (
                    <button onClick={() => addParameter(groupIndex)} className="flex items-center gap-1 text-[10px] text-accent hover:underline">
                      <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                      Add parameter
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!isReadOnly && (
              <button onClick={addGroup} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
                <Plus className="w-3 h-3" aria-hidden="true" />
                Add group
              </button>
            )}
          </div>
        ) : (
          <TextArea
            value={data.current_values_free_text ?? ""}
            onChange={(v) => updateField("current_values_free_text", v)}
            rows={5}
            disabled={isReadOnly}
            placeholder="List the real production values — placeholder text like TBD or ENTER VALUE HERE will fail validation"
          />
        )}

        <div className="mt-3">
          <p className="text-[10px] text-text-tertiary mb-1.5">Screenshots of the current production values:</p>
          <ScreenshotUploadZone
            entryId={entryId}
            associatedSection="cfg_values"
            screenshots={screenshots.filter((s) => s.associated_section === "cfg_values")}
            isReadOnly={isReadOnly}
            maxScreenshots={SCREENSHOT_MAX_OVERALL}
          />
        </div>
      </div>

      <FormField label="How to navigate" required hint="The exact T-code and navigation path to reach this configuration">
        <TextArea value={data.how_to_navigate ?? ""} onChange={(v) => updateField("how_to_navigate", v)} rows={3} disabled={isReadOnly} />
      </FormField>

      {/* Related errors */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">
          Related errors from misconfiguration <span className="text-danger">*</span>
        </p>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={noRelatedErrors}
            disabled={isReadOnly}
            onChange={(e) => toggleNoRelatedErrors(e.target.checked)}
            className="rounded border-border-primary"
          />
          No related errors from misconfiguring this
        </label>

        {!noRelatedErrors && (
          <>
            <div className="space-y-3">
              {relatedErrors.map((err, index) => (
                <RelatedErrorCard
                  key={index}
                  error={err}
                  onUpdate={(patch) => updateRelatedError(index, patch)}
                  onRemove={() => removeRelatedError(index)}
                  canRemove={relatedErrors.length > 1}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>
            {!isReadOnly && (
              <button onClick={addRelatedError} className="mt-2 flex items-center gap-1.5 text-xs text-accent hover:underline">
                <Plus className="w-3 h-3" aria-hidden="true" />
                Add related error
              </button>
            )}
          </>
        )}
      </div>

      <FormField label="Additional notes" hint="Version-specific information, edge cases, known limitations">
        <TextArea value={data.notes ?? ""} onChange={(v) => updateField("notes", v)} rows={2} disabled={isReadOnly} />
      </FormField>
    </div>
  )
}

function RelatedErrorCard({
  error,
  onUpdate,
  onRemove,
  canRemove,
  isReadOnly,
}: {
  error: RelatedError
  onUpdate: (patch: Partial<RelatedError>) => void
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

      <TextArea value={error.misconfiguration_cause} onChange={(v) => onUpdate({ misconfiguration_cause: v })} rows={2} disabled={isReadOnly} placeholder="What misconfiguration of this value causes this error?" />

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
        {error.see_document_id && status === "done" && result?.exists && !error.reference_validated && (
          <button onClick={() => onUpdate({ reference_validated: true })} className="text-[10px] text-accent hover:underline mt-1">
            ✓ Found{result.title ? `: ${result.title}` : ""} — confirm reference
          </button>
        )}
        {error.see_document_id && status === "done" && result?.exists && error.reference_validated && (
          <p className="text-[10px] text-success mt-1">✓ Reference confirmed{result.title ? `: ${result.title}` : ""}</p>
        )}
        {error.see_document_id && status === "done" && !result?.exists && <p className="text-[10px] text-danger mt-1">No entry or document found with that ID.</p>}
      </div>
    </div>
  )
}
