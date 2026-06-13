# FRONTEND_34: VERIFICATION CHECKLIST
## Per-Page Acceptance Criteria and Visual QA for Both Portals
## Final QA Pass Before Handoff

---

## HOW TO USE THIS DOCUMENT

Run this checklist on **both Chrome and Firefox** at **1440×900** resolution.
Each page has a **smoke test** (basic render) and a **feature test** (full flow).
Mark ✅ when passing, ❌ with a note when failing.

Test against a running backend (`docker-compose up`) or use mock data stubs.

---

## GLOBAL CHECKS (run once, applies to all pages)

```
□ TypeScript: npx tsc --noEmit → 0 errors
□ ESLint: npx next lint → 0 errors, 0 warnings
□ Dark mode toggle works on all pages
□ Theme persists across page refresh (localStorage)
□ ⌘K opens command palette on all pages
□ ⌘/ shows keyboard shortcuts overlay on all pages
□ Focus ring visible when tabbing through any page
□ Skip link appears on first Tab press (both portals)
□ Offline banner appears when DevTools → Network → Offline
□ All console.error and console.warn cleared (no red text in DevTools)
□ No CLS visible when loading any page (content doesn't jump)
□ node --version → v22.x (not v20, not v23)
```

---

## EMPLOYEE PORTAL

### EP-01: Chat page (/)

**Smoke:** Page loads showing empty chat state (suggestion chips visible).
**Feature flows:**

```
□ Send a text message → user bubble appears immediately (optimistic)
□ Streaming progress shows correct stages: Thinking → Retrieving → Generating → Validating
□ AI response streams token by token with blinking cursor
□ Confidence badge appears after streaming (green/amber/none)
□ Attribution panel populates in right column after response
□ ResponseActions (copy/thumbs/regenerate) appear on bubble hover
□ Thumbs up → TOAST.feedbackPositive fires
□ Thumbs down → TOAST.feedbackNegative fires
□ Related questions appear for green-badge responses
□ Clicking related question chip → sends that question
□ ComposeBar: Enter sends, Shift+Enter creates newline
□ ⌘N → chat resets, compose bar focused
□ Screenshot drag-drop → overlay "Drop SAP screenshot here" appears
□ Drop PNG → thumbnail appears above compose bar
□ Send message with screenshot → thumbnail clears after send
□ Compose bar: type "VL150" → SAP entity chip preview appears below (after 400ms)
□ Right panel collapse toggle → panel animates to 48px icon strip
□ Expand again → returns to 210px with source attribution content
```

**Dark mode:**
```
□ Light (default) → all text readable
□ Toggle to dark → navy background, light text, accent cyan
□ AI bubble in dark mode: no white flash
□ ComposeBar in dark: border visible, placeholder readable
```

---

### EP-02: Session History (/history)

```
□ Page loads with session cards sorted by date (newest first)
□ Search "VL150" → filters to matching sessions within 300ms debounce
□ Module filter "SD" → only SD sessions shown
□ Badge filter "🟢 High" → only green sessions shown
□ Date range "Today" → only today's sessions
□ "Stale only" equivalent → (History page uses unresolved only checkbox)
□ Unresolved checkbox → only unresolved sessions shown
□ Sort "Highest confidence" → reorders cards
□ Clear all → all filters reset, full list returns
□ Click a session card → navigates to /?session=<id>
□ /?session=<id> → messages load from that session into chat
□ Export CSV → downloads aegis-session-history-<date>.csv with correct columns
□ Pagination: if >50 sessions, "Page 1 of N" with Prev/Next controls
□ No sessions: empty state with "No sessions yet" message
```

---

### EP-03: Onboarding Modal (first visit)

```
□ Clear localStorage → reload → modal appears after 800ms
□ Step 1: Logo + two-column can/cannot grid visible
□ Step 2: EntityChip components render for example questions
□ Step 3: Three ConfidenceBadge cards with correct colours
□ Step 4: Two method cards (drag-drop, file picker icons)
□ Step 5: Starter question chips clickable
□ Clicking starter chip → modal closes, compose pre-filled
□ Progress dots: active dot is wider cyan pill, completed are dimmed
□ Next/Back: slide left (forward), slide right (back)
□ "Skip for now" → modal closes, localStorage flag set
□ "Start using AEGIS" on step 5 → closes modal
□ Reload → modal does NOT appear again (flag is set)
□ Escape key → does NOT close modal
□ Backdrop click → does NOT close modal
□ Reduced motion: step transitions are instant (no slide)
```

---

## ADMIN PORTAL (all tests run in dark mode unless noted)

### AP-01: Dashboard (/admin/dashboard)

