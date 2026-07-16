# FRONTEND_37 — ADMIN QUICK ENTRY: FORM CORE
## AEGIS SAP Helpdesk AI — Quick Entry Form Shell and Workflow
## Depends on: IMPL_23, IMPL_25, IMPL_27, FRONTEND_36

---

## 1. OVERVIEW

This document specifies the Quick Entry form shell — the container component
that wraps all form fields (FRONTEND_38), the screenshot uploader (FRONTEND_39),
and all modals and drawers (FRONTEND_39). It covers:
- The form page for new and edit modes
- Content type selection (one-time, locked after save)
- Auto-save mechanism (30-second interval with visual feedback)
- Duplicate check flow (pre-submission check with modal)
- Optimistic locking (409 conflict detection and merge UI)
- Processing status polling and status drawer
- The SAP entity detector live output panel
- Chunk preview drawer (client-side rendering of chunk assembly)
- Form submission state machine

---

## 2. FILE STRUCTURE

```
src/app/admin/quick-entry/
├── new/
│   └── page.tsx          ← CreateQuickEntryPage
└── [id]/
    └── page.tsx           ← EditQuickEntryPage

src/components/quick-entry/
├── QuickEntryForm.tsx     ← main form shell (this document)
├── ContentTypeSelector.tsx
├── FormHeaderSection.tsx  ← document ID, module, transactions, verification
├── SapEntityPanel.tsx     ← live entity detection output
├── ChunkPreviewDrawer.tsx ← client-side chunk preview
├── ProcessingStatusDrawer.tsx
└── QuickEntryFormActions.tsx ← submit/save/archive buttons
```

---

## 3. PAGE COMPONENTS

**File:** `src/app/admin/quick-entry/new/page.tsx`

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { QuickEntryForm } from '@/components/quick-entry/QuickEntryForm'

export default function CreateQuickEntryPage() {
  const searchParams = useSearchParams()

  // Pre-populate from Knowledge Gaps deep-link
  const prefill = {
    gap_id:            searchParams.get('gap_id'),
    issue_description: searchParams.get('issue_description'),
    module:            searchParams.get('module'),
    transactions:      searchParams.get('transactions')?.split(',') ?? [],
  }

  return <QuickEntryForm mode="create" prefill={prefill} />
}
```

**File:** `src/app/admin/quick-entry/[id]/page.tsx`

```typescript
'use client'

import { useParams } from 'next/navigation'
import { QuickEntryForm } from '@/components/quick-entry/QuickEntryForm'

export default function EditQuickEntryPage() {
  const { id } = useParams<{ id: string }>()
  return <QuickEntryForm mode="edit" entryId={id} />
}
```

---

## 4. FORM STATE MACHINE

The form has a well-defined state machine. All UI decisions derive from it.

```
States:
  LOADING            — fetching entry data (edit mode only)
  SELECTING_TYPE     — user choosing content type (create mode, before any save)
  DRAFT_EDITING      — form open, no pending operations
  AUTO_SAVING        — auto-save PUT in progress (debounce just fired)
  DUPLICATE_CHECKING — POST check-duplicate in progress
  DUPLICATE_FOUND    — duplicate modal open, awaiting user choice
  SUBMITTING         — POST or PUT with publish=true in progress
  PROCESSING         — entry submitted, polling for completion
  PROCESSING_DONE    — entry reached terminal state (active/failed/low_quality)
  CONFLICT           — 409 received, conflict drawer open
  ARCHIVED           — entry was archived

Transitions:
  SELECTING_TYPE → DRAFT_EDITING          on type selected
  DRAFT_EDITING  → AUTO_SAVING            on auto-save interval fire
  AUTO_SAVING    → DRAFT_EDITING          on save complete (success or ignored)
  DRAFT_EDITING  → DUPLICATE_CHECKING     on submit button click
  DUPLICATE_CHECKING → DUPLICATE_FOUND   on similar entries returned
  DUPLICATE_CHECKING → SUBMITTING        on no similar entries
  DUPLICATE_FOUND → SUBMITTING           on user chooses "Submit anyway"
  DUPLICATE_FOUND → DRAFT_EDITING        on user chooses "Update existing" (and navigates away)
  SUBMITTING → PROCESSING                on 201/200 received
  PROCESSING → PROCESSING_DONE           on poll returns terminal status
  DRAFT_EDITING → CONFLICT               on 409 from PUT
  CONFLICT → DRAFT_EDITING              on user resolves conflict
