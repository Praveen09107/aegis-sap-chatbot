# IMPL_19: EMPLOYEE FRONTEND
## Next.js Chat Interface with WebSocket Streaming, Confidence Badge, Screenshot Upload
## Session 19 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 19: The employee-facing chat interface.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-18 complete. FastAPI running and healthy. Keycloak working.

**What this session creates:**
- `frontend/src/types/index.ts` — TypeScript types
- `frontend/src/lib/auth.ts` — ROPC login, token storage, refresh timer
- `frontend/src/lib/api.ts` — API call functions
- `frontend/src/lib/constants.ts` — Frontend constants
- `frontend/src/hooks/useWebSocket.ts` — Persistent WebSocket with streaming
- `frontend/src/hooks/useAuth.ts` — Auth state management
- `frontend/src/app/login/page.tsx` — Login form
- `frontend/src/app/page.tsx` — Chat interface root
- `frontend/src/app/layout.tsx` — Root layout
- `frontend/src/components/chat/ChatInterface.tsx` — Main chat container
- `frontend/src/components/chat/MessageBubble.tsx` — Message display
- `frontend/src/components/chat/ConfidenceBadge.tsx` — Green/amber badge
- `frontend/src/components/chat/AttributionPanel.tsx` — Source attribution
- `frontend/src/components/chat/FeedbackButtons.tsx` — Thumbs up/down
- `frontend/src/components/chat/FileUpload.tsx` — Screenshot upload

---

## FILE 1: frontend/src/types/index.ts

```typescript
// AEGIS Frontend TypeScript Types

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  validationScore?: number;
  confidenceBadge?: "green" | "amber" | "none" | null;
  attributionPanel?: AttributionPanel | null;
  timestamp: Date;
  visionRefinement?: VisionRefinement | null;
}

export interface AttributionPanel {
  primary_document_id: string;
  primary_document_name: string;
  verified_by: string;
  verified_date: string;
  secondary_sources: SecondarySource[];
  confidence_badge: "green" | "amber" | "none";
}

export interface SecondarySource {
  document_id: string;
  chunk_type: string;
  verified_date: string;
}

export interface VisionRefinement {
  message: string;
  diagnostic_summary: string;
  error_code?: string;
  transaction_code?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  role: "employee" | "it-admin" | null;
  isLoading: boolean;
  error: string | null;
}

export type WebSocketMessageType =
  | "token"
  | "stream_complete"
  | "validation_result"
  | "vision_refined_answer"
  | "error"
  | "correction"
  | "session_ready"
  | "pong";

export interface WebSocketMessage {
  type: WebSocketMessageType;
  session_id?: string;
  token?: string;
  validation_score?: number;
  confidence_badge?: "green" | "amber" | "none";
  attribution_panel?: AttributionPanel;
  message?: string;
  error_code?: string;
  ticket_id?: string;
  diagnostic_summary?: string;
}
```

---

## FILE 2: frontend/src/lib/constants.ts

