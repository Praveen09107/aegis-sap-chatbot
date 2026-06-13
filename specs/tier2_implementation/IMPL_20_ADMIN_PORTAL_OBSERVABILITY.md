# IMPL_20: ADMIN PORTAL AND OBSERVABILITY
## 7 Admin Screens, Next.js Middleware, Prometheus Metrics, Grafana 8 Panels
## Session 20 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 20: The IT admin portal and observability stack.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-19 complete.

**What this session creates:**
- `frontend/middleware.ts` — Edge middleware for /admin/* role enforcement
- `frontend/src/app/admin/layout.tsx` — Admin portal layout with navigation
- All 7 admin page components
- `backend/app/observability.py` — Prometheus custom metrics
- Grafana dashboard provisioning (infrastructure/grafana/dashboards/aegis-main.json)

---

## FILE 1: frontend/middleware.ts

```typescript
// AEGIS Next.js Edge Middleware
// Runs server-side before every request.
// Protects /admin/* routes — requires it-admin role.
// Must be at frontend/middleware.ts (not inside src/).

import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect admin routes
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Read access token from cookie
  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Decode JWT payload (no signature verification — handled by FastAPI)
  try {
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString());

    const roles: string[] = payload?.realm_access?.roles || [];
    if (!roles.includes("it-admin")) {
      // Employee trying to access admin portal → redirect to chat
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Attach user info to request headers for downstream use
    const response = NextResponse.next();
    response.headers.set("X-User-Role", "it-admin");
    response.headers.set("X-User-Sub", payload.sub || "");
    return response;
  } catch {
    // Invalid token format
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

---

## FILE 2: frontend/src/app/admin/layout.tsx

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "../../lib/auth";

const NAV_ITEMS = [
  { label: "Documents", href: "/admin/documents", icon: "📄" },
  { label: "Registry", href: "/admin/registry", icon: "🔗" },
  { label: "Config Snapshot", href: "/admin/config-snapshot", icon: "⚙️" },
  { label: "Knowledge Gaps", href: "/admin/knowledge-gaps", icon: "🔍" },
  { label: "Audit Trail", href: "/admin/audit-trail", icon: "📋" },
  { label: "Review Queue", href: "/admin/review-queue", icon: "⚠️" },
  { label: "Tickets", href: "/admin/tickets", icon: "🎫" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-sm font-bold text-gray-900">AEGIS Admin</h1>
          <p className="text-xs text-gray-400 mt-0.5">IT Portal</p>
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-200">
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

---

## FILE 3: frontend/src/app/admin/documents/page.tsx

```tsx
"use client";

import { useState, useEffect } from "react";
import { getAccessToken } from "../../../lib/auth";

interface DocumentRecord {
  document_id: string;
  content_type: string;
  module: string;
  status: string;
  chunk_count: number;
  last_verified_date: string;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    setIsLoading(true);
    const resp = await fetch("/admin/documents", {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      setDocs(data.documents || []);
    }
    setIsLoading(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);

    const form = new FormData();
    form.append("file", file);

    const resp = await fetch("/api/upload/document", {
      method: "POST",
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: form,
    });

    const data = await resp.json();
    if (resp.ok) {
      setUploadMsg(`✓ ${data.document_id} ingested (${data.chunk_count} chunks)`);
      fetchDocuments();
    } else {
      setUploadMsg(`✗ ${data.message} (stage: ${data.stage})`);
    }
    setUploading(false);
  }

  const statusColors: Record<string, string> = {
    active: "text-green-700 bg-green-50",
    processing: "text-blue-700 bg-blue-50",
    failed: "text-red-700 bg-red-50",
    deprecated: "text-gray-500 bg-gray-100",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Document Management</h2>
        <label className="cursor-pointer bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
          {uploading ? "Uploading..." : "Upload Document"}
          <input
            type="file" accept=".docx,.pdf" className="hidden"
            onChange={handleUpload} disabled={uploading}
          />
        </label>
      </div>

      {uploadMsg && (
        <div className={`mb-4 p-3 rounded text-sm ${
          uploadMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {uploadMsg}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Document ID", "Type", "Module", "Chunks", "Verified", "Status"].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No documents ingested yet.</td></tr>
            ) : docs.map(doc => (
              <tr key={doc.document_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{doc.document_id}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{doc.content_type}</td>
                <td className="px-4 py-2 text-xs">{doc.module}</td>
                <td className="px-4 py-2 text-xs">{doc.chunk_count}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{doc.last_verified_date}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[doc.status] || "bg-gray-100"}`}>
                    {doc.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## FILE 4: frontend/src/app/admin/knowledge-gaps/page.tsx

```tsx
"use client";

import { useState, useEffect } from "react";
import { getAccessToken } from "../../../lib/auth";

interface GapCluster {
  entity_combination: string;
  count_7d: number;
  count_30d: number;
  example_queries: string[];
  gap_description: string;
}

export default function KnowledgeGapsPage() {
  const [clusters, setClusters] = useState<GapCluster[]>([]);
  const [days, setDays] = useState<7 | 30>(7);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/admin/knowledge-gaps?days=${days}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
      .then(r => r.json())
      .then(data => { setClusters(data.clusters || []); setIsLoading(false); });
  }, [days]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Knowledge Gap Dashboard</h2>
        <div className="flex gap-2">
          {([7, 30] as const).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-sm ${days === d ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-600"}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : clusters.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-700">
          No knowledge gaps detected in the last {days} days. The knowledge base covers all queries.
        </div>
      ) : (
        <div className="space-y-3">
          {clusters.map((cluster, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-900">{cluster.entity_combination}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{cluster.gap_description}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-lg font-bold text-red-600">{cluster.count_7d}</p>
                  <p className="text-xs text-gray-400">last 7 days</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Example queries:</p>
                {cluster.example_queries.slice(0, 2).map((q, j) => (
                  <p key={j} className="text-xs text-gray-600 italic">"{q}"</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## FILE 5: frontend/src/app/admin/review-queue/page.tsx

```tsx
"use client";

import { useState, useEffect } from "react";
import { getAccessToken } from "../../../lib/auth";

interface ReviewItem {
  id: string;
  query_text: string;
  answer_text: string;
  unsupported_claims: string[];
  status: string;
  created_at: string;
  admin_correct_answer?: string;
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [correction, setCorrection] = useState("");

  useEffect(() => {
    fetch("/admin/review-queue", {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    }).then(r => r.json()).then(d => setItems(d.items || []));
  }, []);

  async function submitCorrection(itemId: string) {
    await fetch(`/admin/review-queue/${itemId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ admin_correct_answer: correction }),
    });
    setSelected(null);
    setCorrection("");
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Human Review Queue</h2>
        {items.length === 0 ? (
          <p className="text-gray-400 text-sm">No items pending review.</p>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <button key={item.id} onClick={() => { setSelected(item); setCorrection(""); }}
                className={`w-full text-left p-3 rounded border transition-colors ${
                  selected?.id === item.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}>
                <p className="text-sm font-medium text-gray-900 truncate">{item.query_text}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.unsupported_claims.length} unsupported claim(s) · {item.created_at.slice(0, 10)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-sm text-gray-900 mb-2">Review Item</h3>
          <p className="text-xs font-medium text-gray-500">Question</p>
          <p className="text-sm text-gray-800 mb-3">{selected.query_text}</p>
          <p className="text-xs font-medium text-gray-500">AEGIS Answer (Incorrect)</p>
          <p className="text-sm text-gray-600 mb-3 bg-red-50 p-2 rounded">{selected.answer_text.slice(0, 300)}...</p>
          {selected.unsupported_claims.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Unsupported Claims</p>
              {selected.unsupported_claims.map((c, i) => (
                <p key={i} className="text-xs text-red-600 bg-red-50 p-1 rounded mb-1">{c}</p>
              ))}
            </div>
          )}
          <p className="text-xs font-medium text-gray-500 mb-1">Correct Answer</p>
          <textarea
            value={correction}
            onChange={e => setCorrection(e.target.value)}
            placeholder="Enter the correct, accurate answer based on your SAP knowledge..."
            className="w-full border border-gray-300 rounded p-2 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => submitCorrection(selected.id)}
            disabled={!correction.trim()}
            className="mt-2 w-full bg-blue-600 text-white rounded py-2 text-sm disabled:opacity-50"
          >
            Submit Correction
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## FILE 6: Remaining Admin Pages (Stubs)

Create these three files as functional stubs — they query existing admin API endpoints.

### frontend/src/app/admin/registry/page.tsx
```tsx
"use client";
// Known Patterns Registry management
// Displays records from known_patterns_registry table
// IT admin can approve/deprecate entries and add new ones
// Uses GET /admin/registry and POST /admin/registry endpoints
import { useState, useEffect } from "react";
import { getAccessToken } from "../../../lib/auth";

export default function RegistryPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    fetch("/admin/registry", { headers: { Authorization: `Bearer ${getAccessToken()}` } })
      .then(r => r.json()).then(d => { setEntries(d.entries || []); setIsLoading(false); });
  }, []);
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Known Patterns Registry</h2>
      {isLoading ? <p className="text-gray-400 text-sm">Loading...</p> : (
        <table className="w-full text-sm bg-white border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Pattern", "Type", "Document", "Status", "Actions"].map(h =>
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
            )}</tr>
          </thead>
          <tbody>
            {entries.map((e: any) => (
              <tr key={e.id} className="border-b border-gray-100">
                <td className="px-4 py-2 font-mono text-xs">{e.pattern_string}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{e.pattern_type}</td>
                <td className="px-4 py-2 text-xs font-mono">{e.linked_document_id}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    e.status === "approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  }`}>{e.status}</span>
                </td>
                <td className="px-4 py-2 text-xs text-blue-600">
                  {e.status === "draft" ? "Approve | Deprecate" : "Deprecate"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### frontend/src/app/admin/audit-trail/page.tsx
```tsx
"use client";
export default function AuditTrailPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Employee Audit Trail</h2>
      <p className="text-sm text-gray-500">
        Query the audit_log table. Filters: date range, confidence badge, request type.
        All queries are by user_id_hash (SHA-256 of JWT sub) — no PII stored.
      </p>
      {/* Full implementation: GET /admin/audit-trail with date/badge filters */}
    </div>
  );
}
```

### frontend/src/app/admin/tickets/page.tsx
```tsx
"use client";
export default function TicketsPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Mock Ticket Management</h2>
      <p className="text-sm text-gray-500">
        Lists open mock tickets created when AEGIS returns INSUFFICIENT.
        IT admin can update status and add resolution notes.
      </p>
      {/* Full implementation: GET /admin/tickets, PATCH /admin/tickets/:id */}
    </div>
  );
}
```

### frontend/src/app/admin/config-snapshot/page.tsx
```tsx
"use client";
export default function ConfigSnapshotPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">SAP Config Snapshot</h2>
      <p className="text-sm text-gray-500">
        Inline-editable table of current Sona Comstar SAP configuration values.
        Rows older than 35 days show amber staleness warning.
        Rows older than 70 days show red critical warning.
      </p>
      {/* Full implementation: GET/PUT /admin/config-snapshot */}
    </div>
  );
}
```

---

## FILE 7: backend/app/observability.py

```python
"""
AEGIS Prometheus Metrics
Custom metrics exposed at GET /metrics.
These feed the Grafana 8-panel quality dashboard.
"""
from prometheus_client import Counter, Histogram, Gauge