```
□ Page loads in dark mode (navy background)
□ Four MetricCard tiles with count-up animation (0→value over 700ms)
□ Green metric card: avg score ≥ 0.85 shows green color
□ DashboardRefreshIndicator shows "Updated Xs ago · Next in Ys"
□ After 30 seconds: metrics refetch, indicator resets to 0s
□ ValidationScore chart: AreaChart with cyan area, 7 data points
□ Confidence distribution: stacked bars (green/amber/gray)
□ Retrieval mode: 4 horizontal progress bars with percentages
□ Gap events list: top 5 patterns with severity dots
□ "View all" → navigates to /admin/knowledge-gaps
□ Review queue banner: appears if open_tickets > 0 (amber)
□ "Review now" button → navigates to /admin/review-queue
□ Quick action "Upload document" → navigates to /admin/documents
□ Loading skeleton matches live layout (4 cols, 2 cols, 3 cols grid)
□ ErrorBoundary: if chart data is malformed, shows "Try again" per section
```

---

### AP-02: Documents (/admin/documents)

```
□ Upload zone: dashed border, "Drag and drop a document here"
□ Drag PDF over zone → border turns cyan, "Drop to upload" overlay
□ Drop PDF → DocumentMetadataModal opens
□ Modal: 8 module chip buttons, 3 content type radio cards
□ Both module and type must be selected for Upload button to enable
□ Click Upload → modal closes, IngestionProgressRow appears
□ Progress bar fills 0→100% during HTTP upload
□ At 100%: row switches to pulsing "Processing..." state
□ Document appears in table with "processing" badge
□ After ingestion: badge changes to "active"
□ Drag non-PDF → toastError "Only PDF files are supported"
□ Drag >50MB file → toastError "File exceeds 50MB size limit"
□ AdminStatRow: Active/Processing/Deprecated counts correct
□ Select rows → BulkActionBar slides up from bottom
□ "Deprecate selected" (active rows only) → ConfirmDialog
□ Confirm → selected documents change to deprecated
□ Per-row Archive icon → ConfirmDialog → deprecates single doc
□ Export CSV → downloads with correct columns
□ Filter chips active: filters reflected in table
```

---

### AP-03: Registry (/admin/registry)

```
□ Pending entries appear at top in highlighted cards
□ Pending count badge shows correct number
□ Approve button: direct action (no confirm dialog) → entry moves to active
□ Reject button → ConfirmDialog → confirm → entry moves to rejected
□ Status tabs (All/Active/Rejected) filter the non-pending table
□ Search box filters by pattern text or linked document
□ AdminStatRow shows Pending/Active/Rejected counts
```

---

### AP-04: Config Snapshot (/admin/config-snapshot)

```
□ All config entries loaded in table
□ Category buttons filter correctly (SD, FI, MM, etc.)
□ "Stale only" button appears if stale items exist
□ Stale filter shows only entries with days_since_verified > 70
□ StalenessIndicator: green <35d, amber 35-70d, red >70d
□ Hover staleness indicator → tooltip shows days + description
□ Click value cell → transforms to inline input
□ Edit value → Enter → spinner → value saves → returns to static text
□ Edit value → Escape → cancels, original value shown
□ Same value submitted → no API call, just closes
□ Edit value → blur → commits save (with 150ms delay)
□ Usage tip visible at bottom: "Click any value to edit inline"
```

---

### AP-05: Knowledge Gaps (/admin/knowledge-gaps)

```
□ Gap cards load grouped: HIGH / MEDIUM / LOW priority sections
□ Section counts shown in circle badges
□ 7d/30d/90d range buttons update data
□ Module filter updates cards
□ Severity filter (high/medium/low buttons) updates cards
□ Search box filters by pattern text
□ Gap card: severity dot, pattern text, module tags, frequency count
□ "N example queries" toggle → animates open showing sample questions
□ "Create document" → navigates to /admin/documents
□ "Hide" → card disappears (stored in localStorage)
□ "Show N hidden" link appears when items are hidden
□ Clicking it → hidden items reappear
□ Empty state: "No gaps found" when all filtered
```

---

### AP-06: Audit Trail (/admin/audit-trail)

```
□ Timeline view (default): entries grouped by date (Today/Yesterday/date)
□ Vertical connecting line between entries in each group
□ Entry dots: green/amber/red/neutral by confidence badge
□ Time shown in 12h format (HH:MM AM/PM)
□ Click entry → navigates to /?session=<session_id>
□ Toggle to Table view → DataTable renders same data
□ Toggle back → Timeline restores
□ Date range filter: Today/7d/30d/90d changes data
□ Badge filter dropdown filters entries
□ Export CSV → downloads audit-trail.csv with all columns
□ Results count: "N entries" updates with filters
```

---

### AP-07: Review Queue (/admin/review-queue)

