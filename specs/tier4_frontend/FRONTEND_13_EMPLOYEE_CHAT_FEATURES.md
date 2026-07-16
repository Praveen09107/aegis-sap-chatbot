# FRONTEND_13: EMPLOYEE CHAT FEATURES
## Advanced Chat Features — Keyboard Shortcuts, Session Export, SAP Detection, Screenshot Flow
## Session F08 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F08: Advanced employee chat features.
Run after FRONTEND_12_EMPLOYEE_CHAT in the same session or the next.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Session F07 (FRONTEND_12) complete.

**What this session creates/extends:**
```
src/app/(employee)/page.tsx         ← Extended: keyboard shortcuts, new-chat flow
src/components/chat/ChatInterface.tsx ← Extended: ⌘N shortcut, export handler

src/components/sessions/
└── SessionSearch.tsx               ← Full-text search UI for sidebar + history page

src/hooks/
└── useChatKeyboardShortcuts.ts     ← All chat-specific keyboard shortcuts

src/lib/
└── sessionExport.ts                ← Already created in F02 — verify + extend
```

**Key features this session enables:**
1. ⌘N — new chat session (clears current session, disconnects WS)
2. ⌘F — focus session search in sidebar
3. Shift+Enter — newline in compose bar (already in ComposeBar — verify)
4. Enter — send message (already in ComposeBar — verify)
5. Screenshot flow — complete drag-drop + file picker + upload + clear
6. Session export — trigger PDF download from session context menu
7. New session → sidebar update flow
8. Auto-detect SAP codes in user's typed question (pre-send highlight)

---

## FILE 1: src/hooks/useChatKeyboardShortcuts.ts (COMPLETE)

```typescript
'use client'

import { useCallback } from 'react'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useChatStore } from '@/stores/chatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { exportSessionAsPDF } from '@/lib/sessionExport'
import { STORAGE_KEYS, FEATURES } from '@/lib/constants'
import { TOAST } from '@/lib/toast'

/**
 * Registers all keyboard shortcuts for the employee chat interface.
 * Mount this hook once at the chat page level.
 *
 * Shortcuts registered:
 * ⌘N       → New chat session
 * ⌘F       → Focus session search
 * ⌘Shift+E → Export current session as PDF
 *
 * Note: ⌘K (command palette) is registered in the layout (FRONTEND_09).
 * Note: ⌘/ (shortcuts overlay) is registered in KeyboardShortcutsOverlay (FRONTEND_07).
 * Note: Enter/Shift+Enter are handled by ComposeBar's onKeyDown (FRONTEND_08).
 */
export function useChatKeyboardShortcuts() {
  const { resetForNewSession, messages, currentSessionId } = useChatStore()
  const { setActiveSessionId, setSearchQuery } = useSessionStore()
  const { disconnect } = useWebSocket()

  // ── ⌘N: New chat session ──────────────────────────────────

  const handleNewSession = useCallback(() => {
    // Disconnect existing WebSocket cleanly
    disconnect()
    // Clear all chat state
    resetForNewSession()
    setActiveSessionId(null)
    // Clear URL session param without navigation
    const url = new URL(window.location.href)
    url.searchParams.delete('session')
    window.history.replaceState({}, '', url.toString())
    TOAST.sessionUnpinned() // Subtle confirmation: not intrusive
  }, [disconnect, resetForNewSession, setActiveSessionId])

  // ── ⌘F: Focus session search ──────────────────────────────

  const handleFocusSearch = useCallback(() => {
    // Focus the session search input in the sidebar
    const searchInput = document.querySelector<HTMLInputElement>(
      'aside[aria-label="Session history"] input[type="search"]'
    )
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }, [])

  // ── ⌘Shift+E: Export current session ─────────────────────

  const handleExport = useCallback(async () => {
    if (!FEATURES.PDF_EXPORT || !currentSessionId || messages.length === 0) return

    try {
      // Get session topic from store
      const { sessions } = useSessionStore.getState()
      const session = sessions.find((s) => s.id === currentSessionId)
      const topic = session?.topic_summary ?? 'AEGIS Session'

      await exportSessionAsPDF(messages, topic)
      TOAST.sessionExported()
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [currentSessionId, messages])

  // ── Register shortcuts ────────────────────────────────────

  useKeyboardShortcuts([
    {
      key: 'n',
      meta: true,
      handler: handleNewSession,
      preventDefault: true,
    },
    {
      key: 'f',
      meta: true,
      handler: handleFocusSearch,
      preventDefault: true,
    },
    {
      key: 'e',
      meta: true,
      shift: true,
      handler: handleExport,
      preventDefault: true,
    },
  ])
}
```

