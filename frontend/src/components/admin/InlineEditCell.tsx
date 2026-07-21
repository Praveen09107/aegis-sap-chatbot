"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Check, X, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

interface InlineEditCellProps {
  value: string
  onSave: (newValue: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
  className?: string
}

/**
 * Inline editable table cell for the Config Snapshot page.
 * UX pattern:
 * - Shows value as static text with an edit icon on hover
 * - Click anywhere on the cell OR the edit icon → transforms to an input
 * - Enter or blur → triggers save (if value changed)
 * - Escape → cancels, restores the original value
 * - Shows a spinner while saving
 *
 * @example
 * <InlineEditCell
 *   value={config.value}
 *   onSave={(newVal) => updateConfig.mutateAsync({ category, key, value: newVal })}
 * />
 */
export function InlineEditCell({ value, onSave, disabled = false, placeholder = "Enter value...", className }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [prevValue, setPrevValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft when external value changes — React's "adjusting state when
  // a prop changes" pattern (computed during render, not inside an
  // effect): react-hooks/set-state-in-effect (React Compiler era) flags a
  // synchronous setState call in an effect body as a wasted extra render;
  // doing it here instead lands in the same commit as the value change.
  if (!editing && value !== prevValue) {
    setPrevValue(value)
    setDraft(value)
  }

  // Focus input on edit start
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = useCallback(() => {
    if (disabled || saving) return
    setDraft(value)
    setEditing(true)
  }, [disabled, saving, value])

  const cancelEdit = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const commitSave = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      // Error toast shown by the mutation's own onError handler.
      // Restore original value on error.
      setDraft(value)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [draft, value, onSave])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitSave()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      cancelEdit()
    }
  }

  if (editing || saving) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Small delay to allow Save/Cancel button clicks to register
            // before the blur-triggered save fires.
            setTimeout(() => {
              if (document.activeElement !== inputRef.current) {
                commitSave()
              }
            }, 150)
          }}
          placeholder={placeholder}
          disabled={saving}
          className={cn(
            "flex-1 min-w-0 h-7 px-2 text-sm",
            "bg-bg-secondary border border-border-focus rounded-md",
            "text-text-primary",
            "focus:outline-none focus:ring-1 focus:ring-border-focus",
            "disabled:opacity-50"
          )}
        />
        {/* Save button */}
        <button
          onClick={commitSave}
          disabled={saving}
          className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success-bg transition-colors disabled:opacity-40"
          aria-label="Save"
        >
          {saving ? (
            <span className="w-3 h-3 rounded-full border-2 border-success border-t-transparent animate-spin" aria-hidden="true" />
          ) : (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
        {/* Cancel button */}
        <button
          onClick={cancelEdit}
          disabled={saving}
          className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:bg-bg-tertiary transition-colors disabled:opacity-40"
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={cn(
        "group flex items-center gap-2 w-full text-left",
        "rounded px-2 py-1 -mx-2 -my-1",
        "hover:bg-bg-secondary",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "disabled:opacity-40 disabled:pointer-events-none",
        className
      )}
      aria-label={`Edit value: ${value}`}
    >
      <span className="text-sm text-text-primary font-mono flex-1 truncate">{value || placeholder}</span>
      <Pencil className="w-3 h-3 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" aria-hidden="true" />
    </button>
  )
}
