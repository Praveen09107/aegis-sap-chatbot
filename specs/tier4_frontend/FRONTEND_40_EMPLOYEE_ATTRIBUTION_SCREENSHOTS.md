# FRONTEND_40 — EMPLOYEE ATTRIBUTION: SCREENSHOTS
## AEGIS SAP Helpdesk AI — Screenshot Display in Employee Answer Panel
## Depends on: IMPL_28, FRONTEND_08, FRONTEND_36, FRONTEND_37, FRONTEND_39

---

## 1. OVERVIEW

This document specifies the employee-facing side of the Quick Entry screenshot
feature. When an employee receives an answer sourced from a Quick Entry chunk
that has associated screenshots, those screenshots appear in the attribution
panel as visual references.

This document covers:
- The `screenshots` extension to the existing `validation_result` WebSocket message
- The `ScreenshotThumbnail` component for the attribution panel
- The `ScreenshotLightbox` for full-size viewing
- The `/api/screenshots/[...path]` Next.js proxy route (full specification)
- How `form_entry_id` flows from Qdrant payload through the pipeline to the UI
- Integration with the existing `AttributionPanel` component
- Lazy loading and performance constraints

---

## 2. WEBSOCKET MESSAGE EXTENSION

### 2.1 Extended validation_result message

The existing `validation_result` WebSocket message (IMPL_11, FRONTEND_08) gains
two new fields inside the existing `attribution_panel` object. All existing
fields remain unchanged.

**Before (existing):**
```json
{
  "type": "validation_result",
  "validation_score": 0.84,
  "confidence_badge": "green",
  "attribution_panel": {
    "primary_document_id": "SAP-SD-PRO-IN-20",
    "primary_document_name": "Tax condition not capturing in Sale Order",
    "source_module": "SD",
    "source_verified_by": "Gokul",
    "source_verified_date": "28/03/2025",
    "similar_documents": [...],
    "answer_includes_admin_steps": false
  }
}
```

**After (with Quick Entry screenshots):**
```json
{
  "type": "validation_result",
  "validation_score": 0.84,
  "confidence_badge": "green",
  "attribution_panel": {
    "primary_document_id": "SAP-SD-PRO-IN-20",
    "primary_document_name": "Tax condition not capturing in Sale Order",
    "source_module": "SD",
    "source_verified_by": "Gokul",
    "source_verified_date": "28/03/2025",
    "similar_documents": [...],
    "answer_includes_admin_steps": false,
    "form_entry_id": "7f3a2c1d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    "screenshots": [
      {
        "url": "/api/screenshots/knowledge-screenshots/7f3a2c.../uuid-bp_tax_classification.png",
        "caption": "BP transaction — Billing tab showing Tax Classification field set to Exempt",
        "section": "cause_1"
      },
      {
        "url": "/api/screenshots/knowledge-screenshots/7f3a2c.../uuid-mm02_tax.png",
        "caption": "MM02 Material Master — Sales Org 2 tab showing Tax Category field",
        "section": "cause_2"
      }
    ]
  }
}
```

**Field definitions:**

`form_entry_id`:
- Type: `string | null`
- Null when the answer was sourced from a document-based chunk (not Quick Entry)
- UUID string when sourced from a Quick Entry chunk
- Used for feedback attribution (IMPL_29 Section 3.1)

`screenshots`:
- Type: `ScreenshotReference[]`
- Empty array `[]` when no screenshots are associated
- Maximum 5 entries (deduped at pipeline level — IMPL_28 Section 5.1)
- `url`: the Next.js proxy URL for authenticated serving
- `caption`: admin-written description of the screenshot content
- `section`: chunk_type this screenshot is associated with (e.g. "cause_1")

### 2.2 TypeScript type extension

In `src/types/index.ts`, add to the existing `AttributionPanel` type:
```typescript
interface AttributionPanel {
  // ... all existing fields unchanged ...
  form_entry_id: string | null          // null if not a Quick Entry
  screenshots: ScreenshotReference[]   // empty array if none
}

interface ScreenshotReference {
  url:     string   // /api/screenshots/{path}
  caption: string   // admin-written description
  section: string   // chunk_type this screenshot belongs to
}
```

### 2.3 Feedback message extension

When the employee submits feedback (thumbs up/down), the message sent to
the backend must include `form_entry_id` when available:

