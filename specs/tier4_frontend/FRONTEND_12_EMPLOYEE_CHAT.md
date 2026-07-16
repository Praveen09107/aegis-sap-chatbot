# FRONTEND_12: EMPLOYEE CHAT
## The Flagship AEGIS Experience — WebSocket Hook, Chat Interface, Message List
## Session F07 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F07: The complete employee chat interface.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F01–F06 complete (all stores, components, and query hooks exist).

**What this session creates:**
```
src/hooks/
└── useWebSocket.ts             ← Complete WebSocket connection manager

src/components/chat/
├── ChatInterface.tsx           ← Main chat container (assembles all chat components)
└── MessageList.tsx             ← Scrollable message list with auto-scroll

src/app/(employee)/
└── page.tsx                    ← Chat page (Next.js route, URL param handling)

src/app/api/auth/
└── ws-token/route.ts           ← WS authentication token endpoint
```

---

## WEBSOCKET PROTOCOL REFERENCE (from IMPL_11 + FRONTEND_33)

```
CONNECT:  /ws/chat?token=<ws_token>[&session_id=<existing_id>]

Server → Client messages (in sequence for a normal exchange):
  { type: "session_ready",        session_id: "abc123" }
  { type: "retrieval_progress",   stage: "retrieving" }
  { type: "retrieval_progress",   stage: "generating" }
  { type: "token",                token: "The " }
  { type: "token",                token: "VL150 " }
  ... (many token messages)
  { type: "stream_complete" }
  { type: "retrieval_progress",   stage: "validating" }
  { type: "validation_result",    validation_score: 0.91,
                                  confidence_badge: "green",
                                  attribution_panel: { ... } }

  -- OR on error --
  { type: "error",  message: "...", error_code: "VL150", ticket_id: "TKT-0042" }

  -- OR vision response --
  { type: "vision_refined_answer", message: "...", diagnostic_summary: "..." }

Client → Server messages:
  { type: "message",  message: "...", session_id: "abc123", screenshot_url?: "..." }
  { type: "feedback", signal: "positive"|"negative", session_id: "abc123", turn_index: 0 }
  { type: "ping" }
```

---

## FILE 1: src/app/api/auth/ws-token/route.ts (COMPLETE)