# ── Request metrics ──────────────────────────────────────────
REQUEST_COUNTER = Counter(
    "aegis_requests_total",
    "Total HTTP/WebSocket requests",
    ["endpoint", "status"],
)

# ── Generation metrics ───────────────────────────────────────
GENERATION_LATENCY = Histogram(
    "aegis_generation_duration_seconds",
    "Time from first token to stream_complete",
    buckets=[5, 10, 20, 30, 60, 90, 120, 180],
)

GENERATION_TIER = Counter(
    "aegis_generation_tier_total",
    "Generation calls by model tier",
    ["tier"],
)

# ── Validation metrics ───────────────────────────────────────
VALIDATION_SCORE = Histogram(
    "aegis_validation_score",
    "ValidationScore distribution",
    ["classification"],
    buckets=[0.3, 0.5, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.0],
)

CONFIDENCE_BADGE = Counter(
    "aegis_confidence_badge_total",
    "Confidence badge assignments",
    ["badge"],  # green | amber | none
)

# ── Retrieval metrics ────────────────────────────────────────
CACHE_HITS = Counter(
    "aegis_cache_hits_total",
    "Semantic cache hits (requests that skipped retrieval)",
)

CRAG_ASSESSMENT = Counter(
    "aegis_crag_assessment_total",
    "CRAG self-reflection outcomes",
    ["assessment"],  # SUFFICIENT | INSUFFICIENT | SKIPPED
)

