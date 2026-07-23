"use client"

import type { ReactNode } from "react"

/**
 * Shared field primitives for the Quick Entry form's three content-type
 * field components (Error Guide / Procedure / Config). Styled with this
 * codebase's real Tailwind tokens (matching FormHeaderSection.tsx), not
 * FRONTEND_38's invented `var(--color-X)` CSS-variable syntax.
 */

interface FormFieldProps {
  label: string
  required?: boolean
  hint?: string
  size?: "sm" | "default"
  children: ReactNode
}

export function FormField({ label, required, hint, size = "default", children }: FormFieldProps) {
  return (
    <div>
      <label className={"block font-medium text-text-secondary mb-1 " + (size === "sm" ? "text-[11px]" : "text-xs")}>
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-text-tertiary mt-1">{hint}</p>}
    </div>
  )
}

interface TextAreaProps {
  value: string
  onChange: (value: string) => void
  rows?: number
  disabled?: boolean
  placeholder?: string
}

export function TextArea({ value, onChange, rows = 3, disabled, placeholder }: TextAreaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary resize-y"
    />
  )
}

interface NoneCheckboxFieldProps {
  label: string
  required?: boolean
  hint?: string
  noneLabel: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  multiline?: boolean
}

/**
 * The shared "value or literal NONE" pattern (form_validator.py's
 * CONFIG_PLACEHOLDER_STRINGS / NONE handling) — checking the box sets the
 * field to the literal string "NONE" and disables free text; unchecking
 * clears back to an empty string for editing.
 */
export function NoneCheckboxField({ label, required, hint, noneLabel, value, onChange, disabled, multiline }: NoneCheckboxFieldProps) {
  const isNone = value === "NONE"

  return (
    <FormField label={label} required={required} hint={hint}>
      <div className="space-y-2">
        {!isNone &&
          (multiline ? (
            <TextArea value={value} onChange={onChange} rows={2} disabled={disabled} />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
            />
          ))}
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={isNone}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? "NONE" : "")}
            className="rounded border-border-primary"
          />
          {noneLabel}
        </label>
      </div>
    </FormField>
  )
}
