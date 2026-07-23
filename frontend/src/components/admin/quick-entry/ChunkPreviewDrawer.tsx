"use client"

import { X } from "lucide-react"
import { useMemo } from "react"
import { assembleChunksClient } from "@/lib/chunkAssembler"
import type { QuickEntryContentType } from "@/types"

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

export function ChunkPreviewDrawer({ contentType, documentId, module, transactions, verifiedByName, verifiedDate, formData, onClose }: Props) {
  // Keying the memo off formData's JSON string (rather than its object
  // identity, which changes every render) avoids unnecessary reassembly —
  // computed as its own memo first so the dependency list below stays a
  // list of simple identifiers.
  const formDataKey = useMemo(() => JSON.stringify(formData), [formData])

  const chunks = useMemo(() => {
    try {
      return assembleChunksClient({ contentType, documentId, module, transactions, verifiedByName, verifiedDate, formData })
    } catch {
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off formDataKey, not formData's own (unstable) object identity.
  }, [contentType, documentId, module, transactions, verifiedByName, verifiedDate, formDataKey])

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-[480px] h-full bg-bg-secondary border-l border-border-primary shadow-xl flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <div>
            <p className="text-sm font-medium text-text-primary">Chunk Preview — {chunks.length} chunks</p>
            <p className="text-[10px] text-text-tertiary">This is exactly what will be indexed in the knowledge base</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close chunk preview">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {chunks.map((chunk) => (
            <div key={chunk.chunk_type} className="rounded-lg border border-border-primary overflow-hidden">
              <div className="px-3 py-1.5 bg-bg-card border-b border-border-primary">
                <span className="text-[10px] font-mono text-accent">{chunk.chunk_type}</span>
              </div>
              <pre className="px-3 py-2.5 text-[10px] text-text-primary font-mono whitespace-pre-wrap leading-relaxed">{chunk.text}</pre>
            </div>
          ))}
          {chunks.length === 0 && <p className="text-xs text-text-tertiary text-center py-8">Fill in more fields to preview chunks</p>}
        </div>
      </div>
    </div>
  )
}
