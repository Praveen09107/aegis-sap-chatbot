"use client"

import { useCallback, useRef } from "react"
import { useChatStore } from "@/stores/chatStore"
import { useSessionStore } from "@/stores/sessionStore"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"
import { api } from "@/lib/api"
import { detectSAPEntities } from "@/lib/sapEntityDetector"
import { BACKEND, TIMING } from "@/lib/constants"
import { toastError } from "@/lib/toast"
import type { WSMessage, ChatMessage } from "@/types"

interface UseWebSocketReturn {
  /** Connect to the WebSocket (if needed) and send a message */
  sendMessage: (message: string, screenshotFile?: File | null) => Promise<void>
  /** Disconnect the current WebSocket cleanly */
  disconnect: () => void
  /** Whether a WebSocket connection is currently open */
  isConnected: boolean
}

// ── Multi-tab coordination (SUPPLEMENT_05 Part 1) ────────────────
//
// Each tab has its own independent WebSocket session — there is no
// sharing. The warning is purely informational so users don't think two
// tabs are somehow synced with each other.
const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Date.now()}`

let broadcastChannel: BroadcastChannel | null = null

/**
 * Starts multi-tab detection via BroadcastChannel. Call once, e.g. in the
 * employee layout's mount effect. Safe to call in environments without
 * BroadcastChannel support (Safari <15.4) — skips gracefully.
 */
export function initMultiTabDetection(setMultiTabWarning: (v: boolean) => void) {
  if (typeof window === "undefined") return
  if (!("BroadcastChannel" in window)) return

  try {
    broadcastChannel = new BroadcastChannel("aegis-chat-tabs")

    broadcastChannel.onmessage = (event) => {
      if (event.data.type === "tab-active" && event.data.tabId !== TAB_ID) {
        setMultiTabWarning(true)
        setTimeout(() => setMultiTabWarning(false), 10_000)
      }
      if (event.data.type === "tab-inactive" && event.data.tabId !== TAB_ID) {
        setMultiTabWarning(false)
      }
    }

    broadcastChannel.postMessage({ type: "tab-active", tabId: TAB_ID })

    window.addEventListener("beforeunload", () => {
      broadcastChannel?.postMessage({ type: "tab-inactive", tabId: TAB_ID })
      broadcastChannel?.close()
    })
  } catch {
    // BroadcastChannel can fail in some embedded contexts — silent fallback
  }
}

// ── WebSocket close codes ─────────────────────────────────────────
//
// 4001 is the backend's own code for EVERY auth failure path (confirmed
// via authentication.py's ws_authenticate: missing token, unknown signing
// key, wrong client, revoked token, expired token — all close with 4001,
// not the 4000/4003 split some earlier planning assumed). 4002 is this
// client's own code for a pong-timeout close, deliberately different from
// 4001 so the two are never confused: a dead connection should attempt a
// fresh connect on the next send, an auth failure should not.
const WS_AUTH_FAILURE_CODE = 4001
const WS_PONG_TIMEOUT_CODE = 4002

/**
 * Complete WebSocket connection manager for the AEGIS chat interface.
 *
 * Built against the real, confirmed-live backend contract (verified by
 * reading chat_handler.py and authentication.py directly, not assumed):
 * - session_ready / token / stream_complete / validation_result / error /
 *   pong all match real backend payloads.
 * - validation_result.answer_text is the authoritative final answer —
 *   preferred over whatever was accumulated from "token" messages, since a
 *   regeneration pass can silently produce a different final answer
 *   (regeneration bypasses the token Pub/Sub channel entirely).
 * - retrieval_progress is declared in the protocol but never actually sent
 *   by any current backend code path — handled here for forward
 *   compatibility, not relied on for the core "thinking" → "streaming" UX.
 * - related_questions is not yet sent by the backend either; falls back to
 *   local SAP-module detection on green-badge answers.
 *
 * Connection lifecycle:
 * 1. First message in a session: connect WebSocket, then send
 * 2. Subsequent messages: reuse the open connection
 * 3. Keepalive: ping every 30s, force-close if no pong within 10s
 * 4. No silent auto-reconnect: an unexpected drop marks the in-progress
 *    response incomplete (with a Retry action) rather than guessing at
 *    reconnect-and-resend semantics that risk a duplicate submission — the
 *    next real send (manual retry or a new message) connects fresh anyway.
 *
 * F16 / FRONTEND_26 note: that document's own reconnection design proposes
 * a silent auto-reconnect loop (3 attempts, 1s/2s/4s backoff) on unexpected
 * close. Deliberately NOT adopted here — it would reintroduce the exact
 * duplicate-submission risk point 4 above already avoids (auto-reconnecting
 * and blindly resending an in-flight message the backend may have already
 * received). The existing mark-incomplete-plus-manual-retry design already
 * achieves FRONTEND_26's real goal (a dropped connection doesn't strand the
 * user) through a different, safer mechanism: the next explicit send
 * reuses `connect(currentSessionId)`, which opens a fresh socket against
 * the SAME session_id.
 *
 * Confirmed live (2026-07-22) against the real backend, not just that a
 * reconnect attempt fires: opened a WS connection, completed a real turn,
 * closed the connection, then opened a second WS connection passing the
 * same session_id — the backend resumed the identical session
 * (session_ready echoed the same session_id) and ran a full real round
 * trip (retrieval → CRAG → a defined completion message) on the
 * reconnected socket. The reconnect-on-next-send mechanism genuinely
 * re-establishes a working chat session against live infrastructure.
 */
export function useWebSocket(): UseWebSocketReturn {
  const queryClient = useQueryClient()

  // Shared between startPingInterval (sets it) and handleIncomingMessage's
  // "pong" case (clears it). A ref, not a plain closure variable — both
  // sides mutate it from callbacks that outlive the render that created
  // them (a setTimeout callback, an async WS message handler), which
  // react-hooks/immutability (React Compiler-era) flags for a bare `let`;
  // a ref's .current mutation is the sanctioned way to hold a mutable value
  // across renders without upsetting the compiler's purity analysis.
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── WS token fetch ──────────────────────────────────────────
  //
  // No separate backend token-exchange endpoint exists (confirmed: no
  // /api/auth/ws-token route anywhere in the backend) — the WebSocket's own
  // ws_authenticate validates a normal Keycloak access-token JWT directly.
  // This route relays the existing access_token cookie; see
  // src/app/api/auth/ws-token/route.ts for the full explanation.
  const getWsToken = useCallback(async (): Promise<string> => {
    const resp = await fetch("/api/auth/ws-token")
    if (!resp.ok) throw new Error("Failed to get WebSocket token")
    const { ws_token } = await resp.json()
    return ws_token
  }, [])

  // ── Related questions fallback ───────────────────────────────
  //
  // The backend does not currently send related_questions on
  // validation_result (confirmed — absent from the real payload in
  // chat_handler.py). msg.related_questions is checked first for forward
  // compatibility; otherwise these generic, module-keyed fallbacks apply,
  // matching FRONTEND_13's own documented fallback design.
  const deriveRelatedQuestions = useCallback((msg: WSMessage, answerText: string): string[] => {
    if (msg.related_questions && msg.related_questions.length > 0) return msg.related_questions
    if (msg.confidence_badge !== "green") return []

    const entities = detectSAPEntities(answerText)
    const hasSd = entities.some((e) => ["VL", "VA", "VF"].some((p) => e.value.startsWith(p)))
    const hasFi = entities.some((e) => ["FB", "FF", "F5"].some((p) => e.value.startsWith(p)))
    const hasMm = entities.some((e) => ["MB", "MM", "ME"].some((p) => e.value.startsWith(p)))

    if (hasSd) {
      return [
        "How do I check the current delivery status?",
        "What is the difference between VL01N and VL02N?",
      ]
    }
    if (hasFi) {
      return [
        "How do I view the posting period settings?",
        "What does an F5201 error indicate?",
      ]
    }
    if (hasMm) {
      return ["How do I view stock with MMBE?", "What is unrestricted stock vs restricted stock?"]
    }
    return []
  }, [])

  // ── Message handler ─────────────────────────────────────────

  const handleIncomingMessage = useCallback((raw: MessageEvent) => {
    let msg: WSMessage
    try {
      msg = JSON.parse(raw.data as string) as WSMessage
    } catch {
      console.warn("[WS] Could not parse message:", raw.data)
      return
    }

    const { setStreamingState, addMessage, appendToken, updateLastMessageValidation, setCurrentSessionId } =
      useChatStore.getState()
    const { setActiveSessionId } = useSessionStore.getState()

    switch (msg.type) {
      // Server confirms session is ready — save session ID
      case "session_ready": {
        if (msg.session_id) {
          setCurrentSessionId(msg.session_id)
          setActiveSessionId(msg.session_id)
        }
        break
      }

      // Retrieval / generation progress stages — declared in the protocol,
      // not currently sent by any real backend path (see module doc comment).
      case "retrieval_progress": {
        const stage = msg.stage
        if (stage === "retrieving") setStreamingState("retrieving")
        else if (stage === "crag") setStreamingState("generating")
        else if (stage === "generating") setStreamingState("generating")
        else if (stage === "validating") setStreamingState("validating")
        break
      }

      // Streaming tokens — append to last assistant message
      case "token": {
        if (msg.token) {
          setStreamingState("streaming")
          appendToken(msg.token)
        }
        break
      }

      // All tokens sent — move to validating state
      case "stream_complete": {
        setStreamingState("validating")
        break
      }

      // Validation complete — authoritative final text, badge, attribution
      case "validation_result": {
        const answerText = msg.answer_text ?? ""
        updateLastMessageValidation({
          validationScore: msg.validation_score ?? 0,
          confidenceBadge: msg.confidence_badge ?? null,
          attributionPanel: msg.attribution_panel ?? null,
          answerText: msg.answer_text,
          relatedQuestions: deriveRelatedQuestions(msg, answerText),
        })
        setStreamingState("complete")
        // Refresh session list so a new session appears in the sidebar
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
        break
      }

      // Vision model's proactive response after background screenshot
      // analysis completes — a standalone push, not a reply to the
      // in-flight turn, so it starts a fresh assistant message rather than
      // appending to whatever's currently in the store.
      case "vision_refined_answer": {
        if (msg.message) {
          const visionMessage: ChatMessage = {
            id: `vision-${Date.now()}`,
            role: "assistant",
            content: msg.message,
            timestamp: new Date(),
            streamingState: "streaming",
            confidenceBadge: null,
            visionContext: {
              message: msg.message,
              diagnostic_summary: msg.diagnostic_summary ?? "",
              error_code: msg.error_code,
            },
          }
          addMessage(visionMessage)
          setStreamingState("streaming")
        }
        break
      }

      // Error response from backend
      case "error": {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            msg.message ??
            "I could not find a reliable answer to your question. Your query has been escalated for review.",
          timestamp: new Date(),
          streamingState: "error",
          confidenceBadge: "none",
          attributionPanel: null,
        }
        addMessage(errorMessage)
        setStreamingState("error")

        // ticket_id is not populated synchronously by the real backend (the
        // ticket-creation task is fire-and-forget) — the message text itself
        // already tells the employee a ticket is being raised, so the toast
        // doesn't need to gate on a ticket_id that will realistically never
        // be present here.
        toastError("No reliable answer found", msg.message ?? "Your query has been escalated for review.")
        break
      }

      // Keepalive pong — clear the timeout set in startPingInterval below.
      case "pong": {
        if (pongTimeoutRef.current) {
          clearTimeout(pongTimeoutRef.current)
          pongTimeoutRef.current = undefined
        }
        break
      }

      default:
        console.debug("[WS] Unhandled message type:", msg.type)
    }
  }, [queryClient, deriveRelatedQuestions])

  // ── Ping / pong keepalive ─────────────────────────────────

  const startPingInterval = useCallback((ws: WebSocket) => {
    const pingInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return

      ws.send(JSON.stringify({ type: "ping" }))

      pongTimeoutRef.current = setTimeout(() => {
        console.warn("[WS] Pong timeout — connection may be lost")
        ws.close(WS_PONG_TIMEOUT_CODE, "Pong timeout")
      }, TIMING.WS_PONG_TIMEOUT_MS)
    }, TIMING.WS_PING_INTERVAL_MS)

    return () => {
      clearInterval(pingInterval)
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
    }
  }, [])

  // ── Connect ───────────────────────────────────────────────

  const connect = useCallback(async (existingSessionId?: string | null): Promise<WebSocket> => {
    const token = await getWsToken()
    const sessionParam = existingSessionId ? `&session_id=${existingSessionId}` : ""
    const url = `${BACKEND.WS_BASE}${BACKEND.WS_CHAT_PATH}?token=${token}${sessionParam}`

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      useChatStore.getState().setWebSocket(ws)

      let stopPing: (() => void) | undefined

      const connectTimeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"))
        ws.close()
      }, 8000)

      ws.onopen = () => {
        clearTimeout(connectTimeout)
        stopPing = startPingInterval(ws)
        resolve(ws)
      }

      ws.onmessage = handleIncomingMessage

      ws.onerror = (err) => {
        console.error("[WS] Error:", err)
      }

      ws.onclose = (event) => {
        stopPing?.()
        useChatStore.getState().setWebSocket(null)

        const isCleanClose = event.code === 1000 || event.code === 1001
        const isAuthFailure = event.code === WS_AUTH_FAILURE_CODE

        if (isCleanClose) return

        if (isAuthFailure) {
          useChatStore.getState().setStreamingState("error")
          toastError("Connection failed", event.reason || "Your session could not be authenticated.")
          return
        }

        // Unexpected close (network drop, pong timeout, server restart, etc.)
        const { streamingState } = useChatStore.getState()
        const isStreaming = !["idle", "complete", "error"].includes(streamingState)

        if (isStreaming) {
          useChatStore.getState().markLastMessageIncomplete()
          toastError("Connection interrupted", "The response was cut short. You can retry the message.")
        }
      }
    })
  }, [getWsToken, handleIncomingMessage, startPingInterval])

  // ── Screenshot upload ─────────────────────────────────────
  //
  // Uploads via the real /api/upload/screenshot endpoint, which queues
  // backend vision analysis in the background and returns {status,
  // session_id, task_id, message} — it does NOT return a URL or path the
  // client could relay in a later chat message. A confirmed, real backend
  // gap: upload_screenshot() never reads the caller's actual chat
  // session_id (request.state.session_id is never set anywhere in this
  // codebase), so the task is queued under a throwaway random session_id,
  // and the endpoint returns nothing the client could pass as
  // screenshot_path on the WS "message" payload (_handle_client_message
  // reads that field, but nothing populates it end to end). This is a
  // backend-side fix (proper session correlation + returning a usable
  // path), out of scope for a frontend-only session — the upload itself
  // still runs and still queues real vision processing; if
  // vision_refined_answer's proactive push does arrive on this connection,
  // it's handled correctly above.
  const uploadScreenshot = useCallback(async (file: File): Promise<void> => {
    const formData = new FormData()
    formData.append("file", file)
    await api.upload<{ status: string; session_id: string; task_id: string; message: string }>(
      "screenshot",
      formData
    )
  }, [])

  // ── Main: sendMessage ─────────────────────────────────────

  const sendMessage = useCallback(
    async (messageText: string, screenshotFile?: File | null) => {
      const { currentSessionId, pendingScreenshot, addMessage, setStreamingState, setComposeValue, clearScreenshot } =
        useChatStore.getState()
      const screenshot = screenshotFile ?? pendingScreenshot

      // Add user message immediately (optimistic)
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageText,
        timestamp: new Date(),
      }
      addMessage(userMessage)
      setComposeValue("")
      setStreamingState("thinking")

      if (screenshot) clearScreenshot()

      try {
        if (screenshot) {
          await uploadScreenshot(screenshot)
        }

        let ws = useChatStore.getState().websocket
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          ws = await connect(currentSessionId)
        }

        const sessionId = useChatStore.getState().currentSessionId ?? currentSessionId

        ws.send(
          JSON.stringify({
            type: "message",
            message: messageText,
            session_id: sessionId,
          })
        )
      } catch (err) {
        console.error("[WS] sendMessage error:", err)
        setStreamingState("error")
        toastError("Failed to send message", "Check your connection and try again.")
      }
    },
    [connect, uploadScreenshot]
  )

  // ── Disconnect ────────────────────────────────────────────

  const disconnect = useCallback(() => {
    const ws = useChatStore.getState().websocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Session ended by user")
    }
  }, [])

  const websocket = useChatStore((s) => s.websocket)
  const isConnected = !!websocket && websocket.readyState === WebSocket.OPEN

  return { sendMessage, disconnect, isConnected }
}