```

---

## 5. MAIN FORM SHELL

**File:** `src/components/quick-entry/QuickEntryForm.tsx`

```typescript
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuickEntry, useCreateQuickEntry, useUpdateQuickEntry } from '@/hooks/useQuickEntry'
import { ContentTypeSelector } from './ContentTypeSelector'
import { FormHeaderSection } from './FormHeaderSection'
import { ErrorGuideFormFields } from './ErrorGuideFormFields'
import { ProcedureFormFields } from './ProcedureFormFields'
import { ConfigFormFields } from './ConfigFormFields'
import { ScreenshotUploadZone } from './ScreenshotUploadZone'
import { SapEntityPanel } from './SapEntityPanel'
import { ChunkPreviewDrawer } from './ChunkPreviewDrawer'
import { ProcessingStatusDrawer } from './ProcessingStatusDrawer'
import { DuplicateCheckModal } from './DuplicateCheckModal'
import { QuickEntryFormActions } from './QuickEntryFormActions'
import { ConflictDrawer } from './ConflictDrawer'
import { OnboardingModal } from './OnboardingModal'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useEntityDetector } from '@/hooks/useSapEntityDetector'
import { useDuplicateCheck } from '@/hooks/useQuickEntry'
import type { QuickEntryContentType, ErrorGuideFormData, ProcedureFormData, ConfigFormData } from '@/types'

type FormMode = 'create' | 'edit'
type FormState = 'loading' | 'selecting_type' | 'draft_editing' | 'auto_saving' |
                 'duplicate_checking' | 'duplicate_found' | 'submitting' |
                 'processing' | 'processing_done' | 'conflict' | 'archived'

interface Prefill {
  gap_id?: string | null
  issue_description?: string | null
  module?: string | null
  transactions?: string[]
}

interface Props {
  mode: FormMode
  entryId?: string
  prefill?: Prefill
}