---

## FILE 2: src/components/sessions/SessionSearch.tsx (COMPLETE)

```typescript
'use client'

import { useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { useDebounce } from '@/hooks/useDebounce'

interface SessionSearchProps {
  /** If true, auto-focuses on mount (used in history page) */
  autoFocus?: boolean
  /** Placeholder text */
  placeholder?: string
  className?: string
}

/**
 * Session search input — used in two places:
 * 1. SessionSidebar header (small, inline)
 * 2. Session History page header (full-width, prominent)
 *
 * Reads/writes sessionStore.searchQuery.
 * The search is client-side filter for sidebar,
 * and server-side full-text for the history page (handled by useSessions hook).
 */
export function SessionSearch({
  autoFocus = false,
  placeholder = 'Search sessions...',
  className,
}: SessionSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { searchQuery, setSearchQuery } = useSessionStore()

  // Auto-focus on mount (history page)
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Expose focus for ⌘F shortcut
  useEffect(() => {
    if (inputRef.current) {
      // Let the keyboard shortcut handler find this input by role
      inputRef.current.setAttribute('data-session-search', 'true')
    }
  }, [])

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search
        className="absolute left-3 w-3.5 h-3.5 text-text-tertiary pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-9 rounded-lg',
          'bg-bg-secondary border border-border-primary',
          'text-sm text-text-primary placeholder:text-text-tertiary',
          'pl-9 pr-8',
          'focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus',
          'transition-colors duration-[var(--duration-normal)]',
        )}
        aria-label="Search sessions by topic, error code, or SAP module"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute right-2.5 text-text-tertiary hover:text-text-secondary transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
```

---

## FILE 3: Screenshot Integration — Complete Flow

The screenshot feature spans three files. Verify each step is wired correctly.

### Step A: ScreenshotDropZone (FRONTEND_08 — already created)

```typescript
// ScreenshotDropZone wraps the entire ChatInterface
// When file is dropped: calls onFileAccepted(file)
// ChatInterface.handleScreenshotAccepted stores file in chatStore
```

### Step B: File picker in ComposeBar (FRONTEND_08 — verify wiring)

```typescript
// ComposeBar contains a hidden <input type="file" accept="image/*">
// Attach button (📎) triggers fileInputRef.current?.click()
// onChange handler:
function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  // Dispatch to ChatInterface via the custom event
  // (avoids prop drilling through ComposeBar → ChatInterface)
  document.dispatchEvent(new CustomEvent('aegis:screenshot-selected', { detail: file }))
  e.target.value = '' // allow re-selecting same file
}
```

### Step C: Listen in ChatInterface (update FRONTEND_12 ChatInterface.tsx)

Add this useEffect to ChatInterface.tsx to listen for the screenshot event:

```typescript
// Add inside ChatInterface function body:
useEffect(() => {
  function handleScreenshotEvent(e: Event) {
    const file = (e as CustomEvent<File>).detail
    if (file) handleScreenshotAccepted(file)
  }
  document.addEventListener('aegis:screenshot-selected', handleScreenshotEvent)
  return () => document.removeEventListener('aegis:screenshot-selected', handleScreenshotEvent)
}, [handleScreenshotAccepted])
```

### Step D: Upload in useWebSocket.ts (FRONTEND_12 — already implemented)

```typescript
// In sendMessage():
// 1. Detect pendingScreenshot in chatStore
// 2. Upload via api.upload('api/upload/screenshot', formData)
// 3. Receive screenshot_url
// 4. Include in WebSocket message: { type: 'message', ..., screenshot_url }
// 5. Clear screenshot from store after send
```