RETRIEVAL_MODE = Counter(
    "aegis_retrieval_mode_total",
    "Retrieval mode usage",
    ["mode"],  # A | B | C
)

CROSS_ENCODER_SCORE = Histogram(
    "aegis_cross_encoder_top_score",
    "Top cross-encoder score after reranking",
    buckets=[0.3, 0.5, 0.65, 0.70, 0.80, 0.82, 0.85, 0.90, 0.95, 1.0],
)

# ── Escalation metrics ───────────────────────────────────────
ESCALATIONS = Counter(
    "aegis_escalations_total",
    "Queries escalated (INSUFFICIENT CRAG → mock ticket)",
)

KNOWLEDGE_GAPS = Counter(
    "aegis_knowledge_gap_events_total",
    "Knowledge gap events recorded",
)

# ── Vision metrics ───────────────────────────────────────────
VISION_TASKS = Counter(
    "aegis_vision_tasks_total",
    "Screenshot processing tasks",
    ["status"],  # success | failed
)

# ── System metrics ───────────────────────────────────────────
ACTIVE_SESSIONS = Gauge(
    "aegis_active_sessions",
    "Currently active WebSocket sessions",
)


def record_pipeline_metrics(
    enriched_query,
    retrieval_result,
    validation_result,
    generation_seconds: float,
    cache_hit: bool,
) -> None:
    """
    Record all metrics for one completed query pipeline.
    Call this at the end of _handle_client_message in chat_handler.py.
    """
    if cache_hit:
        CACHE_HITS.inc()
        return  # Cache hits don't go through retrieval/validation

    RETRIEVAL_MODE.labels(mode=retrieval_result.retrieval_mode_used).inc()
    CRAG_ASSESSMENT.labels(assessment=retrieval_result.crag_assessment).inc()
    CROSS_ENCODER_SCORE.observe(retrieval_result.top_cross_encoder_score)

    VALIDATION_SCORE.labels(
        classification=enriched_query.classification
    ).observe(validation_result.validation_score)
    CONFIDENCE_BADGE.labels(badge=validation_result.confidence_badge).inc()

    GENERATION_LATENCY.observe(generation_seconds)

    if retrieval_result.crag_assessment == "INSUFFICIENT":
        ESCALATIONS.inc()
