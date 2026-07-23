"use client"

import { useEffect } from "react"
import { X, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react"
import { useQuickEntryPoll } from "@/hooks/queries"
import type { ProcessingLogStages } from "@/types"

interface Props {
  entryId: string
  onClose: () => void
  onProcessingComplete: (finalStatus: string) => void
}

const STAGE_LABELS: Record<keyof ProcessingLogStages, string> = {
  validation: "Schema validation",
  chunk_assembly: "Assembling knowledge chunks",
  entity_extraction: "Extracting SAP entities",
  embedding: "Generating embeddings",
  quality_scoring: "Scoring knowledge quality",
  deduplication: "Checking for duplicates",
  qdrant_insertion: "Indexing to vector store",
  opensearch_indexing: "Indexing to search",
  screenshot_enrichment: "Processing screenshots",
}

const TERMINAL_STATUSES = ["active", "archived", "low_quality", "failed", "partial_index"]

export function ProcessingStatusDrawer({ entryId, onClose, onProcessingComplete }: Props) {
  const { data: entry } = useQuickEntryPoll(entryId, true)

  useEffect(() => {
    if (!entry) return
    if (TERMINAL_STATUSES.includes(entry.status)) {
      onProcessingComplete(entry.status)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per status transition, not on every onProcessingComplete identity change.
  }, [entry?.status])

  const log = entry?.processing_log ?? null
  const isProcessing = entry?.status === "processing"

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-96 h-full bg-bg-secondary border-l border-border-primary shadow-xl flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <div className="flex items-center gap-2">
            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" aria-hidden="true" />}
            {entry?.status === "active" && <CheckCircle className="w-3.5 h-3.5 text-success" aria-hidden="true" />}
            {["failed", "low_quality"].includes(entry?.status ?? "") && <XCircle className="w-3.5 h-3.5 text-danger" aria-hidden="true" />}
            {entry?.status === "partial_index" && <AlertTriangle className="w-3.5 h-3.5 text-warning" aria-hidden="true" />}
            <span className="text-sm font-medium text-text-primary">Processing Status</span>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close processing status">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {log ? (
            (Object.keys(STAGE_LABELS) as Array<keyof ProcessingLogStages>).map((stageKey) => {
              const stage = log.stages[stageKey]
              if (!stage) return null
              return <ProcessingStageRow key={stageKey} label={STAGE_LABELS[stageKey]} stage={stage} stageKey={stageKey} />
            })
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-accent mb-3" aria-hidden="true" />
              <p className="text-sm text-text-tertiary">Processing queued — starting shortly…</p>
            </div>
          )}

          {log && entry && !isProcessing && (
            <div className={"p-3 rounded-lg border " + (entry.status === "active" ? "bg-success-bg border-success-border" : "bg-danger-bg border-danger-border")}>
              <p className="text-sm font-medium text-text-primary">
                {entry.status === "active" && "✓ Entry is now active in the knowledge base"}
                {entry.status === "partial_index" && "⚠ Partially indexed — retry in progress"}
                {entry.status === "low_quality" && "⚠ Quality below threshold — review and improve"}
                {entry.status === "failed" && "✗ Processing failed"}
              </p>
              {log.failure_reason && <p className="text-xs mt-1 text-text-tertiary">{log.failure_reason}</p>}
              {log.stages.quality_scoring?.avg_score !== undefined && log.stages.quality_scoring.avg_score !== null && (
                <p className="text-xs mt-1 text-text-tertiary">
                  Quality score: {(log.stages.quality_scoring.avg_score * 100).toFixed(0)}% (threshold:{" "}
                  {(log.stages.quality_scoring.threshold_used * 100).toFixed(0)}%)
                </p>
              )}
              {(log.stages.deduplication?.similar_entries?.length ?? 0) > 0 && (
                <p className="text-xs mt-1 text-warning">
                  Similar existing entries found:&nbsp;
                  {log.stages.deduplication!.similar_entries.map((e) => e.document_id).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProcessingStageRow({
  label,
  stage,
  stageKey,
}: {
  label: string
  stage: NonNullable<ProcessingLogStages[keyof ProcessingLogStages]>
  stageKey: keyof ProcessingLogStages
}) {
  const status = "status" in stage ? stage.status : "success"
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 mt-0.5">
        {status === "success" && <CheckCircle className="w-3.5 h-3.5 text-success" aria-hidden="true" />}
        {status === "failed" && <XCircle className="w-3.5 h-3.5 text-danger" aria-hidden="true" />}
        {status === "below_threshold" && <AlertTriangle className="w-3.5 h-3.5 text-warning" aria-hidden="true" />}
        {status === "partial" && <AlertTriangle className="w-3.5 h-3.5 text-warning" aria-hidden="true" />}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-text-primary">{label}</p>
        {"duration_ms" in stage && stage.duration_ms !== undefined && <p className="text-[10px] text-text-tertiary">{stage.duration_ms}ms</p>}
        {stageKey === "chunk_assembly" && "chunks_assembled" in stage && (
          <p className="text-[10px] text-text-tertiary">
            {stage.chunks_assembled} chunks: {(stage.chunk_types ?? []).join(", ")}
          </p>
        )}
        {stageKey === "entity_extraction" && "t_codes_found" in stage && (
          <p className="text-[10px] text-text-tertiary">T-codes: {(stage.t_codes_found ?? []).join(", ") || "none"}</p>
        )}
        {stageKey === "qdrant_insertion" && "chunks_failed" in stage && stage.chunks_failed > 0 && (
          <p className="text-[10px] text-warning">
            {stage.chunks_failed} chunk(s) failed: {(stage.failed_chunk_types ?? []).join(", ")}
          </p>
        )}
        {"errors" in stage && stage.errors?.map((err: string, i: number) => (
          <p key={i} className="text-[10px] text-danger">
            {err}
          </p>
        ))}
      </div>
    </div>
  )
}
