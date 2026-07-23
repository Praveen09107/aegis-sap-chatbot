"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2, ExternalLink } from "lucide-react"
import { useDebounce } from "@/hooks/useDebounce"
import { useCoverageSearch } from "@/hooks/queries"
import { QuickEntrySourceBadge } from "./QuickEntrySourceBadge"
import { SAP_MODULES } from "@/lib/constants"

interface Props {
  onNavigateToNew: () => void
}

export function CoverageSearchBar({ onNavigateToNew }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [module, setModule] = useState("")
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 400)

  const { data, isLoading } = useCoverageSearch({ query: debouncedQuery, module }, { enabled: debouncedQuery.length >= 3 })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {isLoading ? (
            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary animate-spin" aria-hidden="true" />
          ) : (
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" aria-hidden="true" />
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => query.length >= 3 && setShowResults(true)}
            placeholder="Describe the issue or topic you want to add knowledge for…"
            className="w-full pl-7 pr-3 h-9 text-sm rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus placeholder:text-text-tertiary"
            aria-label="Search existing knowledge before creating a new entry"
          />
        </div>

        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="text-xs h-9 px-2 rounded-md border border-border-primary bg-bg-card text-text-primary focus:outline-none focus:border-border-focus"
          aria-label="Limit coverage search to a module"
        >
          <option value="">All modules</option>
          {Object.keys(SAP_MODULES).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <button onClick={onNavigateToNew} className="text-xs text-accent hover:underline whitespace-nowrap">
          Create new entry →
        </button>
      </div>

      {showResults && data && data.results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-primary rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-border-primary">
            <p className="text-[10px] text-text-tertiary">{data.results.length} similar entries found</p>
          </div>
          {data.results.map((result) => (
            <div
              key={result.document_id}
              className="px-3 py-2.5 hover:bg-bg-secondary border-b border-border-primary last:border-0 cursor-pointer"
              onClick={() => {
                setShowResults(false)
                router.push(`/admin/quick-entry?search=${encodeURIComponent(result.document_id)}`)
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-text-primary truncate">{result.title}</span>
                    <span className="text-[10px] font-mono text-text-tertiary shrink-0">{result.document_id}</span>
                  </div>
                  <p className="text-xs text-text-tertiary line-clamp-2">{result.preview}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <QuickEntrySourceBadge sourceType={result.source_type} />
                    <span className="text-[10px] text-text-tertiary">{result.module}</span>
                    <span className="text-[10px] text-text-tertiary">{result.status}</span>
                    <span className="text-[10px] text-accent">{Math.round(result.similarity_score * 100)}% similar</span>
                  </div>
                </div>
                <ExternalLink className="w-3 h-3 shrink-0 text-text-tertiary mt-1" aria-hidden="true" />
              </div>
            </div>
          ))}
          <div className="px-3 py-2 border-t border-border-primary">
            <button onClick={onNavigateToNew} className="text-xs text-accent hover:underline">
              These don&apos;t cover my topic — Create new entry anyway →
            </button>
          </div>
        </div>
      )}

      {showResults && debouncedQuery.length >= 3 && !isLoading && data?.results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-primary rounded-lg shadow-lg z-50 px-4 py-3">
          <p className="text-sm text-text-tertiary">No existing knowledge found for this topic.</p>
          <button onClick={onNavigateToNew} className="text-xs text-accent hover:underline mt-1">
            Create a new entry →
          </button>
        </div>
      )}
    </div>
  )
}