```

---

## FILE 8: infrastructure/grafana/dashboards/aegis-main.json

The Grafana dashboard with 8 panels. Create this file with the following structure (abbreviated — Grafana can auto-generate full JSON when you create panels via UI):

```json
{
  "title": "AEGIS Quality Dashboard",
  "uid": "aegis-main",
  "panels": [
    {
      "title": "Request Rate (req/min)",
      "type": "stat",
      "targets": [{
        "expr": "rate(aegis_requests_total[1m]) * 60"
      }]
    },
    {
      "title": "Average ValidationScore",
      "type": "gauge",
      "targets": [{
        "expr": "avg(rate(aegis_validation_score_sum[5m])) / avg(rate(aegis_validation_score_count[5m]))"
      }],
      "fieldConfig": {"defaults": {"min": 0, "max": 1, "thresholds": {
        "steps": [{"value": 0, "color": "red"}, {"value": 0.70, "color": "yellow"}, {"value": 0.85, "color": "green"}]
      }}}
    },
    {
      "title": "Confidence Badge Distribution",
      "type": "piechart",
      "targets": [
        {"expr": "aegis_confidence_badge_total{badge='green'}", "legendFormat": "Green"},
        {"expr": "aegis_confidence_badge_total{badge='amber'}", "legendFormat": "Amber"},
        {"expr": "aegis_confidence_badge_total{badge='none'}", "legendFormat": "None"}
      ]
    },
    {
      "title": "CRAG Assessment Distribution",
      "type": "piechart",
      "targets": [
        {"expr": "aegis_crag_assessment_total{assessment='SUFFICIENT'}", "legendFormat": "Sufficient"},
        {"expr": "aegis_crag_assessment_total{assessment='INSUFFICIENT'}", "legendFormat": "Insufficient"},
        {"expr": "aegis_crag_assessment_total{assessment='SKIPPED'}", "legendFormat": "Skipped"}
      ]
    },
    {
      "title": "Semantic Cache Hit Rate",
      "type": "stat",
      "targets": [{
        "expr": "rate(aegis_cache_hits_total[5m]) / rate(aegis_requests_total{endpoint='/ws/chat'}[5m]) * 100",
        "legendFormat": "Cache Hit %"
      }]
    },
    {
      "title": "Retrieval Mode Usage",
      "type": "bargauge",
      "targets": [
        {"expr": "aegis_retrieval_mode_total{mode='A'}", "legendFormat": "Mode A (Registry)"},
        {"expr": "aegis_retrieval_mode_total{mode='B'}", "legendFormat": "Mode B (Standard)"},
        {"expr": "aegis_retrieval_mode_total{mode='C'}", "legendFormat": "Mode C (Complex)"}
      ]
    },
    {
      "title": "Generation Latency (p50/p95)",
      "type": "timeseries",
      "targets": [
        {"expr": "histogram_quantile(0.50, rate(aegis_generation_duration_seconds_bucket[5m]))", "legendFormat": "p50"},
        {"expr": "histogram_quantile(0.95, rate(aegis_generation_duration_seconds_bucket[5m]))", "legendFormat": "p95"}
      ]
    },
    {
      "title": "Knowledge Gap Events",
      "type": "timeseries",
      "targets": [{
        "expr": "rate(aegis_knowledge_gap_events_total[5m]) * 60",
        "legendFormat": "Gap Events/min"
      }]
    }
  ]
}
```

---

## FILE 9: infrastructure/grafana/provisioning/datasources.yml

Already specified in IMPL_03. Verify it exists.

---

## VERIFICATION STEPS

### Step 1: Verify middleware protects admin routes
```bash
# Without auth — should redirect to login
curl -v http://localhost:3000/admin/documents 2>&1 | grep "Location"
# Expected: Location: http://localhost:3000/login

