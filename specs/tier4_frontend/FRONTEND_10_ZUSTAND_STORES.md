# FRONTEND_10: ZUSTAND STORES
## Complete State Management — All 5 Stores with Full TypeScript Implementation
## Session F06 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F06: Complete Zustand state management.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F01–F05 complete. The types referenced here come from
`src/types/index.ts` (created in FRONTEND_01).

**What this session creates:**
```
src/stores/
├── chatStore.ts      ← Chat messages, streaming state, WebSocket ref, screenshot
├── sessionStore.ts   ← Session list, search, pinned sessions, active session
├── panelStore.ts     ← Source panel collapse state (persisted)
├── uiStore.ts        ← Command palette, shortcuts overlay, global UI flags
└── adminStore.ts     ← Admin table selections, filters, upload progress, review state
```

**Architecture rule:** Stores hold UI state and derived state. Server state
(data from the API) lives in TanStack Query (FRONTEND_11). Never fetch data
inside a Zustand store — only manage client-side state.

---

## FILE 1: src/stores/chatStore.ts (COMPLETE)

```typescript
import { create } from 'zustand'
import type { ChatMessage, StreamingState, AttributionPanel } from '@/types'

interface ChatState {
  // ── Message list ──────────────────────────────────────────
  messages: ChatMessage[]

  /** Add a complete new message (user or AI) */
  addMessage: (message: ChatMessage) => void

  /**
   * Append a streaming token to the last AI message.
   * The last message must have role='assistant'.
   * Creates the assistant message placeholder if it doesn't exist.
   */
  appendToken: (token: string) => void

  /**
   * Update the last assistant message with validation results.
   * Called when the backend sends validation_result via WebSocket.
   */
  updateLastMessageValidation: (data: {
    validationScore: number
    confidenceBadge: ChatMessage['confidenceBadge']
    attributionPanel: AttributionPanel | null
  }) => void

  /** Clear all messages (when starting a new chat session) */
  clearMessages: () => void

  // ── Streaming state machine ──────────────────────────────
  streamingState: StreamingState
  setStreamingState: (state: StreamingState) => void

  // ── Current session ──────────────────────────────────────
  currentSessionId: string | null
  setCurrentSessionId: (id: string | null) => void

  // ── WebSocket reference ──────────────────────────────────
  /** The active WebSocket connection. Managed by useWebSocket hook in FRONTEND_12. */
  websocket: WebSocket | null
  setWebSocket: (ws: WebSocket | null) => void

  // ── Screenshot state ─────────────────────────────────────
  pendingScreenshot: File | null
  setPendingScreenshot: (file: File | null) => void

  screenshotPreviewUrl: string | null
  setScreenshotPreviewUrl: (url: string | null) => void

  /** Clear screenshot + revoke object URL to prevent memory leak */
  clearScreenshot: () => void

  // ── Compose bar ──────────────────────────────────────────
  composeValue: string
  setComposeValue: (value: string) => void

  // ── Reset ────────────────────────────────────────────────
  /** Reset entire chat state for a new session */
  resetForNewSession: () => void
}

const INITIAL_STATE = {
  messages: [],
  streamingState: 'idle' as StreamingState,
  currentSessionId: null,
  websocket: null,
  pendingScreenshot: null,
  screenshotPreviewUrl: null,
  composeValue: '',
}

export const useChatStore = create<ChatState>()((set, get) => ({
  ...INITIAL_STATE,

  // ── Message operations ──────────────────────────────────

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendToken: (token) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      const last = messages[lastIdx]

      if (!last || last.role !== 'assistant') {
        // Create placeholder assistant message
        const placeholder: ChatMessage = {
          id: `stream-${Date.now()}`,
          role: 'assistant',
          content: token,
          timestamp: new Date(),
          streamingState: 'streaming',
          confidenceBadge: null,
        }
        return { messages: [...state.messages, placeholder] }
      }

      // Append token to existing assistant message
      messages[lastIdx] = {
        ...last,
        content: last.content + token,
      }
      return { messages }
    }),

  updateLastMessageValidation: ({ validationScore, confidenceBadge, attributionPanel }) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      const last = messages[lastIdx]
      if (!last || last.role !== 'assistant') return state

      messages[lastIdx] = {
        ...last,
        validationScore,
        confidenceBadge,
        attributionPanel,
        streamingState: 'complete',
      }
      return { messages }
    }),

  clearMessages: () => set({ messages: [] }),

  // ── Streaming state ─────────────────────────────────────

  setStreamingState: (streamingState) => set({ streamingState }),

  // ── Session ─────────────────────────────────────────────

  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),

  // ── WebSocket ────────────────────────────────────────────

  setWebSocket: (websocket) => set({ websocket }),

  // ── Screenshot ──────────────────────────────────────────

  setPendingScreenshot: (pendingScreenshot) => set({ pendingScreenshot }),

  setScreenshotPreviewUrl: (screenshotPreviewUrl) => set({ screenshotPreviewUrl }),

  clearScreenshot: () => {
    const { screenshotPreviewUrl } = get()
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl)
    set({ pendingScreenshot: null, screenshotPreviewUrl: null })
  },

  // ── Compose bar ──────────────────────────────────────────

  setComposeValue: (composeValue) => set({ composeValue }),

  // ── Reset ────────────────────────────────────────────────

  resetForNewSession: () => {
    const { screenshotPreviewUrl, websocket } = get()
    // Revoke screenshot URL
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl)
    // Close WebSocket if open
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.close(1000, 'New session')
    }
    set({
      ...INITIAL_STATE,
      websocket: null,
    })
  },
}))
```

