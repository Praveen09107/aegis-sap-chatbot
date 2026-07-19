"use client"

import { PanelRightClose, PanelRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { AttributionPanel } from "@/components/chat/AttributionPanel"
import { usePanelStore } from "@/stores/panelStore"
import { useChatStore } from "@/stores/chatStore"

/**
 * Right panel wrapper for the source attribution panel.
 * Contains: collapse toggle button + AttributionPanel content.
 *
 * When collapsed: shows a 48px icon strip with an expand chevron.
 * When expanded: shows full 210px attribution panel.
 *
 * The panel width is controlled by the parent grid (employee layout).
 * This component handles only its internal content display.
 */
export function AttributionPanelShell() {
  const { collapsed, toggle } = usePanelStore()
  const { messages, streamingState } = useChatStore()

  // Get the last AI message's attribution data
  const lastAIMessage = [...messages].reverse().find((m) => m.role === "assistant")
  const attribution = lastAIMessage?.attributionPanel ?? null
  const isStreaming = !["idle", "complete", "error"].includes(streamingState)

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full",
        "bg-bg-secondary border-l border-border-primary",
        "overflow-hidden",
        "transition-all duration-[250ms]",
      )}
      aria-label="Source attribution panel"
    >
      {/* Collapse toggle button */}
      <button
        onClick={toggle}
        className={cn(
          "absolute top-3 left-2 z-dropdown",
          "w-6 h-6 rounded-md flex items-center justify-center",
          "text-text-tertiary",
          "hover:text-text-primary hover:bg-bg-card hover:border hover:border-border-primary",
          "transition-all duration-[var(--duration-normal)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        )}
        aria-label={collapsed ? "Expand source panel" : "Collapse source panel"}
        title={collapsed ? "Expand source panel" : "Collapse source panel"}
      >
        {collapsed ? (
          <PanelRight className="w-3.5 h-3.5" />
        ) : (
          <PanelRightClose className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Panel content — hidden when collapsed */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-hide pt-1">
          <AttributionPanel
            attribution={attribution}
            score={lastAIMessage?.validationScore ?? null}
            isLoading={isStreaming && !attribution}
          />
        </div>
      )}

      {/* Collapsed icon strip */}
      {collapsed && (
        <div className="flex-1 flex flex-col items-center pt-12 gap-3">
          {/* Visual hint that panel has content */}
          {attribution && (
            <div
              className="w-1.5 h-1.5 rounded-full bg-success animate-status-pulse"
              aria-hidden="true"
              title="Source available — expand panel to view"
            />
          )}
        </div>
      )}
    </aside>
  )
}
