"use client"

import { useCallback, useEffect } from "react"
import { useChatStore } from "@/stores/chatStore"
import { useWebSocket } from "@/hooks/useWebSocket"
import { useSubmitFeedback } from "@/hooks/queries"
import { MessageList } from "./MessageList"
import { ComposeBar } from "./ComposeBar"
import { ScreenshotDropZone } from "./ScreenshotDropZone"
import { cn } from "@/lib/utils"

interface ChatInterfaceProps {
  className?: string
}

/**
 * Main chat interface — assembles all chat components.
 * Wires: composeBar → useWebSocket → chatStore → messageList
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │  MessageList (flex-1, scrollable)   │
 * ├─────────────────────────────────────┤
 * │  ComposeBar (fixed height: 64px)    │
 * └─────────────────────────────────────┘
 *
 * The entire area is also a ScreenshotDropZone for drag-and-drop.
 *
 * Related questions are not managed here — MessageList reads them directly
 * off the last assistant message (see MessageList's own doc comment for
 * why prop-threading them through this component and the page would just
 * be unnecessary indirection with a single owner and a single consumer).
 */
export function ChatInterface({ className }: ChatInterfaceProps) {
  const {
    messages,
    streamingState,
    composeValue,
    setComposeValue,
    pendingScreenshot,
    screenshotPreviewUrl,
    setPendingScreenshot,
    setScreenshotPreviewUrl,
    clearScreenshot,
    currentSessionId,
  } = useChatStore()

  const { sendMessage } = useWebSocket()
  const submitFeedback = useSubmitFeedback()

  // ── Handlers ──────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = composeValue.trim()
    if (!text || streamingState === "streaming" || streamingState === "thinking") return
    await sendMessage(text, pendingScreenshot)
  }, [composeValue, streamingState, pendingScreenshot, sendMessage])

  const handleScreenshotAccepted = useCallback(
    (file: File) => {
      clearScreenshot() // revoke previous preview URL if any
      setPendingScreenshot(file)
      const url = URL.createObjectURL(file)
      setScreenshotPreviewUrl(url)
    },
    [clearScreenshot, setPendingScreenshot, setScreenshotPreviewUrl]
  )

  // Listen for the file-picker's screenshot selection (dispatched by
  // ComposeBar's hidden <input type="file"> onChange, since it has no
  // direct prop path to this component's handler).
  useEffect(() => {
    function handleScreenshotEvent(e: Event) {
      const file = (e as CustomEvent<File>).detail
      if (file) handleScreenshotAccepted(file)
    }
    document.addEventListener("aegis:screenshot-selected", handleScreenshotEvent)
    return () => document.removeEventListener("aegis:screenshot-selected", handleScreenshotEvent)
  }, [handleScreenshotAccepted])

  const handleFeedback = useCallback(
    (messageId: string, signal: "positive" | "negative") => {
      if (!currentSessionId) return
      // Find the turn index (0-indexed position among assistant messages)
      const assistantMessages = messages.filter((m) => m.role === "assistant")
      const turnIndex = assistantMessages.findIndex((m) => m.id === messageId)
      if (turnIndex === -1) return
      submitFeedback.mutate({ sessionId: currentSessionId, turnIndex, signal })
    },
    [currentSessionId, messages, submitFeedback]
  )

  const handleRelatedQuestion = useCallback(
    (question: string) => {
      setComposeValue(question)
      sendMessage(question)
    },
    [setComposeValue, sendMessage]
  )

  const handleRegenerate = useCallback(
    () => {
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
      if (lastUserMessage) sendMessage(lastUserMessage.content)
    },
    [messages, sendMessage]
  )

  const handleSuggestionClick = useCallback(
    (question: string) => {
      sendMessage(question)
    },
    [sendMessage]
  )

  const handleAttachClick = useCallback(() => {
    document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')?.click()
  }, [])

  return (
    <ScreenshotDropZone onFileAccepted={handleScreenshotAccepted} className={cn("flex flex-col h-full", className)}>
      <MessageList
        messages={messages}
        streamingState={streamingState}
        onFeedback={handleFeedback}
        onRelatedQuestion={handleRelatedQuestion}
        onRegenerate={handleRegenerate}
        onSuggestionClick={handleSuggestionClick}
        className="flex-1"
      />

      <ComposeBar
        value={composeValue}
        onChange={setComposeValue}
        onSend={handleSend}
        onAttachClick={handleAttachClick}
        onRemoveScreenshot={clearScreenshot}
        streamingState={streamingState}
        pendingScreenshot={pendingScreenshot}
        screenshotPreviewUrl={screenshotPreviewUrl}
      />
    </ScreenshotDropZone>
  )
}