```typescript
// AEGIS Frontend Constants

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export const KEYCLOAK_TOKEN_URL =
  `${process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://localhost:8080"}/realms/aegis-realm/protocol/openid-connect/token`;

export const KEYCLOAK_CLIENT_ID = "aegis-chat";
export const KEYCLOAK_CLIENT_SECRET =
  process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_SECRET || "aegis_chat_client_secret_dev";

// Token refresh: 12 minutes (720 seconds) before token expires at 900s
export const TOKEN_REFRESH_INTERVAL_MS = 720_000;

// WebSocket inactivity close: 3 minutes
export const WS_INACTIVITY_TIMEOUT_MS = 180_000;
```

---

## FILE 3: frontend/src/lib/auth.ts

```typescript
// AEGIS Authentication — ROPC (Resource Owner Password Credentials) Flow
// Used for demo — in production, replace with PKCE Authorization Code flow

"use client";

import { KEYCLOAK_TOKEN_URL, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } from "./constants";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function loginWithCredentials(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      grant_type: "password",
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      username,
      password,
    });

    const resp = await fetch(KEYCLOAK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({}));
      const msg = error.error_description || "Invalid username or password.";
      return { success: false, error: msg };
    }

    const data: TokenResponse = await resp.json();
    storeTokens(data.access_token, data.refresh_token);
    return { success: true };
  } catch (err) {
    return { success: false, error: "Connection error. Please try again." };
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  const refresh_token = getRefreshToken();
  if (!refresh_token) return false;

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      refresh_token,
    });

    const resp = await fetch(KEYCLOAK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!resp.ok) {
      clearTokens();
      return false;
    }

    const data: TokenResponse = await resp.json();
    storeTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export function logout() {
  clearTokens();
  window.location.href = "/login";
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("aegis_access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("aegis_refresh_token");
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function getUserRole(): "employee" | "it-admin" | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const roles: string[] = payload?.realm_access?.roles || [];
    if (roles.includes("it-admin")) return "it-admin";
    if (roles.includes("employee")) return "employee";
    return null;
  } catch {
    return null;
  }
}

function storeTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem("aegis_access_token", accessToken);
  sessionStorage.setItem("aegis_refresh_token", refreshToken);
}

function clearTokens() {
  sessionStorage.removeItem("aegis_access_token");
  sessionStorage.removeItem("aegis_refresh_token");
}
```

---

## FILE 4: frontend/src/hooks/useAuth.ts

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  isAuthenticated, getUserRole, refreshAccessToken, logout,
  TOKEN_REFRESH_INTERVAL_MS
} from "../lib/auth";
import { AuthState } from "../types";

// Re-export TOKEN_REFRESH_INTERVAL_MS for use in this file
const REFRESH_MS = 720_000;

export function useAuth(): AuthState & { logout: () => void } {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    role: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // Check auth state on mount
    const authenticated = isAuthenticated();
    const role = getUserRole();
    setState({ isAuthenticated: authenticated, role, isLoading: false, error: null });

    if (!authenticated) return;

    // Set up silent refresh timer (runs every 12 minutes)
    const refreshInterval = setInterval(async () => {
      const success = await refreshAccessToken();
      if (!success) {
        setState(prev => ({
          ...prev,
          isAuthenticated: false,
          role: null,
          error: "Session expired. Please log in again.",
        }));
        setTimeout(() => logout(), 2000);
      }
    }, REFRESH_MS);

    return () => clearInterval(refreshInterval);
  }, []);

  return { ...state, logout };
}
```

---

## FILE 5: frontend/src/hooks/useWebSocket.ts

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WS_BASE_URL } from "../lib/constants";
import { getAccessToken } from "../lib/auth";
import { Message, WebSocketMessage } from "../types";

