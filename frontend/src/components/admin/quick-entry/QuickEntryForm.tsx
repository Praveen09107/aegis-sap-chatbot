"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  useQuickEntry,
  useCreateQuickEntry,
  useUpdateQuickEntry,
  checkDuplicate,
  type QuickEntrySubmitPayload,
} from "@/hooks/queries"
import { ContentTypeSelector } from "./ContentTypeSelector"
import { FormHeaderSection } from "./FormHeaderSection"
import { ErrorGuideFormFields } from "./ErrorGuideFormFields"
import { ProcedureFormFields } from "./ProcedureFormFields"
import { ConfigFormFields } from "./ConfigFormFields"
import { SapEntityPanel } from "./SapEntityPanel"
import { ChunkPreviewDrawer } from "./ChunkPreviewDrawer"
import { ProcessingStatusDrawer } from "./ProcessingStatusDrawer"
import { DuplicateCheckModal } from "./DuplicateCheckModal"
import { QuickEntryFormActions } from "./QuickEntryFormActions"
import { ConflictDrawer } from "./ConflictDrawer"
import { QuickEntryOnboardingModal } from "./QuickEntryOnboardingModal"
import { AutoSaveIndicator } from "./AutoSaveIndicator"
import { useAutoSave } from "@/hooks/useAutoSave"
import { useEntityDetector } from "@/hooks/useSapEntityDetector"
import { isApiStatus, APIError } from "@/lib/api"
import type {
  QuickEntryContentType,
  QuickEntryFull,
  QuickEntryFormData,
  DuplicateMatch,
} from "@/types"

type FormMode = "create" | "edit"
type FormState =
  | "loading"
  | "selecting_type"
  | "draft_editing"
  | "duplicate_checking"
  | "duplicate_found"
  | "submitting"
  | "processing"
  | "processing_done"
  | "conflict"
  | "archived"

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

const ONBOARDING_SEEN_KEY = "aegis:qe-onboarding-seen"