```typescript
// In existing feedback submit handler (FRONTEND_12, FRONTEND_13):
// Extend the feedback payload to include form_entry_id:

const feedbackPayload = {
  session_id:        sessionId,
  message_id:        messageId,
  rating:            'positive' | 'negative',
  source_document_id: attributionPanel?.primary_document_id ?? null,
  source_form_entry_id: attributionPanel?.form_entry_id ?? null,  // ADD THIS
}
```

---

## 3. NEXT.JS PROXY ROUTE

**File:** `src/app/api/screenshots/[...path]/route.ts`

Full specification (also documented in IMPL_28 Section 6 — this is the frontend
implementation perspective):

```typescript
/**
 * Authenticated screenshot proxy route.
 *
 * Purpose:
 *   Screenshots are stored in MinIO (private bucket, no public access).
 *   This proxy authenticates the user, then fetches and streams the image
 *   from the backend, which in turn fetches from MinIO.
 *
 * Security:
 *   - Requires valid authentication cookie (access_token)
 *   - Only admin and employee roles are served screenshots
 *   - No direct MinIO URLs are ever exposed to the client
 *
 * Caching:
 *   - Cache-Control: private, max-age=86400 (24 hours)
 *   - Safe because screenshots on active entries are immutable
 *   - Cache is keyed on the full URL path (which includes a UUID)
 *   - Screenshots can only be deleted during draft status (no active cache)
 *
 * URL pattern:
 *   /api/screenshots/knowledge-screenshots/{entry_id}/{uuid}-{filename}
 *   Maps to backend: /api/screenshots/{same path}
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {

  // Authentication
  const cookieStore = cookies()
  const accessToken = cookieStore.get('access_token')?.value

  if (!accessToken) {
    return new NextResponse('Unauthorised', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  // Build backend URL
  const objectPath = params.path.join('/')

  // Validate path to prevent path traversal
  if (objectPath.includes('..') || objectPath.includes('\\')) {
    return new NextResponse('Invalid path', { status: 400 })
  }

  const backendUrl = `${process.env.BACKEND_INTERNAL_URL}/api/screenshots/${objectPath}`

  try {
    const response = await fetch(backendUrl, {
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
      },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',   // Backend caches in MinIO; Next.js should not double-cache
    })

    if (response.status === 401 || response.status === 403) {
      return new NextResponse('Unauthorised', { status: 401 })
    }

    if (response.status === 404) {
      return new NextResponse('Screenshot not found', { status: 404 })
    }

    if (!response.ok) {
      return new NextResponse('Error fetching screenshot', { status: 502 })
    }

    const contentType = response.headers.get('Content-Type') ?? 'image/png'
    const body = response.body

    if (!body) {
      return new NextResponse('Empty response from backend', { status: 502 })
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    })

  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return new NextResponse('Screenshot fetch timed out', { status: 504 })
    }
    return new NextResponse('Failed to fetch screenshot', { status: 502 })
  }
}
```

---

## 4. ATTRIBUTION PANEL SCREENSHOTS SECTION

### 4.1 Integration point in AttributionPanel

The existing `AttributionPanel` component (FRONTEND_08, FRONTEND_12) receives
the extended attribution_panel data via the WebSocket context. The screenshots
section is added as a new section below the existing document attribution.

**Location in AttributionPanel.tsx:**
Add after the existing verified-by section and before the similar_documents section:

```typescript
// In AttributionPanel.tsx — add after verified_by section:
{attributionPanel.screenshots && attributionPanel.screenshots.length > 0 && (
  <AttributionScreenshotsSection
    screenshots={attributionPanel.screenshots}
    formEntryId={attributionPanel.form_entry_id}
  />
)}
```

### 4.2 AttributionScreenshotsSection component

**File:** `src/components/quick-entry/AttributionScreenshotsSection.tsx`

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Camera } from 'lucide-react'
import { ScreenshotThumbnail } from './ScreenshotThumbnail'
import { ScreenshotLightbox } from './ScreenshotLightbox'
import type { ScreenshotReference } from '@/types'

interface Props {
  screenshots: ScreenshotReference[]
  formEntryId: string | null
}