interface UseWebSocketReturn {
  messages: Message[];
  sessionId: string | null;
  isConnected: boolean;
  sendMessage: (text: string) => void;
  uploadScreenshot: (file: File) => Promise<void>;
  sendFeedback: (turnIndex: number, signal: "positive" | "negative") => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      wsRef.current?.close(1000, "Inactivity timeout");
    }, 180_000); // 3 minutes
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE_URL}/ws/chat`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      resetInactivityTimer();
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (document.visibilityState !== "hidden") {
          const newWs = new WebSocket(`${WS_BASE_URL}/ws/chat?session_id=${sessionId || ""}`);
          wsRef.current = newWs;
        }
      }, 3000);
    };

    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      resetInactivityTimer();
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        console.error("Failed to parse WebSocket message", e);
      }
    };

    return () => {
      ws.close();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWebSocketMessage = useCallback((data: WebSocketMessage) => {
    switch (data.type) {
      case "session_ready":
        if (data.session_id) setSessionId(data.session_id);
        break;

      case "token":
        if (!streamingIdRef.current) {
          // Start new streaming message
          const newId = `msg-${Date.now()}`;
          streamingIdRef.current = newId;
          setMessages(prev => [...prev, {
            id: newId, role: "assistant", content: data.token || "",
            isStreaming: true, timestamp: new Date(),
          }]);
        } else {
          // Append token to streaming message
          setMessages(prev => prev.map(m =>
            m.id === streamingIdRef.current
              ? { ...m, content: m.content + (data.token || "") }
              : m
          ));
        }
        break;

      case "stream_complete":
        if (streamingIdRef.current) {
          setMessages(prev => prev.map(m =>
            m.id === streamingIdRef.current
              ? { ...m, isStreaming: false }
              : m
          ));
          streamingIdRef.current = null;
        }
        break;

      case "validation_result":
        // Attach badge and attribution to the last assistant message
        setMessages(prev => {
          const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === "assistant");
          if (lastAssistantIdx === -1) return prev;
          const idx = prev.length - 1 - lastAssistantIdx;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            validationScore: data.validation_score,
            confidenceBadge: data.confidence_badge,
            attributionPanel: data.attribution_panel || null,
          };
          return updated;
        });
        break;

      case "vision_refined_answer":
        // Add as a new assistant message with vision refinement data
        const visionMsgId = `vision-${Date.now()}`;
        setMessages(prev => [...prev, {
          id: visionMsgId, role: "assistant",
          content: data.message || "Screenshot analysed.",
          isStreaming: false, timestamp: new Date(),
          visionRefinement: {
            message: data.message || "",
            diagnostic_summary: (data as any).diagnostic_summary || "",
            error_code: (data as any).error_code,
            transaction_code: (data as any).transaction_code,
          },
        }]);
        break;

      case "error":
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: "assistant",
          content: data.message || "An error occurred.",
          isStreaming: false, timestamp: new Date(),
          confidenceBadge: "none",
        }]);
        break;

      case "pong":
        break; // Keep-alive response
    }
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Add user message to UI
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`, role: "user", content: text,
      timestamp: new Date(),
    }]);

    wsRef.current.send(JSON.stringify({
      type: "message", message: text, session_id: sessionId,
    }));
    resetInactivityTimer();
  }, [sessionId, resetInactivityTimer]);

  const uploadScreenshot = useCallback(async (file: File) => {
    const token = getAccessToken();
    if (!token) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch("/api/upload/screenshot", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (resp.ok) {
        const result = await resp.json();
        // Add user message indicating screenshot was sent
        setMessages(prev => [...prev, {
          id: `screenshot-${Date.now()}`, role: "user",
          content: `📷 Screenshot uploaded (${file.name}). Processing...`,
          timestamp: new Date(),
        }]);
      }
    } catch (e) {
      console.error("Screenshot upload failed", e);
    }
  }, []);

  const sendFeedback = useCallback((turnIndex: number, signal: "positive" | "negative") => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "feedback", signal, session_id: sessionId, turn_index: turnIndex,
    }));
  }, [sessionId]);

  return { messages, sessionId, isConnected, sendMessage, uploadScreenshot, sendFeedback };
}
```

---

## FILE 6: frontend/src/app/login/page.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithCredentials } from "../../lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await loginWithCredentials(username, password);
    setIsLoading(false);
    if (result.success) {
      router.push("/");
    } else {
      setError(result.error || "Login failed.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">AEGIS</h1>
          <p className="text-sm text-gray-500 mt-1">SAP Helpdesk Assistant — Sona Comstar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your SAP username"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your password"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## FILE 7: frontend/src/components/chat/ConfidenceBadge.tsx

```tsx
interface ConfidenceBadgeProps {
  badge: "green" | "amber" | "none" | null | undefined;
  score?: number;
}

