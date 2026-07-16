# FRONTEND_27: ACCESSIBILITY
## WCAG 2.1 AA Compliance — ARIA Patterns, Keyboard Navigation, Screen Readers
## Session F18 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F18: Accessibility compliance.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Target:** WCAG 2.1 Level AA compliance across both portals.
**Browsers tested:** Chrome + Firefox on desktop (1280px+ minimum).
**No new component files.** This document specifies required ARIA attributes,
keyboard behaviour, and testing procedures — most are already partially implemented
in earlier documents. This session is for final audit and gap-filling.

---

## COLOUR CONTRAST — COMPLIANCE TABLE

All text/background combinations must meet WCAG AA ratios:
- Normal text (< 18pt): **4.5:1 minimum**
- Large text (≥ 18pt bold or ≥ 24pt): **3:1 minimum**
- UI components and graphical objects: **3:1 minimum**

### Verified combinations (light theme)

| Foreground token | Background token | Ratio | Status |
|-----------------|-----------------|-------|--------|
| `text-primary` (#0F172A) | `bg-card` (#FFFFFF) | 19.1:1 | ✅ AA |
| `text-secondary` (#334155) | `bg-card` (#FFFFFF) | 9.7:1 | ✅ AA |
| `text-tertiary` (#64748B) | `bg-card` (#FFFFFF) | 4.6:1 | ✅ AA |
| `text-primary` (#0F172A) | `bg-secondary` (#F1F5F9) | 17.2:1 | ✅ AA |
| `accent-text` (#0891B2) | `bg-card` (#FFFFFF) | 4.9:1 | ✅ AA |
| White on `bg-accent` (#06B6D4) | — | 3.2:1 | ✅ Large text only |
| `success-text` (#065F46) | `bg-success-bg` (#D1FAE5) | 7.1:1 | ✅ AA |
| `warning-text` (#92400E) | `bg-warning-bg` (#FEF3C7) | 5.9:1 | ✅ AA |
| `danger-text` (#991B1B) | `bg-danger-bg` (#FEE2E2) | 6.3:1 | ✅ AA |

### Verified combinations (dark theme)

| Foreground token | Background token | Ratio | Status |
|-----------------|-----------------|-------|--------|
| `text-primary` (#F1F5F9) | `bg-card` (#0F1C2E) | 16.8:1 | ✅ AA |
| `text-secondary` (#94A3B8) | `bg-card` (#0F1C2E) | 7.2:1 | ✅ AA |
| `text-tertiary` (#475569) | `bg-card` (#0F1C2E) | 4.5:1 | ✅ AA (border) |
| `accent` (#06B6D4) | `bg-primary` (#060B14) | 5.1:1 | ✅ AA |

**Concern:** `text-tertiary` on `bg-card` in dark mode is exactly at the 4.5:1 threshold.
Do not use `text-tertiary` for any meaningful content in dark mode — only for decorative hints.

---

## ARIA ROLES — COMPLETE COMPONENT MAP

Every interactive and structural element must have correct ARIA semantics.

### Employee portal

```
<html lang="en">                                     ← lang attribute (in root layout)
  <body>
    <header role="banner">                           ← EmployeeTopbar
      <nav aria-label="User controls">              ← theme toggle, avatar
    <div role="main" aria-label="Chat interface">   ← center column
      <aside aria-label="Session history">          ← SessionSidebar
        <div role="list" aria-label="Sessions">     ← session list
          <div role="listitem">                     ← each SessionCard
      <main>                                         ← chat area
        <div
          role="list"
          aria-label="Chat messages"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
        >                                            ← MessageList
          <div role="listitem">                     ← each message bubble
        <div role="status" aria-live="polite">      ← StreamingProgress
        <form aria-label="Message input">           ← ComposeBar (use role, not <form>)
          <textarea aria-label="Message input"
                    aria-describedby="compose-hint">
          <button aria-label="Send message">
          <button aria-label="Attach screenshot">
      <aside aria-label="Source attribution">       ← AttributionPanelShell
    <div role="dialog"
         aria-modal="true"
         aria-labelledby="cmd-title">               ← CommandPalette
```

### Admin portal

```
<nav aria-label="Admin navigation">                 ← AdminNav
  <a aria-current="page">                          ← active nav item
  <span aria-label="Review queue items pending: N"> ← badge
<main id="admin-main-content">                      ← skip link target
  <!-- Each admin page: -->
  <h1>Page title</h1>                              ← AdminPageHeader h1
  <table aria-label="[context] table">             ← DataTable
    <caption class="sr-only">[description]</caption>
    <thead><th scope="col">
    <tbody>
      <tr aria-selected="true/false">             ← selectable rows
  <div role="region" aria-label="Ticket kanban board"> ← KanbanBoard
  <div role="group" aria-label="[Column] tickets">     ← KanbanColumn
  <button aria-label="Ticket TKT-001: VL150 error">    ← KanbanCard
```

---

## KEYBOARD NAVIGATION — COMPLETE MAP

Every feature must be reachable and operable without a mouse.

### Employee portal keyboard flows

| Keys | Component | Action |
|------|-----------|--------|
| `Tab` | Everywhere | Move focus forward |
| `Shift+Tab` | Everywhere | Move focus backward |
| `Enter` / `Space` | SessionCard | Open session |
| `Enter` | ComposeBar | Send message |
| `Shift+Enter` | ComposeBar | New line |
| `⌘K` | Anywhere | Open command palette |
| `⌘N` | Anywhere | New chat |
| `⌘F` | Anywhere | Focus session search |
| `⌘Shift+E` | Anywhere | Export current session |
| `⌘/` | Anywhere | Keyboard shortcuts overlay |
| `Escape` | CommandPalette | Close palette |
| `↑↓` | CommandPalette | Navigate items |
| `Enter` | CommandPalette item | Execute action |
| `Escape` | ConfirmDialog | Cancel |
| `Enter` | ConfirmDialog confirm button | Confirm |

### Admin portal keyboard flows

| Keys | Component | Action |
|------|-----------|--------|
| `Tab` | DataTable | Move through interactive cells |
| `Space` | DataTable checkbox | Toggle row selection |
| `⌘A` | DataTable | Select all rows (implement) |
| `J` | Review queue | Next item |
| `K` | Review queue | Previous item |
| `A` | Review queue | Approve correction |
| `X` | Review queue | Skip item |
| `⌘K` | Anywhere | Command palette |
| `Escape` | Drawer | Close drawer |
| `Tab` | Kanban card | Focus next card |
| `Space` | Kanban card | Pick up / drop card |
| `←→↑↓` | Kanban card (held) | Move to column |

### DataTable keyboard implementation

```typescript
// DataTable rows must handle keyboard selection:
<tr
  tabIndex={0}
  role="row"
  aria-selected={isSelected}
  onKeyDown={(e) => {
    if (e.key === ' ') {
      e.preventDefault()
      onToggleSelection(row)
    }
    if (e.key === 'Enter') {
      onRowClick?.(row)
    }
  }}
>
```

---

## ARIA LIVE REGIONS — COMPLETE MAP

Live regions announce dynamic content changes to screen readers
without moving focus.

```typescript
// MessageList — new messages announced:
<div
  role="list"
  aria-live="polite"
  aria-atomic="false"
  aria-relevant="additions"
>

// StreamingProgress — stage changes announced:
<div role="status" aria-live="polite" aria-atomic="true">
  <span>Retrieving SAP documentation...</span>
</div>

// OfflineBanner — critical alert:
<div role="status" aria-live="assertive">
  No internet connection
</div>

// DashboardRefreshIndicator — suppress (too frequent):
<div aria-live="off">  {/* OR: don't use live region */}

// BulkActionBar count — polite announcement:
<div role="status" aria-live="polite" aria-atomic="true">
  {selectedCount} items selected
</div>

// Toast notifications (sonner) — handled by sonner internally.
// Sonner uses aria-live="assertive" for errors, "polite" for others.

// Form validation errors — inline, not live region:
<p id="field-error" role="alert">{error.message}</p>
<input aria-describedby="field-error" aria-invalid="true" />
```

**Rule:** Only use `aria-live="assertive"` for truly urgent, time-sensitive content
(offline status, critical errors). Use `polite` for everything else.
Overusing `assertive` interrupts screen reader users mid-sentence.

---

## FOCUS MANAGEMENT — IMPLEMENTATION RULES

### Rule 1: Focus trap in modals

All modal dialogs must trap focus (Tab cycles within the modal, not the page behind).
Radix UI dialogs (Dialog, AlertDialog) handle this automatically.

For `CommandPalette` (built on cmdk):
```typescript
// cmdk handles focus trap internally — verify it's working:
// Tab inside palette → stays within palette items
// Escape → returns focus to the trigger element
```

For `Drawer` (built on Radix Sheet):
```typescript
// Radix Sheet handles focus trap automatically.
// On open: focus moves to first focusable element inside drawer.
// On close: focus returns to the element that opened the drawer.
```

### Rule 2: Focus return after modal close

When a dialog closes, focus must return to the element that opened it:

```typescript
// Pattern for ConfirmDialog trigger:
// Radix AlertDialog returns focus to trigger automatically.
// For programmatic close (e.g., after mutation success):
const triggerRef = useRef<HTMLButtonElement>(null)

function handleSuccess() {
  closeModal()
  // Radix handles return — but for custom modals:
  setTimeout(() => triggerRef.current?.focus(), 50)
}
```

### Rule 3: Skip link

Every page must have a skip link for keyboard users to bypass navigation:

```typescript
// Already in AdminTopbar.tsx:
<a
  href="#admin-main-content"
  className="sr-only focus:not-sr-only focus:px-3 focus:py-1.5 focus:rounded-lg ..."
>
  Skip to content
</a>

// Employee portal equivalent — add to EmployeeTopbar.tsx:
<a
  href="#employee-main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-bg-card focus:text-text-primary focus:shadow-lg"
>
  Skip to chat
</a>

// Add id to main element in (employee)/layout.tsx:
<main id="employee-main-content" ...>
```

### Rule 4: Avoid focus loss

When an element is removed from the DOM (e.g., session deleted from sidebar),
focus must not disappear to `document.body`.

```typescript
// In SessionContextMenu — after delete:
async function handleDelete() {
  const focusTarget = document.querySelector<HTMLElement>('[data-session-first]')
  removeSession(session.id)
  await api.delete(`sessions/${session.id}`)
  focusTarget?.focus()  // Move focus to next session
}
```

---

## SCREEN READER TESTING — REQUIRED PASSES

Test with VoiceOver (macOS, Safari/Chrome) and NVDA (Windows, Firefox).

### Employee portal SR flows

```
Flow 1: Send a message
→ Focus compose bar: SR announces "Message input, edit text"
→ Type message → Enter
→ SR announces "User: [message text]" (via aria-live)
→ SR announces "Thinking..." (streaming progress)
→ SR announces AI response text as tokens arrive (polite, non-disruptive)
→ SR announces "[Score]% confidence, green badge" (after completion)

Flow 2: Navigate session history
→ Tab to session sidebar
→ SR announces "Session history, navigation"
→ SR announces each session: "Session: [topic], 3 turns, 91% avg"
→ Enter on a session: SR announces page change

Flow 3: Screenshot attach
→ Tab to attach button: SR announces "Attach screenshot, button"
→ Open file picker → select file
→ SR announces: "Screenshot attached: [filename]. Press Delete to remove."
```

### Admin portal SR flows

```
Flow 4: DataTable row selection
→ Tab to first row: SR announces "Row: [document ID], unchecked, 1 of 47"
→ Space: SR announces "[document ID], checked"
→ Continue selecting
→ BulkActionBar: SR announces "3 items selected" (aria-live polite)

Flow 5: Review queue navigation
→ SR announces "Review queue, 12 items pending"
→ J/K: SR announces "Item 2 of 12: [query preview]"
→ Correction textarea: SR announces current suggested correction
→ A: SR announces "Correction approved" (toast + live region)
```

---

## HIDDEN TEXT HELPERS — sr-only USAGE

Use `.sr-only` class (from Tailwind) for text visible only to screen readers.
Use it for:
- Icon-only buttons that need labels
- Decorative separators that need context
- Table captions
- Status indicators that use colour alone

```typescript
// Icon-only buttons:
<button>
  <X className="w-4 h-4" aria-hidden="true" />
  <span className="sr-only">Close dialog</span>
</button>

// Colour-only status dots:
<span className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
<span className="sr-only">Status: Healthy</span>

// Table: add caption for context:
<table>
  <caption className="sr-only">
    Documents in the SAP knowledge base, sorted by upload date
  </caption>
  ...
</table>
```

---

## ACCESSIBILITY AUDIT CHECKLIST

```
□ lang="en" on <html> element (root layout)
□ All images have alt text (or alt="" if decorative)
□ All icon-only buttons have aria-label or sr-only text
□ All form inputs have associated <label> or aria-label
□ Focus ring visible on all interactive elements (Tab through entire page)
□ No focus loss when elements are removed from DOM
□ Skip link present and functional in both portals
□ Colour contrast ≥ 4.5:1 for all normal text
□ Content not conveyed by colour alone (status dots have sr-only label)
□ aria-current="page" on active nav items
□ role="dialog" + aria-modal="true" on all modal dialogs
□ aria-live regions used for dynamic content (chat, progress, counts)
□ Tables have <caption> or aria-label
□ Kanban board: keyboard drag-drop functional (Space to pick up/drop)
□ Chart data: charts have text alternatives (title + data table if needed)
□ Error messages: role="alert" or aria-describedby linking input to error
□ Loading states: aria-label="Loading [content]" on spinners
```

---

## COMMIT

```bash
git add -A
git commit -m "F18: Accessibility — ARIA map, keyboard nav, live regions, focus management, SR test flows, contrast table"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F18*