---

## FILE 2: src/stores/sessionStore.ts (COMPLETE)

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Session } from '@/types'
import { STORAGE_KEYS } from '@/lib/constants'

interface SessionState {
  // ── Session list (from server, managed by TanStack Query) ──
  /** Mirror of the server session list — updated by TanStack Query's onSuccess */
  sessions: Session[]
  setSessions: (sessions: Session[]) => void

  // ── Active session ───────────────────────────────────────
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void

  // ── Search ───────────────────────────────────────────────
  searchQuery: string
  setSearchQuery: (query: string) => void

  // ── Pinned sessions (persisted to localStorage) ──────────
  pinnedIds: Set<string>
  togglePin: (id: string) => void
  isPinned: (id: string) => boolean

  // ── Optimistic updates ───────────────────────────────────
  /** Optimistically rename a session before server confirms */
  renameSession: (id: string, newTitle: string) => void

  /** Optimistically remove a session before server confirms */
  removeSession: (id: string) => void

  // ── Derived ──────────────────────────────────────────────
  /** Get the currently active session object */
  getActiveSession: () => Session | undefined

  /** Get sessions sorted with pinned first, then by updated_at desc */
  getSortedSessions: () => Session[]

  /** Filter sessions by current search query */
  getFilteredSessions: () => Session[]
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      searchQuery: '',
      pinnedIds: new Set<string>(),

      setSessions: (sessions) => set({ sessions }),

      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      togglePin: (id) =>
        set((state) => {
          const next = new Set(state.pinnedIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { pinnedIds: next }
        }),

      isPinned: (id) => get().pinnedIds.has(id),

      renameSession: (id, newTitle) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, topic_summary: newTitle } : s
          ),
        })),

      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        })),

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find((s) => s.id === activeSessionId)
      },

      getSortedSessions: () => {
        const { sessions, pinnedIds } = get()
        return [...sessions].sort((a, b) => {
          const aPinned = pinnedIds.has(a.id)
          const bPinned = pinnedIds.has(b.id)
          if (aPinned && !bPinned) return -1
          if (!aPinned && bPinned) return 1
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
      },

      getFilteredSessions: () => {
        const { searchQuery } = get()
        const sorted = get().getSortedSessions()
        if (!searchQuery.trim()) return sorted
        const q = searchQuery.toLowerCase()
        return sorted.filter(
          (s) =>
            s.topic_summary.toLowerCase().includes(q) ||
            s.module_tags.some((t) => t.toLowerCase().includes(q))
        )
      },
    }),
    {
      name: STORAGE_KEYS.PINNED_SESSIONS,
      storage: createJSONStorage(() => {
        // Safe localStorage access for SSR
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
      // Only persist the pinned IDs and active session — not the sessions list
      // (sessions list comes fresh from the server on each mount)
      partialize: (state) => ({
        pinnedIds: Array.from(state.pinnedIds),  // Set → Array for JSON
        activeSessionId: state.activeSessionId,
      }),
      // Rehydrate: convert Array back to Set
      merge: (persisted: unknown, current) => {
        const p = persisted as { pinnedIds?: string[]; activeSessionId?: string | null }
        return {
          ...current,
          pinnedIds: new Set(p.pinnedIds ?? []),
          activeSessionId: p.activeSessionId ?? null,
        }
      },
    }
  )
)
```

---

## FILE 3: src/stores/panelStore.ts (COMPLETE)

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'

interface PanelState {
  // ── Source attribution panel (right panel in employee chat) ──
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void

  // ── Active panel tab ─────────────────────────────────────
  /** 'source' = document reference | 'scores' = breakdown bars */
  activeTab: 'source' | 'scores'
  setActiveTab: (tab: 'source' | 'scores') => void
}

/**
 * Panel collapse state is persisted to localStorage.
 * Users' preference is remembered across sessions.
 */
export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      collapsed: false,
      activeTab: 'source',

      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    {
      name: STORAGE_KEYS.PANEL_COLLAPSED,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
        }
        return localStorage
      }),
      partialize: (state) => ({
        collapsed: state.collapsed,
        activeTab: state.activeTab,
      }),
    }
  )
)
```

