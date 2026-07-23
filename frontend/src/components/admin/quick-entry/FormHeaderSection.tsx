"use client"

import { useState, useCallback } from "react"
import { X } from "lucide-react"
import type { QuickEntryContentType } from "@/types"
import { SAP_MODULES, REVIEW_FREQUENCY_OPTIONS } from "@/lib/constants"
import { suggestDocumentId } from "@/hooks/queries"
import { toastError } from "@/lib/toast"

interface Props {
  contentType: QuickEntryContentType
  documentId: string
  onDocumentIdChange: (v: string) => void
  module: string
  onModuleChange: (v: string) => void
  transactions: string[]
  onTransactionsChange: (v: string[]) => void
  verifiedByName: string
  onVerifiedByNameChange: (v: string) => void
  verifiedDate: string
  onVerifiedDateChange: (v: string) => void
  reviewFrequency: string
  onReviewFrequencyChange: (v: string) => void
  isReadOnly: boolean
  gapId: string | null
  isEditMode: boolean
}

export function FormHeaderSection({
  contentType,
  documentId,
  onDocumentIdChange,
  module,
  onModuleChange,
  transactions,
  onTransactionsChange,
  verifiedByName,
  onVerifiedByNameChange,
  verifiedDate,
  onVerifiedDateChange,
  reviewFrequency,
  onReviewFrequencyChange,
  isReadOnly,
  gapId,
  isEditMode,
}: Props) {
  const [tagInput, setTagInput] = useState("")
  const [suggesting, setSuggesting] = useState(false)

  const handleSuggestId = useCallback(async () => {
    if (!module) return
    setSuggesting(true)
    try {
      const suggested = await suggestDocumentId(module, contentType)
      onDocumentIdChange(suggested)
    } catch {
      toastError("Could not suggest a document ID. Please enter one manually.")
    } finally {
      setSuggesting(false)
    }
  }, [module, contentType, onDocumentIdChange])

  function addTag(raw: string) {
    const value = raw.trim().toUpperCase()
    if (!value) return
    if (!transactions.includes(value)) onTransactionsChange([...transactions, value])
    setTagInput("")
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === "Backspace" && tagInput === "" && transactions.length > 0) {
      onTransactionsChange(transactions.slice(0, -1))
    }
  }

  return (
    <div className="space-y-4">
      {gapId && (
        <div className="px-3 py-2 rounded-lg bg-accent-subtle border border-border-focus/30">
          <p className="text-xs text-accent">📎 Created from Knowledge Gap — submitting will mark that gap as addressed</p>
        </div>
      )}

      {/* Document ID */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5" htmlFor="qe-document-id">
          Document ID <span className="text-danger">*</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="qe-document-id"
            type="text"
            value={documentId}
            onChange={(e) => onDocumentIdChange(e.target.value.toUpperCase())}
            placeholder="e.g. SAP-SD-PRO-IN-21"
            disabled={isReadOnly || isEditMode}
            className="flex-1 h-9 px-3 text-sm uppercase rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary placeholder:normal-case"
          />
          {!isEditMode && (
            <button
              type="button"
              onClick={handleSuggestId}
              disabled={!module || suggesting || isReadOnly}
              className="text-xs text-accent hover:underline whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {suggesting ? "Suggesting…" : "Suggest →"}
            </button>
          )}
        </div>
        <p className="text-[10px] text-text-tertiary mt-1">Unique identifier for this entry</p>
      </div>

      {/* Module */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5" htmlFor="qe-module">
          SAP Module <span className="text-danger">*</span>
        </label>
        <select
          id="qe-module"
          value={module}
          onChange={(e) => onModuleChange(e.target.value)}
          disabled={isReadOnly}
          className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
        >
          <option value="">Select a module…</option>
          {Object.keys(SAP_MODULES).map((m) => (
            <option key={m} value={m}>
              {m} — {SAP_MODULES[m as keyof typeof SAP_MODULES]}
            </option>
          ))}
        </select>
      </div>

      {/* Transactions */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5" htmlFor="qe-transactions">
          Relevant T-Codes / Transactions <span className="text-danger">*</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5 min-h-9 px-2 py-1.5 rounded-md border border-border-primary bg-bg-card focus-within:border-border-focus">
          {transactions.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded bg-bg-tertiary text-text-primary">
              {t}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => onTransactionsChange(transactions.filter((x) => x !== t))}
                  aria-label={`Remove ${t}`}
                  className="text-text-tertiary hover:text-danger"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
          {!isReadOnly && (
            <input
              id="qe-transactions"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => addTag(tagInput)}
              placeholder={transactions.length === 0 ? "e.g. VL01N, VK11" : ""}
              className="flex-1 min-w-[100px] text-sm bg-transparent text-text-primary focus:outline-none placeholder:text-text-tertiary"
            />
          )}
        </div>
        <p className="text-[10px] text-text-tertiary mt-1">Enter SAP transaction codes separated by commas</p>
      </div>

      {/* Verified by / Verified date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5" htmlFor="qe-verified-by">
            Verified by <span className="text-danger">*</span>
          </label>
          <input
            id="qe-verified-by"
            type="text"
            value={verifiedByName}
            onChange={(e) => onVerifiedByNameChange(e.target.value)}
            placeholder="IT team member who verified this"
            disabled={isReadOnly}
            className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60 placeholder:text-text-tertiary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5" htmlFor="qe-verified-date">
            Verified on <span className="text-danger">*</span>
          </label>
          <input
            id="qe-verified-date"
            type="date"
            value={verifiedDate}
            onChange={(e) => onVerifiedDateChange(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            disabled={isReadOnly}
            className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
          />
        </div>
      </div>

      {/* Review frequency (config only) */}
      {contentType === "config" && (
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5" htmlFor="qe-review-frequency">
            Review frequency <span className="text-danger">*</span>
          </label>
          <select
            id="qe-review-frequency"
            value={reviewFrequency}
            onChange={(e) => onReviewFrequencyChange(e.target.value)}
            disabled={isReadOnly}
            className="w-full h-9 px-3 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus disabled:opacity-60"
          >
            {REVIEW_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-text-tertiary mt-1">You&apos;ll be notified when values are due for review</p>
        </div>
      )}
    </div>
  )
}