export function QuickEntryForm({ mode, entryId, prefill }: Props) {
  const router = useRouter()

  const [formState, setFormState] = useState<FormState>(mode === "edit" ? "loading" : "selecting_type")

  const [contentType, setContentType] = useState<QuickEntryContentType | null>(null)
  const [documentId, setDocumentId] = useState("")
  const [module, setModule] = useState(prefill?.module ?? "")
  const [transactions, setTransactions] = useState<string[]>(prefill?.transactions ?? [])
  const [verifiedByName, setVerifiedByName] = useState("")
  const [verifiedDate, setVerifiedDate] = useState("")
  const [reviewFrequency, setReviewFrequency] = useState("quarterly")
  const [gapId, setGapId] = useState<string | null>(prefill?.gap_id ?? null)
  const [formData, setFormData] = useState<QuickEntryFormData>({})

  const [savedEntryId, setSavedEntryId] = useState<string | null>(entryId ?? null)
  const [currentVersion, setCurrentVersion] = useState(1)

  const [showChunkPreview, setShowChunkPreview] = useState(false)
  const [showProcessingDrawer, setShowProcessingDrawer] = useState(false)
  const [showConflict, setShowConflict] = useState(false)
  const [conflictData, setConflictData] = useState<QuickEntryFull | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [duplicateResults, setDuplicateResults] = useState<DuplicateMatch[]>([])

  const createMutation = useCreateQuickEntry()
  const updateMutation = useUpdateQuickEntry(savedEntryId ?? "")

  // Fetches whenever an id exists at all — NOT gated on `mode`. A brand-new
  // entry (mode="create") only gets an id after its first auto-save; from
  // that point on this query must be live regardless of which page the form
  // started on, since its `updated_at` is required for every later draft
  // save's optimistic-lock check (see buildPayload below).
  const { data: existingEntry } = useQuickEntry(savedEntryId ?? "", { enabled: Boolean(savedEntryId) })

  // Seeds local editable state from the fetched entry exactly once, the
  // first time it lands while still "loading" — done as a guarded
  // render-time state adjustment (React's own documented pattern for
  // "initializing state from an async-loaded value") rather than an effect,
  // since the effect form of this pattern synchronously fires several
  // setState calls in a row for no external-system reason.
  const [seededEntryId, setSeededEntryId] = useState<string | null>(null)
  if (existingEntry && formState === "loading" && seededEntryId !== existingEntry.id) {
    setSeededEntryId(existingEntry.id)
    setContentType(existingEntry.content_type)
    setDocumentId(existingEntry.document_id)
    setModule(existingEntry.module)
    setTransactions(existingEntry.transactions)
    setVerifiedByName(existingEntry.verified_by_name)
    setVerifiedDate(existingEntry.verified_date)
    setReviewFrequency(existingEntry.review_frequency ?? "quarterly")
    setFormData(existingEntry.form_data)
    setCurrentVersion(existingEntry.version)
    setGapId(existingEntry.gap_id)
    setFormState(existingEntry.status === "archived" ? "archived" : "draft_editing")
  }

  // Deliberately kept as an effect (not the render-time pattern used above)
  // — localStorage is a browser-only API unavailable during SSR, so this
  // must run after hydration to avoid a client/server render mismatch, the
  // one case the set-state-in-effect rule's own guidance still calls for
  // an effect ("synchronize with an external system").
  useEffect(() => {
    if (mode === "create") {
      const hasSeenOnboarding = localStorage.getItem(ONBOARDING_SEEN_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read must be deferred past hydration; see comment above.
      if (!hasSeenOnboarding) setShowOnboarding(true)
    }
  }, [mode])

  const formDataString = JSON.stringify(formData)
  const { entities: detectedEntities } = useEntityDetector(formDataString, {
    debounceMs: 800,
    enabled: Boolean(contentType) && formState !== "loading",
  })

  const buildPayload = useCallback(
    (publish: boolean, changeSummary?: string): QuickEntrySubmitPayload => {
      const payload: QuickEntrySubmitPayload = {
        document_id: documentId,
        content_type: contentType ?? "",
        module,
        transactions,
        verified_by_name: verifiedByName,
        verified_date: verifiedDate,
        review_frequency: contentType === "config" ? reviewFrequency : null,
        form_data: formData,
        gap_id: gapId,
        publish,
        change_summary: changeSummary ?? null,
        current_version: currentVersion,
      }
      // Required by the real backend for every draft (non-publish) save —
      // drafts never bump `version`, so the backend uses this timestamp as
      // its own atomic compare-and-swap instead (see quickEntry.ts's doc
      // comment on QuickEntrySubmitPayload.expected_updated_at).
      if (!publish && existingEntry?.updated_at) {
        payload.expected_updated_at = existingEntry.updated_at
      }
      return payload
    },
    [documentId, contentType, module, transactions, verifiedByName, verifiedDate, reviewFrequency, formData, gapId, currentVersion, existingEntry]
  )

  const { saveStatus } = useAutoSave({
    enabled: formState === "draft_editing" && Boolean(contentType),
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
    dependencies: [formDataString, documentId, module, verifiedByName, verifiedDate, transactions],
  })

  const submitEntry = useCallback(
    async (changeSummary?: string) => {
      setFormState("submitting")
      const payload = buildPayload(true, changeSummary)

      try {
        if (savedEntryId) {
          const result = await updateMutation.mutateAsync(payload)
          setCurrentVersion(result.version)
        } else {
          const result = await createMutation.mutateAsync(payload)
          setSavedEntryId(result.id)
          router.replace(`/admin/quick-entry/${result.id}`, { scroll: false })
        }
        setFormState("processing")
        setShowProcessingDrawer(true)
      } catch (error) {
        if (isApiStatus(error, 409) && error instanceof APIError) {
          const body = error.body as { current_entry?: QuickEntryFull } | undefined
          if (body?.current_entry) {
            setConflictData(body.current_entry)
            setShowConflict(true)
            setFormState("conflict")
            return
          }
        }
        setFormState("draft_editing")
      }
    },
    [savedEntryId, buildPayload, createMutation, updateMutation, router]
  )

  const handleSubmitClick = useCallback(async () => {
    if (!contentType) return
    setFormState("duplicate_checking")

    const summaryText =
      (formData as { issue_description?: string; procedure_name?: string; configuration_name?: string }).issue_description ||
      (formData as { procedure_name?: string }).procedure_name ||
      (formData as { configuration_name?: string }).configuration_name ||
      ""

    try {
      const result = await checkDuplicate(module, contentType, summaryText)
      if (result.has_similar && result.matches.length > 0) {
        setDuplicateResults(result.matches)
        setFormState("duplicate_found")
      } else {
        await submitEntry()
      }
    } catch {
      setFormState("draft_editing")
    }
  }, [contentType, formData, module, submitEntry])

  const handleProcessingComplete = useCallback((_finalStatus: string) => {
    setFormState("processing_done")
  }, [])

  if (formState === "loading") {
    return <QuickEntryFormSkeleton />
  }

  if (formState === "selecting_type" && !contentType) {
    return (
      <>
        <ContentTypeSelector
          onSelect={(type) => {
            setContentType(type)
            if (type === "error_guide" && prefill?.issue_description) {
              setFormData({ issue_description: prefill.issue_description })
            }
            setFormState("draft_editing")
          }}
          onShowOnboarding={() => setShowOnboarding(true)}
        />
        {showOnboarding && (
          <QuickEntryOnboardingModal
            onClose={() => {
              setShowOnboarding(false)
              localStorage.setItem(ONBOARDING_SEEN_KEY, "1")
            }}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-primary shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/admin/quick-entry")} className="text-xs text-text-tertiary hover:text-text-primary">
            ← Quick Entry
          </button>
          <span className="text-text-tertiary">/</span>
          <span className="text-xs text-text-primary font-medium">{mode === "create" ? "New Entry" : documentId || "Edit Entry"}</span>
        </div>

        <AutoSaveIndicator status={saveStatus} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {formState === "archived" && (
            <div className="p-3 rounded-lg bg-warning-bg border border-warning-border">
              <p className="text-sm text-warning-text font-medium">This entry is archived. It is no longer active in the knowledge base.</p>
            </div>
          )}

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
            isReadOnly={formState === "archived"}
            gapId={gapId}
            isEditMode={mode === "edit"}
          />

          {contentType === "error_guide" && (
            <ErrorGuideFormFields data={formData} onChange={setFormData} entryId={savedEntryId} screenshots={existingEntry?.screenshots ?? []} isReadOnly={formState === "archived"} />
          )}
          {contentType === "procedure" && (
            <ProcedureFormFields data={formData} onChange={setFormData} entryId={savedEntryId} screenshots={existingEntry?.screenshots ?? []} isReadOnly={formState === "archived"} />
          )}
          {contentType === "config" && (
            <ConfigFormFields data={formData} onChange={setFormData} entryId={savedEntryId} screenshots={existingEntry?.screenshots ?? []} isReadOnly={formState === "archived"} />
          )}
        </div>

        <aside className="w-64 shrink-0 border-l border-border-primary overflow-y-auto">
          <SapEntityPanel entities={detectedEntities} onChunkPreview={() => setShowChunkPreview(true)} contentType={contentType!} formData={formData} documentId={documentId} module={module} />
        </aside>
      </div>

      <QuickEntryFormActions
        formState={formState}
        status={existingEntry?.status}
        contentType={contentType}
        savedEntryId={savedEntryId}
        onSaveDraft={() => submitEntry()}
        onSubmit={handleSubmitClick}
        onViewProcessing={() => setShowProcessingDrawer(true)}
      />

      {showOnboarding && (
        <QuickEntryOnboardingModal
          onClose={() => {
            setShowOnboarding(false)
            localStorage.setItem(ONBOARDING_SEEN_KEY, "1")
          }}
        />
      )}

      {formState === "duplicate_found" && (
        <DuplicateCheckModal
          matches={duplicateResults}
          onSubmitAnyway={() => submitEntry()}
          onUpdateExisting={(targetEntry) => {
            // check-duplicate's real response only carries the matched
            // entry's document_id (from its Qdrant payload), never its
            // internal UUID — /admin/quick-entry/[id] looks entries up by
            // UUID, so there's no valid direct edit URL to construct here.
            // Routes to the filtered list instead (same pattern
            // CoverageSearchBar's own result click already uses), one click
            // short of a direct jump rather than a broken link.
            router.push(`/admin/quick-entry?search=${encodeURIComponent(targetEntry.document_id)}`)
          }}
          onCancel={() => setFormState("draft_editing")}
        />
      )}

      {showProcessingDrawer && savedEntryId && (
        <ProcessingStatusDrawer entryId={savedEntryId} onClose={() => setShowProcessingDrawer(false)} onProcessingComplete={handleProcessingComplete} />
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
          serverEntry={conflictData}
          onAcceptServer={() => {
            setFormData(conflictData.form_data)
            setCurrentVersion(conflictData.version)
            setShowConflict(false)
            setFormState("draft_editing")
          }}
          onKeepLocal={() => {
            setCurrentVersion(conflictData.version)
            setShowConflict(false)
            setFormState("draft_editing")
          }}
          onClose={() => {
            setShowConflict(false)
            setFormState("draft_editing")
          }}
        />
      )}
    </div>
  )
}

function QuickEntryFormSkeleton() {
  return (
    <div className="flex flex-col h-full px-6 py-6 space-y-4">
      <div className="h-6 w-48 rounded bg-bg-tertiary animate-pulse" />
      <div className="h-9 w-full rounded bg-bg-tertiary animate-pulse" />
      <div className="h-9 w-full rounded bg-bg-tertiary animate-pulse" />
      <div className="h-24 w-full rounded bg-bg-tertiary animate-pulse" />
    </div>
  )
}