```
□ Split-pane layout: 288px list (left) + flex detail (right)
□ First item auto-selected on load
□ Active item: cyan left border + accent dot in list
□ J key → advances to next item (works in textarea too)
□ K key → goes to previous item
□ A key → approves current item → advances to next
□ X key → skips current item → advances to next
□ "Item N of M pending" counter updates after each action
□ Problematic claim: highlighted in red in original response text
□ Correction textarea: pre-filled with suggested_correction if provided
□ Approve with correction text → text submitted to backend
□ Approve without text → empty correction submitted (accepted)
□ Empty queue: full-screen empty state with CheckCircle icon
□ Loading skeleton: matches split-pane layout
```

---

### AP-08: Tickets (/admin/tickets)

```
□ Three kanban columns: Open / In Progress / Resolved
□ Column header shows card count in rounded badge
□ Each card: reference number, title, priority badge, creation date
□ High priority card: red badge
□ Drag a card to another column → card moves immediately (optimistic)
□ Column highlights (ring) when card dragged over it
□ DragOverlay: floating card with slight rotation while dragging
□ API error on drop → card snaps back to original column
□ Click card → Drawer slides in from right
□ Drawer shows: description, priority, created date, "Move to" buttons
□ "Move to In Progress" button → card moves, drawer closes
□ AdminStatRow: Open/In Progress/Resolved counts correct
□ Loading skeleton: 3 columns with card placeholders
```

---

### AP-09: System Health (/admin/system-health)

```
□ Overall status banner: green (all healthy) / amber (degraded) / red (critical)
□ Banner shows healthy count and unhealthy count
□ 7 category sections visible with correct service counts
□ Infrastructure: nginx, keycloak, vault tiles
□ AI Models: 5 tiles (ollama-main/judge/vision, bge, deberta)
□ Healthy tiles: subtle green background, PULSING green dot
□ Degraded tiles: amber background, STATIC amber dot (no pulse)
□ Unhealthy tiles: red background, STATIC red dot
□ Service name strips "aegis-" prefix (shows "nginx" not "aegis-nginx")
□ Response time shown for healthy services (e.g. "12ms")
□ Click any tile → Drawer opens with service detail
□ Drawer: status, response time, last checked, error message if degraded
□ DashboardRefreshIndicator counts down 30s between polls
□ After 30s: all tiles update, indicator resets
```

---

### AP-10: Analytics (/admin/analytics)

```
□ 6 charts render in 3 rows of 2
□ Row 1: ValidationScore (AreaChart cyan) + Query Volume (BarChart blue)
□ Row 2: Confidence Dist (stacked bars) + Cache Performance (LineChart purple)
□ Row 3: Top Modules (horizontal bars, score-coloured) + Retrieval Mode (bars)
□ 7d/30d/90d/All buttons change all charts simultaneously
□ Active range button has accent-subtle background
□ Loading state: each chart shows its own skeleton while data loads
□ TopModulesChart: high-score modules have green bars, low-score have red
□ TopModulesChart colour legend shows threshold values
□ Each chart ErrorBoundary: malformed data shows "Try again" for that chart only
□ No live polling (data static until range changes)
```

---

## CROSS-PORTAL CHECKS

```
□ CommandPalette (⌘K): opens on both portals
□ Employee palette: shows session search, recent sessions, quick actions
□ Admin palette: shows admin page navigation
□ ⌘/ shows keyboard shortcuts overlay listing all shortcuts
□ Both portals: OfflineBanner expands from top when offline
□ Both portals: toastError appears bottom-right with red left border
□ Both portals: toastSuccess appears with green left border
□ Both portals: dark mode ThemeToggle icon switches correctly
□ Admin portal: forces dark on mount (soft-forced, not locked)
□ Both portals: all DataTable pages show correct empty state when no data
□ Both portals: all ConfirmDialog dialogs require explicit confirmation
□ Both portals: BulkActionBar appears/disappears with spring animation
```

---

## ACCESSIBILITY SPOT-CHECKS

```
□ Tab through entire chat page without mouse — all interactive elements reachable
□ Session cards: Space/Enter opens session
□ Command palette: ↑↓ navigate items, Enter executes
□ All icon-only buttons have aria-label or sr-only text
□ Chat message list has aria-live="polite" (screen reader announces new messages)
□ OfflineBanner has aria-live="assertive"
□ Focus ring visible in both light and dark mode (cyan ring)
□ Skip link appears on Tab-1 and links to main content correctly
```

---

## PERFORMANCE SPOT-CHECKS

```bash
# Build and measure:
npm run build

# Check bundle output:
# → .next/static/chunks/ should NOT contain @react-pdf in initial chunks
# → recharts should be in a named async chunk

# Lighthouse (production server):
npm start
# → Run Lighthouse on /admin/dashboard
# → LCP: < 2.5s ✓ / CLS: < 0.1 ✓ / INP: < 200ms ✓
```

---

*Document version 1.0 | AEGIS Frontend Specification Set | FRONTEND_34*
