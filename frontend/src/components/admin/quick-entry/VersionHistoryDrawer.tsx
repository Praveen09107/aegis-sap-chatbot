"use client"

import { useState } from "react"
import { X, RotateCcw, Clock } from "lucide-react"
import { formatRelativeDate } from "@/lib/utils"
import { useQuickEntryVersions, useRestoreQuickEntryVersion } from "@/hooks/queries"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  entryId: string
  currentVersion: number
  onClose: () => void
  onRestored: () => void
}

export function VersionHistoryDrawer({ entryId, currentVersion, onClose, onRestored }: Props) {
  const [restoring, setRestoring] = useState<number | null>(null)
  const { data, isLoading } = useQuickEntryVersions(entryId, true)
  const restoreMutation = useRestoreQuickEntryVersion(entryId)

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-96 h-full bg-bg-secondary border-l border-border-primary shadow-xl flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
            <span className="text-sm font-medium text-text-primary">Version History</span>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close version history">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded" />
              ))}
            </div>
          )}

          {data?.versions.map((version) => {
            const isCurrent = version.version === currentVersion
            return (
              <div key={version.version} className={"mb-3 p-3 rounded-lg border " + (isCurrent ? "border-border-focus bg-accent-subtle" : "border-border-primary bg-bg-card")}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-text-primary">Version {version.version}</span>
                      {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-white">Current</span>}
                    </div>
                    <p className="text-[10px] text-text-tertiary">
                      By {version.changed_by_name} · {formatRelativeDate(version.changed_at)}
                    </p>
                    {version.change_summary && <p className="text-[10px] text-text-tertiary mt-0.5 italic">&quot;{version.change_summary}&quot;</p>}
                  </div>

                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={restoring !== null}
                      onClick={() => {
                        setRestoring(version.version)
                        restoreMutation.mutate(version.version, {
                          onSuccess: () => {
                            setRestoring(null)
                            onRestored()
                          },
                          onError: () => setRestoring(null),
                        })
                      }}
                    >
                      {restoring === version.version ? (
                        "Restoring…"
                      ) : (
                        <>
                          <RotateCcw className="w-2.5 h-2.5 mr-1" aria-hidden="true" />
                          Restore
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