---

## FILE 4: src/stores/uiStore.ts (COMPLETE)

```typescript
import { create } from 'zustand'

interface UIState {
  // ── Command palette ───────────────────────────────────────
  commandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void

  // ── Keyboard shortcuts overlay ────────────────────────────
  shortcutsOverlayOpen: boolean
  openShortcutsOverlay: () => void
  closeShortcutsOverlay: () => void

  // ── Onboarding ────────────────────────────────────────────
  onboardingVisible: boolean
  setOnboardingVisible: (visible: boolean) => void

  // ── Global loading ────────────────────────────────────────
  /** True during initial auth check on app load */
  initializing: boolean
  setInitializing: (initializing: boolean) => void

  // ── Offline state ─────────────────────────────────────────
  isOffline: boolean
  setIsOffline: (offline: boolean) => void
}

/**
 * Global UI state — not persisted (reset on page reload).
 * Used by layouts to coordinate overlays and global state.
 */
export const useUIStore = create<UIState>()((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  shortcutsOverlayOpen: false,
  openShortcutsOverlay: () => set({ shortcutsOverlayOpen: true }),
  closeShortcutsOverlay: () => set({ shortcutsOverlayOpen: false }),

  onboardingVisible: false,
  setOnboardingVisible: (onboardingVisible) => set({ onboardingVisible }),

  initializing: true,
  setInitializing: (initializing) => set({ initializing }),

  isOffline: false,
  setIsOffline: (isOffline) => set({ isOffline }),
}))
```

---

## FILE 5: src/stores/adminStore.ts (COMPLETE)