### Step E: Screenshot thumbnail display (FRONTEND_08 — ComposeBar)

```typescript
// ComposeBar receives:
//   pendingScreenshot: File | null
//   screenshotPreviewUrl: string | null
//   onRemoveScreenshot: () => void
// If pendingScreenshot is set, renders <ScreenshotThumbnail /> above the textarea
// Clicking X on thumbnail calls onRemoveScreenshot → clears chatStore
```

### Screenshot validation rules

```typescript
// Validate in ScreenshotDropZone AND the file picker handler:
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_SIZE_BYTES = 10 * 1024 * 1024  // 10MB

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only PNG, JPG, and WebP images are supported'
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'Screenshot must be under 10MB'
  }
  return null  // valid
}
```

---

## FILE 4: New Session Flow — Complete Specification

When the user starts a new chat (⌘N, "+" button, or clicking an already-active session):

```typescript
// 1. Close the existing WebSocket cleanly
disconnect()  // calls ws.close(1000, 'New session')

// 2. Revoke screenshot preview URL (memory management)
if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl)

// 3. Reset all chat state
useChatStore.setState({
  messages: [],
  streamingState: 'idle',
  currentSessionId: null,
  websocket: null,
  pendingScreenshot: null,
  screenshotPreviewUrl: null,
  composeValue: '',
})

// 4. Clear active session in session store
useSessionStore.getState().setActiveSessionId(null)

// 5. Remove session URL param
const url = new URL(window.location.href)
url.searchParams.delete('session')
window.history.replaceState({}, '', url.toString())

// 6. Focus compose bar
document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message input"]')?.focus()
```

---

## FILE 5: Updated chat page.tsx — With Shortcuts

```typescript
// Add to src/app/(employee)/page.tsx:
// 1. Import useChatKeyboardShortcuts
// 2. Call it inside the component

import { useChatKeyboardShortcuts } from '@/hooks/useChatKeyboardShortcuts'

export default function ChatPage() {
  // ... existing code ...

  // Register all chat keyboard shortcuts
  useChatKeyboardShortcuts()

  return (
    <>
      <ChatInterface ... />
      {FEATURES.ONBOARDING && (
        <OnboardingModal open={showOnboarding} onComplete={handleOnboardingComplete} />
      )}
    </>
  )
}
```

---

## FILE 6: SAP Entity Detection in Compose Bar — Live Preview

As the user types their question, the compose bar can show a subtle preview
of detected SAP entities. This is a non-intrusive feature — does not block
or modify the user's text, just shows badges below the input.

```typescript
// Add to ComposeBar.tsx — SAP entity detection preview
// Only shown when the user has paused typing (debounced)

'use client'
// ... existing imports ...
import { detectSAPEntities } from '@/lib/sapEntityDetector'
import { useDebounce } from '@/hooks/useDebounce'
import { EntityChip } from '@/components/chat/EntityChip'

// Inside ComposeBar function, add after the existing state:
const debouncedValue = useDebounce(value, 400)
const detectedEntities = useMemo(
  () => (debouncedValue.length > 2 ? detectSAPEntities(debouncedValue) : []),
  [debouncedValue]
)

// Add below the hint text at the bottom of ComposeBar:
{detectedEntities.length > 0 && (
  <div className="flex items-center gap-2 px-11 pb-1 flex-wrap" aria-live="polite" aria-label="Detected SAP entities">
    <span className="text-xs text-text-tertiary">Detected:</span>
    {detectedEntities.slice(0, 4).map((entity, i) => (
      <EntityChip
        key={i}
        type={entity.type}
        value={entity.value}
        showTooltip={false}
      />
    ))}
  </div>
)}
```

---

## FILE 7: Session History Loading — Edge Cases

When loading a historical session via `?session=<id>`, handle these edge cases:

### Edge case 1: Invalid session ID

```typescript
// In page.tsx:
const { data: historicalSession, isError } = useSession(sessionIdParam)

useEffect(() => {
  if (isError && sessionIdParam) {
    // Session not found or access denied
    toastError('Session not found', 'The requested session could not be loaded.')
    // Remove invalid param and show empty chat
    const url = new URL(window.location.href)
    url.searchParams.delete('session')
    window.history.replaceState({}, '', url.toString())
  }
}, [isError, sessionIdParam])
```