```typescript
/**
 * Issues a short-lived WebSocket authentication token.
 * Reads the HttpOnly access_token cookie and exchanges it for a WS-specific token
 * from the FastAPI backend.
 *
 * The WS token is short-lived (60s) to reduce security exposure.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(_request: NextRequest) {
  const cookieStore = cookies()
  const accessToken = cookieStore.get('access_token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const backendUrl = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:8000'
    const resp = await fetch(`${backendUrl}/api/auth/ws-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!resp.ok) {
      return NextResponse.json({ error: 'Failed to get WS token' }, { status: resp.status })
    }

    const data = await resp.json()
    return NextResponse.json({ token: data.token })
  } catch (err) {
    console.error('WS token error:', err)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
```

---

## FILE 2: src/hooks/useWebSocket.ts (COMPLETE)

```typescript
'use client'

import { useRef, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { api } from '@/lib/api'
import { BACKEND, TIMING } from '@/lib/constants'
import { toastError } from '@/lib/toast'
import type { WSMessage, ChatMessage } from '@/types'

interface UseWebSocketReturn {
  /** Connect to the WebSocket and send a message */
  sendMessage: (message: string, screenshotFile?: File | null) => Promise<void>
  /** Disconnect the current WebSocket cleanly */
  disconnect: () => void
  /** Whether a WebSocket connection is currently open */
  isConnected: boolean
}

/**
 * Complete WebSocket connection manager for the AEGIS chat interface.
 *
 * Connection lifecycle:
 * 1. First message in a session: connect WebSocket, wait for session_ready, send message
 * 2. Subsequent messages: reuse open connection, send message immediately
 * 3. Unexpected close: reconnect with backoff (max 3 attempts)
 * 4. Keepalive: ping every 30s, auto-disconnect if no pong within 10s
 *
 * Session handling:
 * - New chat: connect without session_id, server creates new session
 * - Existing session: pass currentSessionId in query param to resume
 * - After reconnect: server resumes the same session
 *
 * Vision flow:
 * - Screenshot is uploaded via HTTP to /api/upload/screenshot first
 * - Returned screenshot_url is included in the WebSocket message payload
 */
export function useWebSocket(): UseWebSocketReturn {
  const {
    websocket,
    setWebSocket,
    setStreamingState,
    addMessage,
    appendToken,
    updateLastMessageValidation,
    setCurrentSessionId,
    clearScreenshot,
  } = useChatStore()
  const { setActiveSessionId } = useSessionStore()
  const queryClient = useQueryClient()

  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const reconnectAttemptsRef = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 3

  // ── WS token fetch ──────────────────────────────────────────

  async function getWsToken(): Promise<string> {
    const resp = await fetch('/api/auth/ws-token')
    if (!resp.ok) throw new Error('Failed to get WebSocket token')
    const { token } = await resp.json()
    return token
  }

  // ── Message handler ─────────────────────────────────────────

  function handleIncomingMessage(raw: MessageEvent) {
    let msg: WSMessage
    try {
      msg = JSON.parse(raw.data as string) as WSMessage
    } catch {
      console.warn('[WS] Could not parse message:', raw.data)
      return
    }

    switch (msg.type) {
      // Server confirms session is ready — save session ID
      case 'session_ready': {
        if (msg.session_id) {
          setCurrentSessionId(msg.session_id)
          setActiveSessionId(msg.session_id)
        }
        break
      }

      // Retrieval / generation progress stages
      case 'retrieval_progress': {
        const stage = msg.stage
        if (stage === 'retrieving') setStreamingState('retrieving')
        else if (stage === 'crag') setStreamingState('generating')
        else if (stage === 'generating') setStreamingState('generating')
        else if (stage === 'validating') setStreamingState('validating')
        break
      }

      // Streaming tokens — append to last assistant message
      case 'token': {
        if (msg.token) {
          setStreamingState('streaming')
          appendToken(msg.token)
        }
        break
      }

      // All tokens sent — move to validating state
      case 'stream_complete': {
        setStreamingState('validating')
        break
      }

      // Validation complete — update badge and attribution
      case 'validation_result': {
        updateLastMessageValidation({
          validationScore: msg.validation_score ?? 0,
          confidenceBadge: msg.confidence_badge ?? null,
          attributionPanel: msg.attribution_panel ?? null,
        })
        setStreamingState('complete')
        // Refresh session list so new session appears in sidebar
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
        break
      }

      // Vision model refined the answer with screenshot context
      case 'vision_refined_answer': {
        if (msg.message) {
          appendToken(msg.message)
        }
        break
      }

      // Error response from backend
      case 'error': {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            msg.message ??
            'I could not find a reliable answer to your question. Your query has been escalated for review.',
          timestamp: new Date(),
          streamingState: 'error',
          confidenceBadge: 'none',
          attributionPanel: null,
        }
        addMessage(errorMessage)
        setStreamingState('error')

        if (msg.ticket_id) {
          toastError(
            `No reliable answer found`,
            `Ticket ${msg.ticket_id} created for IT review.`
          )
        }
        break
      }

      // Keepalive pong — clear pong timeout
      case 'pong': {
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
        break
      }

      default:
        console.debug('[WS] Unhandled message type:', msg.type)
    }
  }

  // ── Ping / pong keepalive ─────────────────────────────────

  function startPingInterval(ws: WebSocket) {
    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return

      // Send ping
      ws.send(JSON.stringify({ type: 'ping' }))

      // If no pong within 10s, consider disconnected
      pongTimeoutRef.current = setTimeout(() => {
        console.warn('[WS] Pong timeout — connection may be lost')
        ws.close(4001, 'Pong timeout')
      }, TIMING.WS_PONG_TIMEOUT_MS)
    }, TIMING.WS_PING_INTERVAL_MS)
  }

  function stopPingInterval() {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
  }

  // ── Connect ───────────────────────────────────────────────

  async function connect(existingSessionId?: string | null): Promise<WebSocket> {
    const token = await getWsToken()
    const sessionParam = existingSessionId ? `&session_id=${existingSessionId}` : ''
    const url = `${BACKEND.WS_BASE}${BACKEND.WS_CHAT_PATH}?token=${token}${sessionParam}`

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      setWebSocket(ws)

      const connectTimeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'))
        ws.close()
      }, 8000)

      ws.onopen = () => {
        clearTimeout(connectTimeout)
        reconnectAttemptsRef.current = 0
        startPingInterval(ws)
        resolve(ws)
      }

      ws.onmessage = handleIncomingMessage

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
      }

      ws.onclose = (event) => {
        stopPingInterval()
        setWebSocket(null)

        const isCleanClose = event.code === 1000 || event.code === 1001
        const isStreaming = !['idle', 'complete', 'error'].includes(
          useChatStore.getState().streamingState
        )

        if (!isCleanClose && isStreaming) {
          // Unexpected close during streaming — set error state
          setStreamingState('error')
          toastError(
            'Connection interrupted',
            'The response may be incomplete. Please try again.'
          )
        }
      }
    })
  }

  // ── Screenshot upload ─────────────────────────────────────

  async function uploadScreenshot(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const result = await api.upload<{ screenshot_url: string }>(
      'api/upload/screenshot',
      formData
    )
    return result.screenshot_url
  }

  // ── Main: sendMessage ─────────────────────────────────────

  const sendMessage = useCallback(
    async (messageText: string, screenshotFile?: File | null) => {
      const { currentSessionId, pendingScreenshot } = useChatStore.getState()
      const screenshot = screenshotFile ?? pendingScreenshot

      // Add user message immediately (optimistic)
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      }
      addMessage(userMessage)
      useChatStore.getState().setComposeValue('')
      setStreamingState('thinking')

      // Clear screenshot state
      if (screenshot) clearScreenshot()

      try {
        // Upload screenshot via HTTP if attached
        let screenshotUrl: string | undefined
        if (screenshot) {
          screenshotUrl = await uploadScreenshot(screenshot)
        }

        // Get or create WebSocket connection
        let ws = useChatStore.getState().websocket
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          ws = await connect(currentSessionId)
        }

        // Wait for session_ready if this is a new connection (new session)
        // For existing connections, currentSessionId is already set
        const sessionId =
          useChatStore.getState().currentSessionId ?? currentSessionId

        // Send the message payload
        ws.send(
          JSON.stringify({
            type: 'message',
            message: messageText,
            session_id: sessionId,
            ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
          })
        )
      } catch (err) {
        console.error('[WS] sendMessage error:', err)
        setStreamingState('error')
        toastError(
          'Failed to send message',
          'Check your connection and try again.'
        )
      }
    },
    [addMessage, setStreamingState, clearScreenshot]
  )

  // ── Disconnect ────────────────────────────────────────────

  const disconnect = useCallback(() => {
    const ws = useChatStore.getState().websocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Session ended by user')
    }
    stopPingInterval()
  }, [])

  const isConnected =
    !!websocket && websocket.readyState === WebSocket.OPEN

  return { sendMessage, disconnect, isConnected }
}
```

---

## FILE 3: src/components/chat/MessageList.tsx (COMPLETE)

```typescript
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { UserBubble } from './UserBubble'
import { AIResponseBubble } from './AIResponseBubble'
import { ChatEmptyState } from './ChatEmptyState'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import type { ChatMessage, StreamingState } from '@/types'