export function QuickEntryForm({ mode, entryId, prefill }: Props) {
  const router = useRouter()

  // ── Form state machine ────────────────────────────────────────────────
  const [formState, setFormState] = useState<FormState>(
    mode === 'edit' ? 'loading' : 'selecting_type'
  )

  // ── Core form fields ──────────────────────────────────────────────────
  const [contentType, setContentType] = useState<QuickEntryContentType | null>(null)
  const [documentId, setDocumentId]   = useState('')
  const [module, setModule]           = useState(prefill?.module ?? '')
  const [transactions, setTransactions] = useState<string[]>(prefill?.transactions ?? [])
  const [verifiedByName, setVerifiedByName] = useState('')
  const [verifiedDate, setVerifiedDate]     = useState('')
  const [reviewFrequency, setReviewFrequency] = useState<string>('quarterly')
  const [gapId, setGapId] = useState<string | null>(prefill?.gap_id ?? null)

  // ── Content type-specific form data ───────────────────────────────────
  const [formData, setFormData] = useState<
    Partial<ErrorGuideFormData> | Partial<ProcedureFormData> | Partial<ConfigFormData>
  >({})

  // ── Saved draft ID (once first draft is created) ──────────────────────
  const [savedEntryId, setSavedEntryId] = useState<string | null>(entryId ?? null)
  const [currentVersion, setCurrentVersion] = useState<number>(1)

  // ── UI state ──────────────────────────────────────────────────────────
  const [showChunkPreview, setShowChunkPreview]       = useState(false)
  const [showProcessingDrawer, setShowProcessingDrawer] = useState(false)
  const [showConflict, setShowConflict]               = useState(false)
  const [conflictData, setConflictData]               = useState<any>(null)
  const [showOnboarding, setShowOnboarding]           = useState(false)
  const [duplicateResults, setDuplicateResults]       = useState<any[]>([])

  // ── Mutations ─────────────────────────────────────────────────────────
  const createMutation = useCreateQuickEntry()
  const updateMutation = useUpdateQuickEntry(savedEntryId ?? '')

  // ── Load entry in edit mode ───────────────────────────────────────────
  const { data: existingEntry } = useQuickEntry(entryId ?? '', {
    enabled: mode === 'edit' && Boolean(entryId)
  })

  useEffect(() => {
    if (existingEntry && formState === 'loading') {
      setContentType(existingEntry.content_type)
      setDocumentId(existingEntry.document_id)
      setModule(existingEntry.module)
      setTransactions(existingEntry.transactions)
      setVerifiedByName(existingEntry.verified_by_name)
      setVerifiedDate(existingEntry.verified_date)
      setReviewFrequency(existingEntry.review_frequency ?? 'quarterly')
      setFormData(existingEntry.form_data as any)
      setCurrentVersion(existingEntry.version)
      setGapId(existingEntry.gap_id)

      if (['archived'].includes(existingEntry.status)) {
        setFormState('archived')
      } else {
        setFormState('draft_editing')
      }
    }
  }, [existingEntry])

  // ── Onboarding: show for first-time users ─────────────────────────────
  useEffect(() => {
    if (mode === 'create') {
      const hasSeenOnboarding = localStorage.getItem('aegis_qe_onboarding_seen')
      if (!hasSeenOnboarding) setShowOnboarding(true)
    }
  }, [mode])

  // ── SAP entity detector ───────────────────────────────────────────────
  const formDataString = JSON.stringify(formData)
  const { entities: detectedEntities } = useEntityDetector(formDataString, {
    debounceMs: 800,
    enabled: Boolean(contentType) && formState !== 'loading'
  })

  // ── Build submission payload ──────────────────────────────────────────
  const buildPayload = useCallback((publish: boolean, changeSummary?: string) => {
    return {
      document_id:     documentId,
      content_type:    contentType,
      module,
      transactions,
      verified_by_name: verifiedByName,
      verified_date:   verifiedDate,
      review_frequency: contentType === 'config' ? reviewFrequency : null,
      form_data:       formData,
      gap_id:          gapId,
      publish,
      change_summary:  changeSummary ?? null,
      current_version: currentVersion,
    }
  }, [documentId, contentType, module, transactions, verifiedByName,
      verifiedDate, reviewFrequency, formData, gapId, currentVersion])

  // ── Auto-save ─────────────────────────────────────────────────────────
  const { saveStatus } = useAutoSave({
    enabled: formState === 'draft_editing' && Boolean(contentType),
    intervalMs: 30_000,
    onSave: async () => {
      const payload = buildPayload(false)
      if (savedEntryId) {
        const result = await updateMutation.mutateAsync(payload)
        setCurrentVersion(result.version)
      } else {
        const result = await createMutation.mutateAsync(payload)
        setSavedEntryId(result.id)
        router.replace(`/admin/quick-entry/${result.id}`, { scroll: false })
      }
    },
    dependencies: [formDataString, documentId, module, verifiedByName, verifiedDate]
  })

  // ── Duplicate check and submit ────────────────────────────────────────
  const handleSubmitClick = useCallback(async () => {
    if (!contentType) return
    setFormState('duplicate_checking')

    // Extract primary summary text for duplicate check
    const summaryText =
      (formData as any)?.issue_description ||
      (formData as any)?.procedure_name ||
      (formData as any)?.configuration_name || ''

    try {
      const result = await apiClient.post('/api/admin/knowledge-entries/check-duplicate', {
        module, content_type: contentType, summary_text: summaryText
      })

      if (result.has_similar && result.matches.length > 0) {
        setDuplicateResults(result.matches)
        setFormState('duplicate_found')
      } else {
        await submitEntry()
      }
    } catch {
      setFormState('draft_editing')
    }
  }, [contentType, formData, module])

  const submitEntry = useCallback(async (changeSummary?: string) => {
    setFormState('submitting')
    const payload = buildPayload(true, changeSummary)

    try {
      let result
      if (savedEntryId) {
        result = await updateMutation.mutateAsync(payload)
        setCurrentVersion(result.version)
      } else {
        result = await createMutation.mutateAsync(payload)
        setSavedEntryId(result.id)
        router.replace(`/admin/quick-entry/${result.id}`, { scroll: false })
      }
      setFormState('processing')
      setShowProcessingDrawer(true)
    } catch (error: any) {
      if (error.status === 409 && error.data?.current_entry) {
        setConflictData(error.data.current_entry)
        setShowConflict(true)
        setFormState('conflict')
      } else {
        setFormState('draft_editing')
      }
    }
  }, [savedEntryId, buildPayload])

  const handleProcessingComplete = useCallback((finalStatus: string) => {
    setFormState('processing_done')
  }, [])

  // ── Render: loading ───────────────────────────────────────────────────
  if (formState === 'loading') {
    return <QuickEntryFormSkeleton />
  }

  // ── Render: type selection ────────────────────────────────────────────
  if (formState === 'selecting_type' && !contentType) {
    return (
      <ContentTypeSelector
        onSelect={(type) => {
          setContentType(type)
          setFormState('draft_editing')
        }}
        onShowOnboarding={() => setShowOnboarding(true)}
      />
    )
  }

  // ── Main form render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Form header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/admin/quick-entry')}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            ← Quick Entry
          </button>
          <span className="text-[var(--color-text-muted)]">/</span>
          <span className="text-xs text-[var(--color-text-primary)] font-medium">
            {mode === 'create' ? 'New Entry' : documentId || 'Edit Entry'}
          </span>
          {contentType && (
            <ContentTypePill type={contentType} />
          )}
        </div>

        {/* Auto-save indicator */}
        <AutoSaveIndicator status={saveStatus} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Form body ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

          {/* Archived banner */}
          {formState === 'archived' && (
            <div className="p-3 rounded-lg bg-[var(--color-warning-subtle)] border border-[var(--color-warning-border)]">
              <p className="text-sm text-[var(--color-warning)] font-medium">
                This entry is archived. It is no longer active in the knowledge base.
              </p>
            </div>
          )}

          {/* Header section: doc ID, module, transactions, verification */}
          <FormHeaderSection
            contentType={contentType!}
            documentId={documentId}
            onDocumentIdChange={setDocumentId}
            module={module}
            onModuleChange={setModule}
            transactions={transactions}
            onTransactionsChange={setTransactions}
            verifiedByName={verifiedByName}
            onVerifiedByNameChange={setVerifiedByName}
            verifiedDate={verifiedDate}
            onVerifiedDateChange={setVerifiedDate}
            reviewFrequency={reviewFrequency}
            onReviewFrequencyChange={setReviewFrequency}
            isReadOnly={formState === 'archived'}
            gapId={gapId}
            isEditMode={mode === 'edit'}
          />

          {/* Content type-specific fields */}
          {contentType === 'error_guide' && (
            <ErrorGuideFormFields
              data={formData as Partial<ErrorGuideFormData>}
              onChange={d => setFormData(d as any)}
              entryId={savedEntryId}
              isReadOnly={formState === 'archived'}
            />
          )}
          {contentType === 'procedure' && (
            <ProcedureFormFields
              data={formData as Partial<ProcedureFormData>}
              onChange={d => setFormData(d as any)}
              entryId={savedEntryId}
              isReadOnly={formState === 'archived'}
            />
          )}
          {contentType === 'config' && (
            <ConfigFormFields
              data={formData as Partial<ConfigFormData>}
              onChange={d => setFormData(d as any)}
              entryId={savedEntryId}
              isReadOnly={formState === 'archived'}
            />
          )}
        </div>

        {/* ── Right panel: Entity detector ───────────────────────────── */}
        <aside className="w-64 flex-shrink-0 border-l border-[var(--color-border)] overflow-y-auto">
          <SapEntityPanel
            entities={detectedEntities}
            onChunkPreview={() => setShowChunkPreview(true)}
            contentType={contentType!}
            formData={formData}
            documentId={documentId}
            module={module}
          />
        </aside>
      </div>

      {/* ── Footer: action buttons ──────────────────────────────────── */}
      <QuickEntryFormActions
        formState={formState}
        status={existingEntry?.status}
        contentType={contentType}
        savedEntryId={savedEntryId}
        onSaveDraft={() => submitEntry()}
        onSubmit={handleSubmitClick}
        onViewProcessing={() => setShowProcessingDrawer(true)}
      />

      {/* ── Modals and drawers ──────────────────────────────────────── */}
      {showOnboarding && (
        <OnboardingModal
          onClose={() => {
            setShowOnboarding(false)
            localStorage.setItem('aegis_qe_onboarding_seen', '1')
          }}
        />
      )}

      {formState === 'duplicate_found' && (
        <DuplicateCheckModal
          matches={duplicateResults}
          onSubmitAnyway={() => {
            setFormState('submitting')
            submitEntry()
          }}
          onUpdateExisting={(targetEntry) => {
            // If current form was saved as draft, delete it
            if (savedEntryId && mode === 'create') {
              apiClient.delete(`/api/admin/knowledge-entries/${savedEntryId}`, {
                data: { confirmed_document_id: documentId }
              }).catch(() => {})  // best-effort deletion of orphaned draft
            }
            // Navigate to the existing entry
            router.push(`/admin/quick-entry/${targetEntry.id}`)
          }}
          onCancel={() => setFormState('draft_editing')}
        />
      )}

      {showProcessingDrawer && savedEntryId && (
        <ProcessingStatusDrawer
          entryId={savedEntryId}
          onClose={() => setShowProcessingDrawer(false)}
          onProcessingComplete={handleProcessingComplete}
        />
      )}

      {showChunkPreview && contentType && (
        <ChunkPreviewDrawer
          contentType={contentType}
          documentId={documentId}
          module={module}
          transactions={transactions}
          verifiedByName={verifiedByName}
          verifiedDate={verifiedDate}
          formData={formData}
          onClose={() => setShowChunkPreview(false)}
        />
      )}

      {showConflict && conflictData && (
        <ConflictDrawer
          localFormData={formData}
          serverEntry={conflictData}
          onAcceptServer={() => {
            setFormData(conflictData.form_data)
            setCurrentVersion(conflictData.version)
            setShowConflict(false)
            setFormState('draft_editing')
          }}
          onKeepLocal={() => {
            setCurrentVersion(conflictData.version)
            setShowConflict(false)
            setFormState('draft_editing')
          }}
          onClose={() => {
            setShowConflict(false)
            setFormState('draft_editing')
          }}
        />
      )}
    </div>
  )
}
```

---

## 6. CONTENT TYPE SELECTOR

**File:** `src/components/quick-entry/ContentTypeSelector.tsx`

```typescript
import { FileText, List, Settings, HelpCircle } from 'lucide-react'
import type { QuickEntryContentType } from '@/types'