export function AttributionScreenshotsSection({ screenshots, formEntryId }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const handleOpenLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
  }, [])

  const handleCloseLightbox = useCallback(() => {
    setLightboxIndex(null)
  }, [])

  const handlePrev = useCallback(() => {
    setLightboxIndex(i => (i !== null && i > 0) ? i - 1 : i)
  }, [])

  const handleNext = useCallback(() => {
    setLightboxIndex(i => (i !== null && i < screenshots.length - 1) ? i + 1 : i)
  }, [screenshots.length])

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
      {/* Section header */}
      <div className="flex items-center gap-1.5 mb-2">
        <Camera size={11} className="text-[var(--color-text-muted)]" />
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          SAP screenshots ({screenshots.length})
        </span>
      </div>

      {/* Thumbnail row */}
      <div className="flex flex-wrap gap-2">
        {screenshots.map((screenshot, index) => (
          <ScreenshotThumbnail
            key={screenshot.url}
            screenshot={screenshot}
            index={index}
            onExpand={() => handleOpenLightbox(index)}
          />
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ScreenshotLightbox
          screenshots={screenshots}
          currentIndex={lightboxIndex}
          onClose={handleCloseLightbox}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </div>
  )
}
```

---

## 5. SCREENSHOTTHUMBNAIL COMPONENT

**File:** `src/components/quick-entry/ScreenshotThumbnail.tsx`

```typescript
'use client'

import { useState } from 'react'
import { ZoomIn } from 'lucide-react'
import type { ScreenshotReference } from '@/types'

interface Props {
  screenshot: ScreenshotReference
  index: number
  onExpand: () => void
}

export function ScreenshotThumbnail({ screenshot, index, onExpand }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError]   = useState(false)

  return (
    <button
      onClick={onExpand}
      className="group relative w-20 h-14 rounded overflow-hidden border border-[var(--color-border)] flex-shrink-0 cursor-pointer hover:border-[var(--color-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      title={screenshot.caption}
      aria-label={`View screenshot: ${screenshot.caption}`}
    >
      {/* Loading skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-[var(--color-skeleton)] animate-pulse" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 bg-[var(--color-surface-elevated)] flex items-center justify-center">
          <span className="text-[9px] text-[var(--color-text-muted)]">Error</span>
        </div>
      )}

      {/* Image */}
      {!error && (
        <img
          src={screenshot.url}
          alt={screenshot.caption}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
          decoding="async"
          className={[
            'w-full h-full object-cover transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0'
          ].join(' ')}
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <ZoomIn size={14} className="text-white" />
      </div>

      {/* Section badge (small, bottom right) */}
      <div className="absolute bottom-0.5 right-0.5 bg-black/60 rounded px-1 py-0.5">
        <span className="text-[8px] text-white font-mono">
          {formatSectionLabel(screenshot.section)}
        </span>
      </div>
    </button>
  )
}

function formatSectionLabel(section: string): string {
  // "cause_1" → "C1", "proc_steps_2" → "P2", "cfg_values" → "CFG"
  if (section.startsWith('cause_')) return `C${section.replace('cause_', '')}`
  if (section.startsWith('proc_steps_')) return `S${section.replace('proc_steps_', '')}`
  if (section === 'cfg_values') return 'CFG'
  if (section.includes('overview')) return 'OVR'
  return section.slice(0, 3).toUpperCase()
}
```

---

## 6. SCREENSHOT LIGHTBOX COMPONENT

**File:** `src/components/quick-entry/ScreenshotLightbox.tsx`

```typescript
'use client'

import { useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScreenshotReference } from '@/types'

interface Props {
  screenshots: ScreenshotReference[]
  currentIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export function ScreenshotLightbox({
  screenshots, currentIndex, onClose, onPrev, onNext
}: Props) {
  const screenshot = screenshots[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < screenshots.length - 1

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasPrev, hasNext, onClose, onPrev, onNext])

  // Prevent body scroll while lightbox open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Screenshot ${currentIndex + 1} of ${screenshots.length}: ${screenshot.caption}`}
    >
      {/* Content (stop propagation to prevent close on content click) */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Image */}
        <img
          src={screenshot.url}
          alt={screenshot.caption}
          loading="eager"
          decoding="async"
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          style={{ display: 'block' }}
        />

        {/* Caption bar */}
        <div className="mt-2 px-1">
          <p className="text-sm text-white font-medium text-center">
            {screenshot.caption}
          </p>
          {screenshots.length > 1 && (
            <p className="text-xs text-white/60 text-center mt-0.5">
              {currentIndex + 1} of {screenshots.length}
            </p>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Prev button */}
        {hasPrev && (
          <button
            onClick={onPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            aria-label="Previous screenshot"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {/* Next button */}
        {hasNext && (
          <button
            onClick={onNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            aria-label="Next screenshot"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {/* Thumbnail strip for multi-screenshot lightboxes */}
      {screenshots.length > 1 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
          {screenshots.map((s, i) => (
            <button
              key={s.url}
              onClick={e => {
                e.stopPropagation()
                if (i < currentIndex) onPrev()
                else if (i > currentIndex) onNext()
              }}
              className={[
                'w-12 h-8 rounded overflow-hidden border-2 transition-colors flex-shrink-0',
                i === currentIndex
                  ? 'border-white opacity-100'
                  : 'border-white/30 opacity-50 hover:opacity-80'
              ].join(' ')}
              aria-label={`Go to screenshot ${i + 1}`}
            >
              <img src={s.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 7. PERFORMANCE CONSTRAINTS

All images in the attribution panel must follow these rules to maintain
AEGIS chat performance:

```
1. Lazy loading (loading="lazy") on ALL ScreenshotThumbnail instances
   Exception: loading="eager" in the lightbox (user explicitly opened it)

2. Async decoding (decoding="async") on all img elements

3. Fixed dimensions on thumbnails (w-20 h-14) to prevent layout shift
   The fixed dimensions are set before the image loads using the skeleton

4. The proxy route uses streaming (NextResponse with ReadableStream body)
   so the first bytes reach the browser without waiting for full MinIO transfer

5. No preloading of screenshots that are not visible
   (attribution panel may be collapsed — screenshots should not load until
   the panel is expanded and the thumbnail is in the viewport)

6. Max 5 screenshots per answer response (enforced at pipeline level in IMPL_28)
   This bounds the maximum additional network requests per answer

7. The authentication cookie check in the proxy route adds ~5ms overhead
   This is acceptable compared to a round-trip to MinIO (~20-100ms on local Docker)
```

---

## 8. ACCESSIBILITY REQUIREMENTS

```
ScreenshotThumbnail:
  - focusable (role="button" via <button> element)
  - aria-label: "View screenshot: {caption}"
  - title: "{caption}" (tooltip on hover)
  - keyboard activatable (Enter, Space — default button behaviour)

ScreenshotLightbox:
  - role="dialog" aria-modal="true"
  - aria-label describes the current image
  - Keyboard: Escape closes, ArrowLeft/Right navigates
  - Focus trap: focus should remain within lightbox while open
    (implement with focus-trap library or manual useEffect)
  - Body scroll prevented while lightbox open

AttributionScreenshotsSection:
  - Section header is not interactive
  - Screenshot count communicated visually and via aria-label on the section
```

---

## 9. DATA FLOW SUMMARY

This section documents the complete path from admin screenshot upload to
employee screen display.

```
1. Admin uploads screenshot during Quick Entry form (FRONTEND_39)
   ↓
2. Backend validates SAP classification via vision model (IMPL_28, IMPL_25)
   ↓
3. Screenshot stored in MinIO: knowledge-screenshots/{entry_id}/{uuid}-{file}
   ↓
4. DB record created in knowledge_form_screenshots (IMPL_24)
   ↓
5. After entry published: enrich_entry_screenshots ARQ task runs (IMPL_28)
   ↓
6. Vision model extracts text from screenshot (IMPL_28)
   ↓
7. Extracted text appended to corresponding Qdrant chunk text (IMPL_28)
   Qdrant chunk payload updated: has_screenshots=true, screenshot_ids=[uuid]
   ↓
8. Employee asks a question in AEGIS chat (FRONTEND_12)
   ↓
9. CRAG pipeline performs hybrid Qdrant + OpenSearch search (IMPL_14, IMPL_15)
   ↓
10. Retrieved chunk has has_screenshots=true in payload
    Pipeline batch-fetches screenshot metadata from DB (IMPL_28 Section 5.1)
    ↓
11. LLM generates answer using enriched chunk text (includes extracted screenshot content)
    ↓
12. Validation engine scores answer (IMPL_17)
    ↓
13. WebSocket sends validation_result with screenshots[] array (IMPL_11, IMPL_28)
    ↓
14. Employee frontend receives WebSocket message (FRONTEND_08, FRONTEND_12)
    Updates attribution panel state with screenshots
    ↓
15. Employee sees answer in chat AND screenshots in attribution panel
    Thumbnails loaded lazily via /api/screenshots/[...path] proxy (FRONTEND_40)
    ↓
16. Employee clicks thumbnail → lightbox opens (FRONTEND_40)
    ↓
17. Employee submits feedback → includes form_entry_id (IMPL_29 Section 3.1)
    Feedback notification system monitors negative count (IMPL_29 Section 3.2)
```

---

*FRONTEND_40 — Employee Attribution Screenshots | AEGIS v1.0 | Sona Comstar*