interface MessageListProps {
  messages: ChatMessage[]
  streamingState: StreamingState
  onFeedback: (messageId: string, signal: 'positive' | 'negative') => void
  onRelatedQuestion: (question: string) => void
  onRegenerate: (messageId: string) => void
  onSuggestionClick: (question: string) => void
  /** Related questions for the last completed response */
  relatedQuestions?: string[]
  className?: string
}

/**
 * Scrollable message list with auto-scroll behaviour.
 *
 * Auto-scroll rules:
 * - Scrolls to bottom automatically when: user is within 80px of the bottom
 * - Does NOT scroll when: user has scrolled up to read history
 * - "Scroll to bottom" button appears when user is >80px from bottom
 * - Always scrolls to bottom when user sends a new message
 */
export function MessageList({
  messages,
  streamingState,
  onFeedback,
  onRelatedQuestion,
  onRegenerate,
  onSuggestionClick,
  relatedQuestions = [],
  className,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : behavior })
    setShowScrollButton(false)
    isNearBottomRef.current = true
  }, [reducedMotion])

  // Track scroll position to decide if auto-scroll should fire
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceFromBottom < 80
    isNearBottomRef.current = nearBottom
    setShowScrollButton(!nearBottom && messages.length > 0)
  }, [messages.length])

  // Auto-scroll when messages change (new token added or message added)
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'instant' : 'smooth',
      })
    }
  }, [messages, reducedMotion])

  // Determine the last AI message (for related questions)
  const lastAIMessageIndex = [...messages]
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.role === 'assistant')
    .at(-1)?.i

  if (messages.length === 0) {
    return (
      <ChatEmptyState
        onSuggestionClick={onSuggestionClick}
        className={className}
      />
    )
  }

  return (
    <div className={cn('relative flex-1', className)}>
      {/* Scrollable container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto scrollbar-hide"
      >
        <div
          className="flex flex-col gap-5 px-5 py-5 min-h-full"
          role="list"
          aria-label="Chat messages"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
        >
          {messages.map((message, index) => {
            const isLastAI =
              index === lastAIMessageIndex && message.role === 'assistant'
            const isCurrentlyStreaming =
              isLastAI && streamingState !== 'complete' && streamingState !== 'error'

            return message.role === 'user' ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <AIResponseBubble
                key={message.id}
                message={message}
                streamingState={isLastAI ? streamingState : 'complete'}
                onFeedback={onFeedback}
                onRelatedQuestion={onRelatedQuestion}
                onRegenerate={onRegenerate}
                relatedQuestions={isLastAI && !isCurrentlyStreaming ? relatedQuestions : []}
              />
            )
          })}

          {/* Bottom anchor for auto-scroll */}
          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={() => scrollToBottom()}
            className={cn(
              'absolute bottom-4 right-4 z-sticky',
              'w-8 h-8 rounded-full',
              'bg-bg-card border border-border-primary shadow-md',
              'flex items-center justify-center',
              'text-text-secondary hover:text-text-primary',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
            aria-label="Scroll to latest message"
          >
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## FILE 4: src/components/chat/ChatInterface.tsx (COMPLETE)

```typescript
'use client'

import { useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useSubmitFeedback } from '@/hooks/queries'
import { MessageList } from './MessageList'
import { ComposeBar } from './ComposeBar'
import { ScreenshotDropZone } from './ScreenshotDropZone'
import { cn } from '@/lib/utils'
import { FEATURES } from '@/lib/constants'

interface ChatInterfaceProps {
  /** Related questions from last AI response (generated by backend, passed via page) */
  relatedQuestions?: string[]
  onRelatedQuestionsUpdate?: (questions: string[]) => void
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
 */
export function ChatInterface({
  relatedQuestions = [],
  onRelatedQuestionsUpdate,
  className,
}: ChatInterfaceProps) {
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

  const { sendMessage, isConnected } = useWebSocket()
  const submitFeedback = useSubmitFeedback()

  // ── Handlers ──────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = composeValue.trim()
    if (!text || streamingState === 'streaming' || streamingState === 'thinking') return
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

  const handleFeedback = useCallback(
    (messageId: string, signal: 'positive' | 'negative') => {
      if (!currentSessionId) return
      // Find the turn index (0-indexed position among assistant messages)
      const assistantMessages = messages.filter((m) => m.role === 'assistant')
      const turnIndex = assistantMessages.findIndex((m) => m.id === messageId)
      if (turnIndex === -1) return
      submitFeedback.mutate({ sessionId: currentSessionId, turnIndex, signal })
    },
    [currentSessionId, messages, submitFeedback]
  )

  const handleRelatedQuestion = useCallback(
    (question: string) => {
      setComposeValue(question)
      // Auto-send
      sendMessage(question)
    },
    [setComposeValue, sendMessage]
  )

  const handleRegenerate = useCallback(
    (_messageId: string) => {
      // Re-send the last user message
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === 'user')
      if (lastUserMessage) {
        sendMessage(lastUserMessage.content)
      }
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
    // Trigger file input — handled by ComposeBar's internal file input
    document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')?.click()
  }, [])

  return (
    <ScreenshotDropZone
      onFileAccepted={handleScreenshotAccepted}
      className={cn('flex flex-col h-full', className)}
    >
      {/* Message list */}
      <MessageList
        messages={messages}
        streamingState={streamingState}
        onFeedback={handleFeedback}
        onRelatedQuestion={handleRelatedQuestion}
        onRegenerate={handleRegenerate}
        onSuggestionClick={handleSuggestionClick}
        relatedQuestions={relatedQuestions}
        className="flex-1"
      />

      {/* Compose bar */}
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
```

---

## FILE 5: src/app/(employee)/page.tsx (COMPLETE)

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { useChatStore } from '@/stores/chatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useSession } from '@/hooks/queries'
import { STORAGE_KEYS, FEATURES } from '@/lib/constants'
import type { ChatMessage } from '@/types'

/**
 * Employee chat page — the root route of the employee portal.
 *
 * Responsibilities:
 * 1. Read ?session=<id> URL param — load historical session if present
 * 2. Check onboarding state — show OnboardingModal for first-time users
 * 3. Manage related questions state (from last AI response)
 * 4. Render ChatInterface
 *
 * Note: The three-panel layout shell (topbar, sidebar, right panel)
 * is provided by (employee)/layout.tsx — this page only renders the center panel.
 */
export default function ChatPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionIdParam = searchParams.get('session')

  const {
    messages,
    setCurrentSessionId,
    clearMessages,
    addMessage,
  } = useChatStore()
  const { setActiveSessionId } = useSessionStore()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([])

  // ── Historical session loading ─────────────────────────────

  const { data: historicalSession } = useSession(sessionIdParam)

  useEffect(() => {
    if (!sessionIdParam || !historicalSession) return

    // Load session messages into the chat store
    clearMessages()
    setCurrentSessionId(historicalSession.session.id)
    setActiveSessionId(historicalSession.session.id)

    // Reconstruct ChatMessage objects from session data
    const loadedMessages: ChatMessage[] = historicalSession.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
      streamingState: 'complete',
      confidenceBadge:
        (m.confidence_badge as ChatMessage['confidenceBadge']) ?? null,
      validationScore: m.validation_score ?? undefined,
      attributionPanel: m.attribution_doc_id
        ? {
            primary_document_id: m.attribution_doc_id,
            primary_document_name: m.attribution_doc_id,
            verified_by: '',
            verified_date: '',
            secondary_sources: [],
            confidence_badge: m.confidence_badge as any,
          }
        : null,
    }))

    loadedMessages.forEach((msg) => addMessage(msg))
  }, [sessionIdParam, historicalSession, clearMessages, setCurrentSessionId, setActiveSessionId, addMessage])

  // ── New chat (no session param) ────────────────────────────

  useEffect(() => {
    if (!sessionIdParam) {
      // No session param → ensure clean state
      const { currentSessionId } = useChatStore.getState()
      if (!currentSessionId) {
        clearMessages()
      }
    }
  }, [sessionIdParam, clearMessages])

  // ── Onboarding check ───────────────────────────────────────

  useEffect(() => {
    if (!FEATURES.ONBOARDING) return
    const completed = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
    if (!completed) {
      // First-time user — show onboarding after a brief delay
      const timer = setTimeout(() => setShowOnboarding(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  function handleOnboardingComplete() {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    setShowOnboarding(false)
  }

  // ── Related questions update ───────────────────────────────

  // Watch for new complete high-confidence AI messages
  // and extract related questions from them
  // Note: related questions are generated by the backend and included
  // in the validation_result payload. For now, we derive them here.
  // The backend will add a `related_questions` field to validation_result
  // in FRONTEND_33 (backend extension).
  const handleRelatedQuestionsUpdate = useCallback(
    (questions: string[]) => setRelatedQuestions(questions),
    []
  )

  return (
    <>
      <ChatInterface
        relatedQuestions={relatedQuestions}
        onRelatedQuestionsUpdate={handleRelatedQuestionsUpdate}
        className="h-full"
      />

      {/* First-time user onboarding */}
      {FEATURES.ONBOARDING && (
        <OnboardingModal
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
        />
      )}
    </>
  )
}
```

---

## WEBSOCKET STATE TRANSITIONS REFERENCE

The agent must implement UI changes for each streaming state exactly as shown:

```
idle          → Nothing shown. ComposeBar send button active.
              
thinking      → StreamingProgress shows "Thinking..."
              AI response bubble appears with aura-streaming border
              ComposeBar send button shows spinner, disabled
              
retrieving    → StreamingProgress shows "Retrieving SAP documentation..."
              
generating    → StreamingProgress shows "Generating response..."
              
streaming     → StreamingProgress hidden, streaming cursor shown
              Tokens appended to bubble content in real time
              Auto-scroll fires on each token if user is near bottom
              
validating    → StreamingProgress shows "Validating answer..."
              Streaming cursor hidden
              
complete      → StreamingProgress hidden, streaming cursor hidden
              ConfidenceBadge appears with animation (green/amber/none)
              Attribution ref appears
              ResponseActions appear (fade in)
              Related questions appear if badge=green (after 200ms delay)
              ComposeBar send button becomes active again
              
error         → Error message bubble appears with aura-danger
              Toast notification shown
              ComposeBar send button becomes active (user can retry)
```

---

## ERROR HANDLING PATTERNS

```typescript
// Pattern: WebSocket connection failure
// User message already added → show error message below it
// State: setStreamingState('error')
// Toast: "Failed to send message · Check your connection"
// Behavior: ComposeBar re-activates for retry

// Pattern: Backend INSUFFICIENT response (confidence_badge = null, type = "error")
// AI bubble appears with aura-danger
// Content: "I could not find a reliable answer..."
// Badge: 'none' (danger coloring)
// Toast: "No reliable answer found · Ticket TKT-0042 created" (if ticket_id present)

// Pattern: Vision upload failure
// Handled by api.upload() error handling
// Toast: "Failed to upload screenshot · Check file size and try again"
// screenshot cleared from store, user can retry
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Chat page loads
# → http://localhost:3000/
# → Should show: empty state with suggestion chips (ChatEmptyState)
# → AEGIS brand mark + welcome text visible

# Step 2: Send a message
# → Type a message, press Enter
# → User bubble appears immediately (optimistic)
# → Streaming progress shows "Thinking..." then "Retrieving..."
# → AI response bubble appears, tokens stream in with blinking cursor
# → After completion: badge appears, attribution ref, response actions

# Step 3: Confidence aura
# → Green badge → green left border on AI bubble
# → Amber badge → amber left border
# → None/error → red left border

# Step 4: Response actions on hover
# → Hover over an AI bubble
# → Copy, thumbs up, thumbs down buttons fade in

# Step 5: Screenshot drag-drop
# → Drag a PNG from desktop onto the chat area
# → Blue overlay appears: "Drop SAP screenshot here"
# → Drop it → thumbnail appears above compose bar
# → Send message → thumbnail cleared after send

# Step 6: Load historical session
# → http://localhost:3000/?session=<valid-session-id>
# → Session messages should load into the chat

# Step 7: Related questions
# → If backend sends high-confidence response with green badge
# → 2-3 question chips appear below the response

# Step 8: WebSocket keepalive
# → Open Network tab → WS tab
# → Should see ping message every 30 seconds
# → Should see pong response from server

# Step 9: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F07: Employee chat — useWebSocket, ChatInterface, MessageList, chat page, WS token route"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F07*