```typescript
import { create } from 'zustand'
import type { DocFilters, AuditFilters } from '@/types'

interface AdminState {
  // ── Table row selection (per-page) ────────────────────────
  selectedDocumentIds: Set<string>
  setSelectedDocumentIds: (ids: Set<string>) => void
  clearDocumentSelection: () => void

  selectedRegistryIds: Set<string>
  setSelectedRegistryIds: (ids: Set<string>) => void
  clearRegistrySelection: () => void

  selectedAuditIds: Set<string>
  setSelectedAuditIds: (ids: Set<string>) => void
  clearAuditSelection: () => void

  selectedTicketIds: Set<string>
  setSelectedTicketIds: (ids: Set<string>) => void
  clearTicketSelection: () => void

  // ── Active detail drawer ──────────────────────────────────
  activeDocumentId: string | null
  setActiveDocumentId: (id: string | null) => void

  activeTicketId: string | null
  setActiveTicketId: (id: string | null) => void

  activeAuditId: string | null
  setActiveAuditId: (id: string | null) => void

  // ── Review queue ─────────────────────────────────────────
  reviewQueueIndex: number
  setReviewQueueIndex: (index: number) => void
  advanceReviewQueue: () => void

  // ── File upload progress ─────────────────────────────────
  /** Map of filename → upload progress percentage (0–100) */
  uploadProgress: Record<string, number>
  setUploadProgress: (filename: string, progress: number) => void
  removeUploadProgress: (filename: string) => void

  // ── Page-level filters ────────────────────────────────────
  documentFilters: DocFilters
  setDocumentFilters: (filters: Partial<DocFilters>) => void
  resetDocumentFilters: () => void

  auditFilters: AuditFilters
  setAuditFilters: (filters: Partial<AuditFilters>) => void
  resetAuditFilters: () => void

  // ── Analytics date range ─────────────────────────────────
  analyticsRange: string
  setAnalyticsRange: (range: string) => void

  // ── Knowledge gaps date range ─────────────────────────────
  gapsRangeDays: number
  setGapsRangeDays: (days: number) => void

  // ── Admin page search queries ─────────────────────────────
  documentSearch: string
  setDocumentSearch: (q: string) => void

  registrySearch: string
  setRegistrySearch: (q: string) => void

  gapsSearch: string
  setGapsSearch: (q: string) => void
}

const INITIAL_DOCUMENT_FILTERS: DocFilters = {}
const INITIAL_AUDIT_FILTERS: AuditFilters = {}

export const useAdminStore = create<AdminState>()((set) => ({
  // ── Table selection ──────────────────────────────────────

  selectedDocumentIds: new Set(),
  setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
  clearDocumentSelection: () => set({ selectedDocumentIds: new Set() }),

  selectedRegistryIds: new Set(),
  setSelectedRegistryIds: (selectedRegistryIds) => set({ selectedRegistryIds }),
  clearRegistrySelection: () => set({ selectedRegistryIds: new Set() }),

  selectedAuditIds: new Set(),
  setSelectedAuditIds: (selectedAuditIds) => set({ selectedAuditIds }),
  clearAuditSelection: () => set({ selectedAuditIds: new Set() }),

  selectedTicketIds: new Set(),
  setSelectedTicketIds: (selectedTicketIds) => set({ selectedTicketIds }),
  clearTicketSelection: () => set({ selectedTicketIds: new Set() }),

  // ── Active detail ─────────────────────────────────────────

  activeDocumentId: null,
  setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId }),

  activeTicketId: null,
  setActiveTicketId: (activeTicketId) => set({ activeTicketId }),

  activeAuditId: null,
  setActiveAuditId: (activeAuditId) => set({ activeAuditId }),

  // ── Review queue ──────────────────────────────────────────

  reviewQueueIndex: 0,
  setReviewQueueIndex: (reviewQueueIndex) => set({ reviewQueueIndex }),
  advanceReviewQueue: () =>
    set((state) => ({ reviewQueueIndex: state.reviewQueueIndex + 1 })),

  // ── Upload progress ───────────────────────────────────────

  uploadProgress: {},
  setUploadProgress: (filename, progress) =>
    set((state) => ({
      uploadProgress: { ...state.uploadProgress, [filename]: progress },
    })),
  removeUploadProgress: (filename) =>
    set((state) => {
      const next = { ...state.uploadProgress }
      delete next[filename]
      return { uploadProgress: next }
    }),

  // ── Filters ───────────────────────────────────────────────

  documentFilters: INITIAL_DOCUMENT_FILTERS,
  setDocumentFilters: (filters) =>
    set((state) => ({ documentFilters: { ...state.documentFilters, ...filters } })),
  resetDocumentFilters: () => set({ documentFilters: INITIAL_DOCUMENT_FILTERS }),

  auditFilters: INITIAL_AUDIT_FILTERS,
  setAuditFilters: (filters) =>
    set((state) => ({ auditFilters: { ...state.auditFilters, ...filters } })),
  resetAuditFilters: () => set({ auditFilters: INITIAL_AUDIT_FILTERS }),

  // ── Date ranges ───────────────────────────────────────────

  analyticsRange: '30d',
  setAnalyticsRange: (analyticsRange) => set({ analyticsRange }),

  gapsRangeDays: 30,
  setGapsRangeDays: (gapsRangeDays) => set({ gapsRangeDays }),

  // ── Search ────────────────────────────────────────────────

  documentSearch: '',
  setDocumentSearch: (documentSearch) => set({ documentSearch }),

  registrySearch: '',
  setRegistrySearch: (registrySearch) => set({ registrySearch }),

  gapsSearch: '',
  setGapsSearch: (gapsSearch) => set({ gapsSearch }),
}))
```

---

## STORE USAGE PATTERNS

### Pattern 1: chatStore in chat components

```typescript
// In ChatInterface.tsx (FRONTEND_12):
import { useChatStore } from '@/stores/chatStore'

const {
  messages,
  streamingState,
  composeValue,
  setComposeValue,
  addMessage,
  appendToken,
  updateLastMessageValidation,
  setStreamingState,
  setCurrentSessionId,
  setWebSocket,
  pendingScreenshot,
  screenshotPreviewUrl,
  setPendingScreenshot,
  setScreenshotPreviewUrl,
  clearScreenshot,
  resetForNewSession,
} = useChatStore()
```

### Pattern 2: sessionStore in session sidebar