export default function ConfidenceBadge({ badge, score }: ConfidenceBadgeProps) {
  if (!badge || badge === "none") return null;

  const config = {
    green: {
      label: "High Confidence",
      className: "bg-green-100 text-green-800 border border-green-200",
      dot: "bg-green-500",
    },
    amber: {
      label: "Moderate Confidence",
      className: "bg-amber-100 text-amber-800 border border-amber-200",
      dot: "bg-amber-500",
    },
  }[badge];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
      {score !== undefined && (
        <span className="opacity-60 ml-0.5">({Math.round(score * 100)}%)</span>
      )}
    </div>
  );
}
```

---

## FILE 8: frontend/src/components/chat/AttributionPanel.tsx

```tsx
import { AttributionPanel as AttributionPanelType } from "../../types";

interface Props {
  panel: AttributionPanelType;
}

export default function AttributionPanel({ panel }: Props) {
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
      <span className="font-medium">Source:</span>{" "}
      {panel.primary_document_id}
      {" · "}
      Verified {panel.verified_date} by {panel.verified_by}
      {panel.secondary_sources.length > 0 && (
        <span className="ml-1 text-gray-400">
          +{panel.secondary_sources.length} more
        </span>
      )}
    </div>
  );
}
```

---

## FILE 9: frontend/src/components/chat/FeedbackButtons.tsx

```tsx
import { useState } from "react";

interface Props {
  turnIndex: number;
  onFeedback: (turnIndex: number, signal: "positive" | "negative") => void;
}

export default function FeedbackButtons({ turnIndex, onFeedback }: Props) {
  const [submitted, setSubmitted] = useState<"positive" | "negative" | null>(null);

  function handleClick(signal: "positive" | "negative") {
    if (submitted) return;
    setSubmitted(signal);
    onFeedback(turnIndex, signal);
  }

  if (submitted) {
    return (
      <span className="text-xs text-gray-400 mt-1">
        {submitted === "positive" ? "👍 Thanks for the feedback" : "👎 Feedback recorded — we'll improve"}
      </span>
    );
  }

  return (
    <div className="flex gap-2 mt-1">
      <button
        onClick={() => handleClick("positive")}
        className="text-gray-400 hover:text-green-600 transition-colors text-sm"
        title="This answer was helpful"
        aria-label="Mark as helpful"
      >
        👍
      </button>
      <button
        onClick={() => handleClick("negative")}
        className="text-gray-400 hover:text-red-500 transition-colors text-sm"
        title="This answer was not helpful"
        aria-label="Mark as not helpful"
      >
        👎
      </button>
    </div>
  );
}
```

---

## FILE 10: frontend/src/components/chat/FileUpload.tsx

```tsx
import { useRef, useState } from "react";