### Edge case 2: Session belongs to different user

```typescript
// The backend handles this — returns 403 Forbidden
// The api.get() helper shows "You do not have permission" toast automatically
// The useSession query will have isError=true, handled above
```

### Edge case 3: Loading session from sidebar

```typescript
// When user clicks a session card in SessionSidebar:
// SessionCard.onSelect() → setActiveSessionId(id)
// SessionSidebar.onSelect handler:

function handleSessionSelect(sessionId: string) {
  setActiveSessionId(sessionId)
  // Navigate to the session via URL (so deep links work and state is bookmarkable)
  router.push(`/?session=${sessionId}`)
}
```

### Edge case 4: Currently streaming — user clicks different session

```typescript
// In SessionCard, disable click during streaming:
const { streamingState } = useChatStore()
const isStreaming = !['idle', 'complete', 'error'].includes(streamingState)

// Show tooltip explaining why disabled:
<div
  title={isStreaming ? 'Wait for the current response to complete' : undefined}
  onClick={!isStreaming ? () => handleSelect(session.id) : undefined}
  className={cn(
    isStreaming && 'pointer-events-none opacity-60',
    // ... other classes
  )}
>
```

---

## FILE 8: Related Questions — Complete Integration

Related questions are 2-3 follow-up question suggestions shown after high-confidence responses.

### Backend contract (from FRONTEND_33 WebSocket extension)

The `validation_result` WebSocket message will include an optional `related_questions` field:

```typescript
// Extended validation_result message (FRONTEND_33 adds this field):
{
  type: "validation_result",
  validation_score: 0.91,
  confidence_badge: "green",
  attribution_panel: { ... },
  related_questions: [
    "How do I check stock availability with MMBE?",
    "What does safety stock mean in SAP?",
    "Can I create a partial delivery in VL01N?"
  ]
}
```

### Frontend handling in useWebSocket.ts

```typescript
// Update the 'validation_result' case in handleIncomingMessage:
case 'validation_result': {
  updateLastMessageValidation({
    validationScore: msg.validation_score ?? 0,
    confidenceBadge: msg.confidence_badge ?? null,
    attributionPanel: msg.attribution_panel ?? null,
  })
  setStreamingState('complete')

  // Pass related questions up to the chat page
  // (via a ref or callback registered in ChatInterface)
  if (msg.related_questions && msg.confidence_badge === 'green') {
    chatRelatedQuestionsCallbackRef.current?.(msg.related_questions)
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
  break
}
```

### Callback registration in ChatInterface

```typescript
// In ChatInterface.tsx, expose the callback for useWebSocket to call:
const chatRelatedQuestionsCallbackRef = useRef<((q: string[]) => void) | null>(null)

// Register the callback
chatRelatedQuestionsCallbackRef.current = useCallback((questions: string[]) => {
  onRelatedQuestionsUpdate?.(questions)
}, [onRelatedQuestionsUpdate])
```

### Fallback: Local question generation

If the backend does not yet send `related_questions`, generate client-side fallbacks
based on the SAP module detected in the response:

```typescript
// In ChatInterface.tsx, after streamingState becomes 'complete':
useEffect(() => {
  if (streamingState !== 'complete') return
  const lastAI = [...messages].reverse().find((m) => m.role === 'assistant')
  if (!lastAI || lastAI.confidenceBadge !== 'green') {
    setRelatedQuestions([])
    return
  }
  // If no related questions from server, provide generic module fallbacks
  if (relatedQuestions.length === 0) {
    const entities = detectSAPEntities(lastAI.content)
    const hasSd = entities.some(e => ['VL', 'VA', 'VF'].some(p => e.value.startsWith(p)))
    const hasFi = entities.some(e => ['FB', 'FF', 'F5'].some(p => e.value.startsWith(p)))
    const hasMm = entities.some(e => ['MB', 'MM', 'ME'].some(p => e.value.startsWith(p)))

    if (hasSd) {
      onRelatedQuestionsUpdate?.([
        'How do I check the current delivery status?',
        'What is the difference between VL01N and VL02N?',
      ])
    } else if (hasFi) {
      onRelatedQuestionsUpdate?.([
        'How do I view the posting period settings?',
        'What does the F5201 error indicate?',
      ])
    } else if (hasMm) {
      onRelatedQuestionsUpdate?.([
        'How do I view stock with MMBE?',
        'What is unrestricted stock vs restricted stock?',
      ])
    }
  }
}, [streamingState]) // eslint-disable-line react-hooks/exhaustive-deps
```

