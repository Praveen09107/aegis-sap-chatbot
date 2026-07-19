"use client"

import { useRef, useEffect, useCallback } from "react"
import { Send, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScreenshotThumbnail } from "./ScreenshotThumbnail"
import type { StreamingState } from "@/types"
import { LAYOUT } from "@/lib/constants"

interface ComposeBarProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttachClick: () => void
  onRemoveScreenshot: () => void
  streamingState: StreamingState
  pendingScreenshot: File | null
  screenshotPreviewUrl: string | null
  disabled?: boolean
  className?: string
}

/**
 * Message compose bar at the bottom of the chat interface. Contains:
 * attachment button, auto-resizing textarea, screenshot preview, send
 * button.
 *
 * Keyboard behaviour:
 * - Enter: sends message
 * - Shift+Enter: inserts newline
 * - Cannot send while streamingState is not 'idle'/'complete'/'error'
 */
export function ComposeBar({
  value,
  onChange,
  onSend,
  onAttachClick,
  onRemoveScreenshot,
  streamingState,
  pendingScreenshot,
  screenshotPreviewUrl,
  disabled = false,
  className,
}: ComposeBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isStreaming = !["idle", "complete", "error"].includes(streamingState)
  const canSend = value.trim().length > 0 && !isStreaming && !disabled

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    const maxHeight = 160 // 5 lines approx
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (canSend) onSend()
      }
    },
    [canSend, onSend]
  )

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const event = new CustomEvent<File>("aegis:screenshot-selected", { detail: file })
      document.dispatchEvent(event)
    }
    // Reset input so the same file can be re-selected
    e.target.value = ""
  }

  function handleAttachClick() {
    onAttachClick()
    fileInputRef.current?.click()
  }

  return (
    <div className={cn("border-t border-border-primary bg-bg-card", "px-4 py-3", className)} style={{ minHeight: LAYOUT.EMPLOYEE_COMPOSE_HEIGHT }}>
      {/* Screenshot preview */}
      {pendingScreenshot && screenshotPreviewUrl && (
        <div className="mb-2">
          <ScreenshotThumbnail file={pendingScreenshot} previewUrl={screenshotPreviewUrl} onRemove={onRemoveScreenshot} />
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <button
          type="button"
          onClick={handleAttachClick}
          disabled={isStreaming || disabled}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            "border border-border-primary bg-bg-secondary text-text-tertiary",
            "hover:text-text-primary hover:bg-bg-tertiary hover:border-border-secondary",
            "transition-all duration-[var(--duration-normal)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
            "disabled:opacity-40 disabled:pointer-events-none"
          )}
          title="Attach SAP screenshot"
          aria-label="Attach SAP screenshot"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInputChange} aria-hidden="true" tabIndex={-1} />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your SAP issue or ask a question..."
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none overflow-hidden",
            "bg-transparent text-text-primary text-sm",
            "placeholder:text-text-tertiary",
            "focus:outline-none",
            "disabled:opacity-50",
            "leading-relaxed py-2"
          )}
          aria-label="Message input"
          aria-multiline="true"
        />

        {/* Send button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            "transition-all duration-[var(--duration-normal)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
            canSend ? "bg-accent text-white hover:bg-accent-hover active:scale-95 shadow-sm" : "bg-bg-tertiary text-text-tertiary cursor-not-allowed"
          )}
          aria-label={isStreaming ? "Waiting for response..." : "Send message"}
        >
          {isStreaming ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-text-tertiary mt-2 pl-11">
        Press <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">Enter</kbd> to send,{" "}
        <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">Shift + Enter</kbd> for new line
      </p>
    </div>
  )
}