interface Props {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png"];

export default function FileUpload({ onUpload, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG and PNG screenshots are supported.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Screenshot must be smaller than 10MB.");
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading}
        className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
        title="Upload SAP screenshot"
        aria-label="Upload screenshot"
      >
        {isUploading ? (
          <span className="text-xs text-blue-500">Uploading...</span>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15.75 10.5l-3-3m0 0l-3 3m3-3v9M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
```

---

## FILE 11: frontend/src/components/chat/MessageBubble.tsx

```tsx
import ConfidenceBadge from "./ConfidenceBadge";
import AttributionPanel from "./AttributionPanel";
import FeedbackButtons from "./FeedbackButtons";
import { Message } from "../../types";

interface Props {
  message: Message;
  turnIndex: number;
  onFeedback: (turnIndex: number, signal: "positive" | "negative") => void;
}

export default function MessageBubble({ message, turnIndex, onFeedback }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-2xl ${isUser ? "ml-12" : "mr-12"}`}>
        {/* Avatar and name */}
        {!isUser && (
          <p className="text-xs text-gray-400 mb-1 ml-1">AEGIS</p>
        )}

        {/* Message content */}
        <div
          className={`rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-200 text-gray-800 shadow-sm"
          }`}
        >
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Metadata row (badges, attribution, feedback) */}
        {!isUser && !message.isStreaming && (
          <div className="mt-1.5 ml-1 space-y-1">
            {message.confidenceBadge && message.confidenceBadge !== "none" && (
              <ConfidenceBadge
                badge={message.confidenceBadge}
                score={message.validationScore}
              />
            )}
            {message.attributionPanel && (
              <AttributionPanel panel={message.attributionPanel} />
            )}
            <FeedbackButtons turnIndex={turnIndex} onFeedback={onFeedback} />
          </div>
        )}

        {/* Vision refinement notice */}
        {!isUser && message.visionRefinement && (
          <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700 border border-blue-100">
            📷 {message.visionRefinement.error_code
              ? `Error ${message.visionRefinement.error_code} confirmed from screenshot`
              : "Screenshot context applied"}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## FILE 12: frontend/src/components/chat/ChatInterface.tsx

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";
import FileUpload from "./FileUpload";
import { useWebSocket } from "../../hooks/useWebSocket";

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const { messages, isConnected, sendMessage, uploadScreenshot, sendFeedback } = useWebSocket();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !isConnected) return;
    sendMessage(text);
    setInput("");
  }

  const assistantMessages = messages.filter(m => m.role === "assistant");

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">AEGIS SAP Assistant</h1>
            <p className="text-xs text-gray-400">Sona Comstar ERP Help</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`} />
          <span className="text-xs text-gray-400">{isConnected ? "Connected" : "Reconnecting..."}</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="text-center mt-20">
            <p className="text-gray-400 text-sm">
              Hello! I'm AEGIS, your SAP helpdesk assistant.
              How can I help you today?
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {["How do I fix VL150 error?",
                "How to create a scheduling agreement?",
                "What is the current posting period?"].map(suggestion => (
                <button key={suggestion} onClick={() => sendMessage(suggestion)}
                  className="text-xs text-blue-600 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-50">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            turnIndex={index}
            onFeedback={sendFeedback}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <FileUpload onUpload={uploadScreenshot} disabled={!isConnected} />
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Describe your SAP issue or ask a question..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={1}
              style={{ minHeight: "40px", maxHeight: "120px" }}
              disabled={!isConnected}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || !isConnected}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-1 ml-8">
          Press Enter to send · Shift+Enter for new line · Click 📎 to attach screenshot
        </p>
      </div>
    </div>
  );
}
```

---

## FILE 13: frontend/src/app/page.tsx

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "../lib/auth";
import ChatInterface from "../components/chat/ChatInterface";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [router]);

  if (!isAuthenticated()) return null;

  return <ChatInterface />;
}
```

---

## FILE 14: frontend/src/app/layout.tsx

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEGIS — SAP Helpdesk Assistant",
  description: "Sona Comstar SAP ERP Help",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

---

## FILE 15: frontend/src/app/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

---

## RUNNING THE FRONTEND

```bash
cd frontend
npm install
npm run dev
```
Access at `http://localhost:3000`

---

## VERIFICATION STEPS

### Step 1: Check TypeScript compilation
```bash
cd frontend
npm run type-check
```
Expected: No TypeScript errors.

### Step 2: Verify login flow
1. Open `http://localhost:3000`
2. Redirects to `/login` automatically (not authenticated)
3. Enter: username `employee1`, password `employee_demo_2024`
4. Redirects to `/` (chat interface)
5. Status indicator shows "Connected" (green dot)

### Step 3: Verify WebSocket streaming
1. Type "How do I fix VL150 error?" and press Enter
2. Message appears in chat immediately
3. Response streams token-by-token (text appears progressively)
4. Confidence badge appears after streaming completes
5. Attribution panel shows source document

### Step 4: Verify screenshot upload
1. Click the upload icon (📎)
2. Select a JPEG screenshot
3. "📷 Screenshot uploaded" message appears
4. After ~30-60 seconds, "Screenshot analysed" vision message appears

### Step 5: Verify feedback buttons
1. After receiving a response, thumbs up/down appear
2. Click 👍 — changes to "Thanks for the feedback"
3. Click 👎 on next response — changes to "Feedback recorded"

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-19: Employee Frontend - login, WebSocket streaming, badges verified"
```

---

*Document version: 1.0 | AEGIS Specification Set*