const TYPE_OPTIONS: Array<{
  type: QuickEntryContentType
  label: string
  description: string
  when: string
  icon: typeof FileText
}> = [
  {
    type: 'error_guide',
    label: 'Error Guide',
    description: 'Document an SAP error with its causes and resolution steps',
    when: 'An employee sees an error code or unexpected message in SAP',
    icon: FileText
  },
  {
    type: 'procedure',
    label: 'Procedure',
    description: 'Step-by-step instructions for completing an SAP task',
    when: 'An employee needs to perform a specific business process in SAP',
    icon: List
  },
  {
    type: 'config',
    label: 'Config Reference',
    description: 'Current values of SAP configuration settings at Sona Comstar',
    when: 'An employee needs to know the current settings, rates, or codes configured in SAP',
    icon: Settings
  }
]

interface Props {
  onSelect: (type: QuickEntryContentType) => void
  onShowOnboarding: () => void
}

export function ContentTypeSelector({ onSelect, onShowOnboarding }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-10">
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
            What type of knowledge are you adding?
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose the template that best fits the information.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {TYPE_OPTIONS.map(opt => {
            const Icon = opt.icon
            return (
              <button
                key={opt.type}
                onClick={() => onSelect(opt.type)}
                className="flex items-start gap-4 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-accent)] text-left transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-elevated)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-accent-subtle)]">
                  <Icon size={16} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)] mb-0.5">{opt.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">{opt.description}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    <span className="font-medium">Use when:</span> {opt.when}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={onShowOnboarding}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mt-6 mx-auto"
        >
          <HelpCircle size={12} />
          See example entries for each type
        </button>
      </div>
    </div>
  )
}
```

---

## 7. AUTO-SAVE HOOK

**File:** `src/hooks/useAutoSave.ts`

```typescript
import { useEffect, useRef, useState, useCallback } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions {
  enabled: boolean
  intervalMs: number
  onSave: () => Promise<void>
  dependencies: unknown[]
}

export function useAutoSave({ enabled, intervalMs, onSave, dependencies }: UseAutoSaveOptions) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isDirtyRef = useRef(false)
  const prevDepsRef = useRef<string>('')

  const currentDepsStr = JSON.stringify(dependencies)

  // Mark dirty when dependencies change
  useEffect(() => {
    if (prevDepsRef.current && prevDepsRef.current !== currentDepsStr) {
      isDirtyRef.current = true
    }
    prevDepsRef.current = currentDepsStr
  }, [currentDepsStr])

  // Auto-save interval
  useEffect(() => {
    if (!enabled) return

    timerRef.current = setInterval(async () => {
      if (!isDirtyRef.current) return

      isDirtyRef.current = false
      setStatus('saving')

      try {
        await onSave()
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 5000)
      }
    }, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, intervalMs, onSave])

  return { saveStatus: status }
}
```

**File:** `src/components/quick-entry/AutoSaveIndicator.tsx`

```typescript
import type { AutoSaveStatus } from '@/hooks/useAutoSave'
import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react'