# With employee token — should redirect to /
# With it-admin token — should return 200
```

### Step 2: Verify Prometheus metrics endpoint
```bash
# Start FastAPI
curl -s http://localhost:8000/metrics | grep "aegis_"
```
Expected: Lists aegis_* metric lines.

### Step 3: Verify Grafana dashboard loads
```bash
open http://localhost:3000
# Login: admin / (GRAFANA_PASSWORD from .env)
# Navigate to Dashboards → AEGIS Quality Dashboard
# 8 panels should appear (may show No Data if no queries yet)
```

### Step 4: Run a test query and verify metrics update
```bash
# After sending a test query through the chat interface:
curl -s http://localhost:8000/metrics | grep -E "aegis_confidence_badge|aegis_retrieval_mode|aegis_crag"
```
Expected: Counters incremented by 1 after the query.

### Step 5: Verify admin portal login
1. Open `http://localhost:3000/admin/documents`
2. Log in as `itadmin1` / `itadmin_demo_2024`
3. Admin portal appears with sidebar navigation
4. Log in as `employee1` → gets redirected to `/` (chat, not admin)

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-20: Admin portal and observability - Prometheus metrics and Grafana dashboard verified"
```

---
## QUICK ENTRY PIPELINE HEALTH METRICS (Added in IMPL_29)

The System Health page gains a new "Quick Entry Pipeline" section.

Data source: GET /api/admin/knowledge-entries/pipeline-health
Response type: QuickEntryPipelineHealth (see IMPL_23 Section 8)
Polling: 30 seconds (same interval as existing service health polling)

Metrics displayed:
  - ARQ queue depths (form entry queue, screenshot queue)
  - Average processing time last 24h (ms)
  - Entry status distribution (active / draft / failed / partial_index / etc.)
  - Screenshot vision status distribution (complete / failed / pending / not_sap)
  - Knowledge quality comparison: Quick Entry avg score vs Document avg score
  - Entries with net negative feedback (last 30 days)
  - Screenshot storage size (MB) and files eligible for cleanup

Section header badge:
  Green:  all nominal
  Amber:  any failed entries > 0 OR failed screenshots > 0
  Red:    failed entries > 5 OR partial_index entries > 5

Full frontend spec: FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md (see end of file addition)
Full backend spec: IMPL_29 Section 8


---

*Document version: 1.0 | AEGIS Specification Set*