---

## FILE 9: Complete Keyboard Shortcut Map for Chat Portal

This table documents all shortcuts that must work in the employee chat interface.
Combine with the KeyboardShortcutsOverlay content from FRONTEND_07.

| Shortcut | Registered in | Action |
|---|---|---|
| `Enter` | ComposeBar onKeyDown | Send message |
| `Shift+Enter` | ComposeBar onKeyDown | New line in message |
| `⌘K` | Employee layout.tsx | Open command palette |
| `⌘N` | useChatKeyboardShortcuts | New chat session |
| `⌘F` | useChatKeyboardShortcuts | Focus session search |
| `⌘Shift+E` | useChatKeyboardShortcuts | Export session PDF |
| `⌘/` | KeyboardShortcutsOverlay | Toggle shortcuts overlay |
| `Escape` | Various | Close overlay / cancel |

**⌘K does NOT work in input fields** — this is correct behaviour. The `useKeyboardShortcuts`
hook has `ignoreInInput: true` by default. ⌘N has `ignoreInInput: false` because users might
want to start a new chat even while composing a message.

---

## FILE 10: Session Grouping Labels — Complete Specification

The `groupSessionsByDate()` function from `lib/utils.ts` produces these labels:

```
Today         → sessions from the past 24 hours
Yesterday     → sessions from 24-48 hours ago
This week     → sessions from 2-7 days ago
Last week     → sessions from 7-14 days ago  
This month    → sessions from 14-30 days ago
Older         → sessions more than 30 days old
```

```typescript
// Update groupSessionsByDate in lib/utils.ts to produce all labels:
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const hours = diff / (1000 * 60 * 60)
  const days = diff / (1000 * 60 * 60 * 24)

  if (hours < 24) return 'Today'
  if (hours < 48) return 'Yesterday'
  if (days < 7)   return 'This week'
  if (days < 14)  return 'Last week'
  if (days < 30)  return 'This month'
  return 'Older'
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: ⌘N creates new session
# → Type a message, send it, see it in history
# → Press ⌘N
# → Messages cleared, compose bar focused, URL loses ?session param
# → Session sidebar now has the old session visible

# Step 2: ⌘F focuses search
# → Press ⌘F (when not typing in compose)
# → Session search input should receive focus and be highlighted

# Step 3: Screenshot drag-drop complete flow
# → Drag a PNG onto the chat area → overlay appears
# → Drop it → thumbnail appears above compose bar with filename
# → Type a message and send
# → Network tab: POST /api/proxy/api/upload/screenshot called first
# → Then WebSocket message sent with screenshot_url
# → Thumbnail cleared after send

# Step 4: SAP entity preview in compose bar
# → Type "VL150" in compose bar
# → After 400ms debounce: small entity chip preview appears below: [VL150]
# → Type "VL01N" → preview shows: [VL150] [VL01N]

# Step 5: Related questions appear
# → After a high-confidence (green) AI response completes
# → 2-3 question chip buttons appear below the response
# → Clicking a chip immediately sends that question

# Step 6: Load session from sidebar
# → Click a historical session in the sidebar
# → URL changes to ?session=<id>
# → Messages load from that session
# → Right panel shows last response's attribution

# Step 7: Invalid session param
# → Navigate to /?session=invalid-id-doesnt-exist
# → Error toast appears: "Session not found"
# → URL param is cleared, empty chat is shown

# Step 8: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F08: Chat features — keyboard shortcuts, screenshot flow, SAP entity preview, related questions, session loading"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F08*