export function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
        <Clock size={10} />
        Auto-saves every 30s
      </span>
    )
  }
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
        <Loader2 size={10} className="animate-spin" />
        Saving draft…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-[var(--color-success)]">
        <CheckCircle size={10} />
        Draft saved
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-[var(--color-warning)]">
      <AlertCircle size={10} />
      Save failed — will retry
    </span>
  )
}
```

---

## 8. PROCESSING STATUS DRAWER

**File:** `src/components/quick-entry/ProcessingStatusDrawer.tsx`

Polls the entry while in 'processing' state. Displays each stage of the
`processing_log` JSONB (IMPL_24 Section 4) as it completes.

```typescript
import { X, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { useQuickEntryPoll } from '@/hooks/useQuickEntry'
import type { ProcessingLog } from '@/types'

interface Props {
  entryId: string
  onClose: () => void
  onProcessingComplete: (finalStatus: string) => void
}

const STAGE_LABELS: Record<string, string> = {
  validation:         'Schema validation',
  chunk_assembly:     'Assembling knowledge chunks',
  entity_extraction:  'Extracting SAP entities',
  embedding:          'Generating embeddings',
  quality_scoring:    'Scoring knowledge quality',
  deduplication:      'Checking for duplicates',
  qdrant_insertion:   'Indexing to vector store',
  opensearch_indexing: 'Indexing to search',
  screenshot_enrichment: 'Processing screenshots',
}

export function ProcessingStatusDrawer({ entryId, onClose, onProcessingComplete }: Props) {
  const { data: entry } = useQuickEntryPoll(entryId, true)

  useEffect(() => {
    if (!entry) return
    const terminal = ['active', 'archived', 'low_quality', 'failed', 'partial_index']
    if (terminal.includes(entry.status)) {
      onProcessingComplete(entry.status)
    }
  }, [entry?.status])

  const log: ProcessingLog | null = entry?.processing_log ?? null
  const isProcessing = entry?.status === 'processing'

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-96 h-full bg-[var(--color-surface-elevated)] border-l border-[var(--color-border)] shadow-xl flex flex-col pointer-events-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            {isProcessing && <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />}
            {entry?.status === 'active' && <CheckCircle size={14} className="text-[var(--color-success)]" />}
            {['failed', 'low_quality'].includes(entry?.status ?? '') && <XCircle size={14} className="text-[var(--color-danger)]" />}
            {entry?.status === 'partial_index' && <AlertTriangle size={14} className="text-[var(--color-warning)]" />}
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Processing Status
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        {/* Stage list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {log ? (
            Object.entries(STAGE_LABELS).map(([stageKey, stageLabel]) => {
              const stage = (log.stages as any)[stageKey]
              if (!stage) return null  // stage not yet reached

              return (
                <ProcessingStageRow
                  key={stageKey}
                  label={stageLabel}
                  stage={stage}
                  stageKey={stageKey}
                />
              )
            })
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <Loader2 size={24} className="animate-spin text-[var(--color-accent)] mb-3" />
              <p className="text-sm text-[var(--color-text-muted)]">
                Processing queued — starting shortly…
              </p>
            </div>
          )}

          {/* Final status summary */}
          {log && entry && !isProcessing && (
            <div className={[
              'p-3 rounded-lg border',
              entry.status === 'active'
                ? 'bg-[var(--color-success-subtle)] border-[var(--color-success-border)]'
                : 'bg-[var(--color-danger-subtle)] border-[var(--color-danger-border)]'
            ].join(' ')}>
              <p className="text-sm font-medium">
                {entry.status === 'active' && '✓ Entry is now active in the knowledge base'}
                {entry.status === 'partial_index' && '⚠ Partially indexed — retry in progress'}
                {entry.status === 'low_quality' && '⚠ Quality below threshold — review and improve'}
                {entry.status === 'failed' && '✗ Processing failed'}
              </p>
              {log.failure_reason && (
                <p className="text-xs mt-1 text-[var(--color-text-muted)]">{log.failure_reason}</p>
              )}
              {log.stages?.quality_scoring?.avg_score !== undefined && (
                <p className="text-xs mt-1 text-[var(--color-text-muted)]">
                  Quality score: {(log.stages.quality_scoring.avg_score * 100).toFixed(0)}%
                  (threshold: {(log.stages.quality_scoring.threshold_used * 100).toFixed(0)}%)
                </p>
              )}
              {(log.stages?.deduplication?.similar_entries?.length ?? 0) > 0 && (
                <p className="text-xs mt-1 text-[var(--color-warning)]">
                  Similar existing entries found:&nbsp;
                  {log.stages.deduplication.similar_entries.map(e => e.document_id).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProcessingStageRow({ label, stage, stageKey }: {
  label: string; stage: any; stageKey: string
}) {
  const status = stage.status ?? 'unknown'
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        {status === 'success' && <CheckCircle size={14} className="text-[var(--color-success)]" />}
        {status === 'failed' && <XCircle size={14} className="text-[var(--color-danger)]" />}
        {status === 'below_threshold' && <AlertTriangle size={14} className="text-[var(--color-warning)]" />}
        {status === 'partial' && <AlertTriangle size={14} className="text-[var(--color-warning)]" />}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-[var(--color-text-primary)]">{label}</p>
        {stage.duration_ms && (
          <p className="text-[10px] text-[var(--color-text-muted)]">{stage.duration_ms}ms</p>
        )}
        {stageKey === 'chunk_assembly' && stage.chunks_assembled !== undefined && (
          <p className="text-[10px] text-[var(--color-text-muted)]">
            {stage.chunks_assembled} chunks: {(stage.chunk_types ?? []).join(', ')}
          </p>
        )}
        {stageKey === 'entity_extraction' && (
          <p className="text-[10px] text-[var(--color-text-muted)]">
            T-codes: {(stage.t_codes_found ?? []).join(', ') || 'none'}
          </p>
        )}
        {stageKey === 'qdrant_insertion' && stage.chunks_failed > 0 && (
          <p className="text-[10px] text-[var(--color-warning)]">
            {stage.chunks_failed} chunk(s) failed: {(stage.failed_chunk_types ?? []).join(', ')}
          </p>
        )}
        {stage.errors?.map((err: string, i: number) => (
          <p key={i} className="text-[10px] text-[var(--color-danger)]">{err}</p>
        ))}
      </div>
    </div>
  )
}
```

---

## 9. CHUNK PREVIEW DRAWER

Renders chunk text on the client using the same logic as `form_chunker.py`
(IMPL_27), adapted as a TypeScript function. Allows admin to preview exactly
what will be indexed before submitting.

**File:** `src/components/quick-entry/ChunkPreviewDrawer.tsx`

```typescript
import { X } from 'lucide-react'
import { useMemo } from 'react'
import { assembleChunksClient } from '@/lib/chunkAssembler'
import type { QuickEntryContentType } from '@/types'

interface Props {
  contentType: QuickEntryContentType
  documentId: string
  module: string
  transactions: string[]
  verifiedByName: string
  verifiedDate: string
  formData: object
  onClose: () => void
}

export function ChunkPreviewDrawer({ contentType, documentId, module, transactions,
                                     verifiedByName, verifiedDate, formData, onClose }: Props) {
  const chunks = useMemo(() => {
    try {
      return assembleChunksClient({
        contentType, documentId, module, transactions,
        verifiedByName, verifiedDate, formData
      })
    } catch {
      return []
    }
  }, [contentType, documentId, module, transactions,
      verifiedByName, verifiedDate, JSON.stringify(formData)])

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-[480px] h-full bg-[var(--color-surface-elevated)] border-l border-[var(--color-border)] shadow-xl flex flex-col pointer-events-auto">

        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Chunk Preview — {chunks.length} chunks
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              This is exactly what will be indexed in the knowledge base
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {chunks.map(chunk => (
            <div key={chunk.chunk_type}
              className="rounded-lg border border-[var(--color-border)] overflow-hidden">
              <div className="px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <span className="text-[10px] font-mono text-[var(--color-accent)]">
                  {chunk.chunk_type}
                </span>
              </div>
              <pre className="px-3 py-2.5 text-[10px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap leading-relaxed">
                {chunk.text}
              </pre>
            </div>
          ))}
          {chunks.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-8">
              Fill in more fields to preview chunks
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

`assembleChunksClient` is a TypeScript port of `form_chunker.py`. It is a
pure function and must always be kept in sync with the Python implementation.
File: `src/lib/chunkAssembler.ts`. Must implement the same chunk assembly
rules as IMPL_27 exactly — same header prefix, same NONE omission, same
priority ordering, same branch handling.

---

## 10. FORM ACTIONS BAR

**File:** `src/components/quick-entry/QuickEntryFormActions.tsx`

```typescript
import { Loader2, Send, Save, Trash2, Eye, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  formState: string
  status?: string
  contentType: string | null
  savedEntryId: string | null
  onSaveDraft: () => void
  onSubmit: () => void
  onViewProcessing: () => void
}

export function QuickEntryFormActions({
  formState, status, contentType, savedEntryId,
  onSaveDraft, onSubmit, onViewProcessing
}: Props) {
  const isSubmitting = formState === 'submitting' || formState === 'duplicate_checking'
  const isProcessing = formState === 'processing'
  const isArchived   = formState === 'archived'
  const isDone       = formState === 'processing_done'

  if (isArchived) {
    return (
      <div className="px-6 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          Archived entries cannot be edited. Create a new version to restore.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
      <div className="flex items-center gap-2">
        {savedEntryId && status === 'draft' && (
          <button
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <Save size={12} />
            Save draft
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isProcessing && (
          <button
            onClick={onViewProcessing}
            className="flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
          >
            <Eye size={12} />
            View processing status
          </button>
        )}

        <Button
          variant="primary"
          size="sm"
          disabled={!contentType || isSubmitting || isProcessing || isArchived}
          onClick={onSubmit}
        >
          {isSubmitting && <Loader2 size={13} className="mr-1.5 animate-spin" />}
          {isProcessing && <Loader2 size={13} className="mr-1.5 animate-spin" />}
          {isSubmitting ? 'Submitting…' : isProcessing ? 'Processing…' : 'Submit to Knowledge Base'}
          {!isSubmitting && !isProcessing && <Send size={13} className="ml-1.5" />}
        </Button>
      </div>
    </div>
  )
}
```

---

*FRONTEND_37 — Admin Quick Entry Form Core | AEGIS v1.0 | Sona Comstar*