```typescript
// In SessionSidebar.tsx (FRONTEND_09):
import { useSessionStore } from '@/stores/sessionStore'

const sessions = useSessionStore((state) => state.getFilteredSessions())
const activeId = useSessionStore((state) => state.activeSessionId)
const setActive = useSessionStore((state) => state.setActiveSessionId)
const search = useSessionStore((state) => state.searchQuery)
const setSearch = useSessionStore((state) => state.setSearchQuery)
const togglePin = useSessionStore((state) => state.togglePin)
```

### Pattern 3: panelStore in layout

```typescript
// In employee layout (FRONTEND_09):
import { usePanelStore } from '@/stores/panelStore'

const { collapsed, toggle } = usePanelStore()

// Grid template columns change based on collapsed state:
style={{
  gridTemplateColumns: collapsed
    ? `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_ICON}px`
    : `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_WIDTH}px`,
}}
```

### Pattern 4: uiStore for CommandPalette

```typescript
// In employee layout:
import { useUIStore } from '@/stores/uiStore'

const { commandPaletteOpen, closeCommandPalette, toggleCommandPalette } = useUIStore()

useKeyboardShortcuts([
  { key: 'k', meta: true, handler: toggleCommandPalette, preventDefault: true },
])

<CommandPalette open={commandPaletteOpen} onOpenChange={closeCommandPalette} />
```

### Pattern 5: adminStore for table selection

```typescript
// In DocumentsPage.tsx (FRONTEND_18):
import { useAdminStore } from '@/stores/adminStore'

const { selectedDocumentIds, setSelectedDocumentIds, clearDocumentSelection } = useAdminStore()

<DataTable
  selectable
  selectedKeys={selectedDocumentIds}
  onSelectionChange={setSelectedDocumentIds}
/>

<BulkActionBar
  selectedCount={selectedDocumentIds.size}
  onClearSelection={clearDocumentSelection}
  actions={[...]}
/>
```

---

## SELECTOR OPTIMISATION

Always use selector functions to avoid unnecessary re-renders:

```typescript
// ✅ CORRECT — only re-renders when activeSessionId changes
const activeId = useSessionStore((s) => s.activeSessionId)

// ❌ WRONG — re-renders on any store change
const store = useSessionStore()
const activeId = store.activeSessionId

// ✅ CORRECT — multiple selectors with useShallow for object equality
import { useShallow } from 'zustand/react/shallow'

const { sessions, searchQuery } = useSessionStore(
  useShallow((s) => ({ sessions: s.sessions, searchQuery: s.searchQuery }))
)
```

---

## STORE RESET ON LOGOUT

When user logs out, reset all stores to initial state:

```typescript
// In logout handler (lib/auth.ts):
export async function logout(): Promise<void> {
  // Reset all stores
  useChatStore.getState().resetForNewSession()
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    searchQuery: '',
  })
  usePanelStore.setState({ collapsed: false })
  useUIStore.setState({ commandPaletteOpen: false })
  useAdminStore.setState({
    selectedDocumentIds: new Set(),
    selectedTicketIds: new Set(),
    selectedAuditIds: new Set(),
    selectedRegistryIds: new Set(),
    uploadProgress: {},
  })

  // Clear auth cookies
  await fetch('/api/auth/set-token', { method: 'DELETE' })

  window.location.href = '/login'
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: chatStore — token append
# → In a test component:
# const { appendToken, messages } = useChatStore()
# appendToken("Hello") // creates new assistant message
# appendToken(" world") // appends to same message
# → messages[0].content === "Hello world"

# Step 2: sessionStore — pin/unpin
# const { togglePin, isPinned } = useSessionStore()
# togglePin('session-1')
# isPinned('session-1') === true
# togglePin('session-1')
# isPinned('session-1') === false

# Step 3: panelStore — persistence
# → Open DevTools → Application → Local Storage → look for 'aegis:panel-collapsed'
# → Should be absent initially
# const { toggle } = usePanelStore()
# toggle()
# → Local Storage now has 'aegis:panel-collapsed': '{"state":{"collapsed":true}}'
# → Reload page → panelStore.collapsed should still be true

# Step 4: adminStore — selection
# const { setSelectedDocumentIds, selectedDocumentIds } = useAdminStore()
# setSelectedDocumentIds(new Set(['doc-1', 'doc-2']))
# selectedDocumentIds.size === 2

# Step 5: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F06: Zustand stores — chatStore, sessionStore, panelStore, uiStore, adminStore"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F06*
