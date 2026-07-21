"use client"

import { useMemo } from "react"
import { Search } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { EmptyState } from "@/components/admin/EmptyState"
import { GapCard } from "@/components/admin/GapCard"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminGaps } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import { ANALYTICS_RANGES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { GapEntry } from "@/hooks/queries/adminData"

const RANGE_OPTIONS = ANALYTICS_RANGES.filter((r) => r.value !== "all")

type Severity = "high" | "medium" | "low"

function severityOf(entry: GapEntry): Severity {
  if (entry.count_7d > 6) return "high"
  if (entry.count_7d >= 2) return "medium"
  return "low"
}

const SEVERITY_SECTIONS: { severity: Severity; label: string }[] = [
  { severity: "high", label: "High severity" },
  { severity: "medium", label: "Medium severity" },
  { severity: "low", label: "Low severity" },
]

function GapSection({ label, entries, onHide }: { label: string; entries: GapEntry[]; onHide: (id: string) => void }) {
  if (entries.length === 0) return null
  return (
    <div className="space-y-3">
      <p className="section-label">
        {label} ({entries.length})
      </p>
      <div className="space-y-3">
        {entries.map((entry) => (
          <GapCard key={entry.gap_id} entry={entry} onHide={onHide} />
        ))}
      </div>
    </div>
  )
}

export default function KnowledgeGapsPage() {
  const { gapsRangeDays, setGapsRangeDays, gapsSearch, setGapsSearch } = useAdminStore()
  const [hiddenIds, setHiddenIds] = useLocalStorage<string[]>("aegis:hidden-gap-ids", [])

  const { data: gaps = [], isLoading } = useAdminGaps(gapsRangeDays)

  const visibleGaps = useMemo(() => {
    const hiddenSet = new Set(hiddenIds)
    const query = gapsSearch.trim().toLowerCase()
    return gaps.filter((g) => {
      if (hiddenSet.has(g.gap_id)) return false
      if (!query) return true
      return (
        g.gap_description.toLowerCase().includes(query) ||
        g.example_queries.some((q) => q.toLowerCase().includes(query))
      )
    })
  }, [gaps, hiddenIds, gapsSearch])

  const bySeverity = useMemo(() => {
    const groups: Record<Severity, GapEntry[]> = { high: [], medium: [], low: [] }
    for (const gap of visibleGaps) {
      groups[severityOf(gap)].push(gap)
    }
    return groups
  }, [visibleGaps])

  function handleHide(gapId: string) {
    setHiddenIds((prev) => [...prev, gapId])
  }

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Knowledge gaps"
        description="Recurring employee queries the knowledge base can't answer well"
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {RANGE_OPTIONS.map((range) => (
          <Button
            key={range.value}
            variant={gapsRangeDays === range.days ? "default" : "outline"}
            size="sm"
            onClick={() => range.days !== null && setGapsRangeDays(range.days)}
          >
            {range.label}
          </Button>
        ))}

        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
          <Input
            value={gapsSearch}
            onChange={(e) => setGapsSearch(e.target.value)}
            placeholder="Search gaps..."
            className="pl-8 h-8 text-sm"
            aria-label="Search knowledge gaps"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className={cn("h-20 w-full rounded-xl")} />
          ))}
        </div>
      ) : visibleGaps.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No knowledge gaps found"
          description={
            gaps.length === 0
              ? "No recurring unanswered queries in this time range — the knowledge base is covering employee questions well."
              : "No gaps match your current search or hidden-item filters."
          }
          variant="page"
        />
      ) : (
        <div className="space-y-8">
          {SEVERITY_SECTIONS.map(({ severity, label }) => (
            <GapSection key={severity} label={label} entries={bySeverity[severity]} onHide={handleHide} />
          ))}
        </div>
      )}
    </AdminPageWrapper>
  )
}
