# IMPL_22: FINAL POLISH
## Nginx WebSocket Route · Admin Page Proxy Calls · Test Conftest
## Run after Session 21. This is the last implementation session.

---

## AGENT INSTRUCTIONS

Read this document completely. Then create/update every file shown. No file in this document is optional — all three gaps would cause visible failures in the demo.

**Files in this session:**
- `infrastructure/nginx/nginx.conf` — adds `/ws/` location block (WebSocket broken in Docker without this)
- `frontend/src/app/admin/documents/page.tsx` — replaces `getAccessToken()` with proxy API
- `frontend/src/app/admin/knowledge-gaps/page.tsx` — same fix
- `frontend/src/app/admin/review-queue/page.tsx` — same fix
- `frontend/src/app/admin/registry/page.tsx` — same fix
- `frontend/src/app/admin/config-snapshot/page.tsx` — same fix
- `frontend/src/app/admin/audit-trail/page.tsx` — same fix
- `frontend/src/app/admin/tickets/page.tsx` — same fix
- `tests/conftest.py` — pytest shared configuration

---

## FIX 1: Nginx WebSocket Location Block (CRITICAL)

**Why:** In Docker, the WebSocket URL is `wss://localhost/ws/chat`. This goes through Nginx. Nginx currently has location blocks for `/api/`, `/admin/`, `/health`, and `/`. There is NO block for `/ws/`. WebSocket connections silently fail — browser shows "Connection closed" immediately.

**Replace** the entire `infrastructure/nginx/nginx.conf` with this complete version:

```nginx
# AEGIS Nginx Configuration — Final version with WebSocket support

events {
    worker_connections 1024;
}

http {
    limit_req_zone $http_authorization zone=aegis_ratelimit:10m rate=60r/m;

    upstream aegis_backend {
        server aegis-fastapi:8000;
        keepalive 32;
    }

    upstream aegis_frontend {
        server aegis-frontend:3000;
        keepalive 16;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate /etc/nginx/ssl/aegis.crt;
        ssl_certificate_key /etc/nginx/ssl/aegis.key;
        ssl_protocols TLSv1.3;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options DENY always;
        add_header Strict-Transport-Security "max-age=31536000" always;

        client_max_body_size 50m;

        # ── WebSocket endpoint ── (MUST be before /api/ to prevent catch-all)
        location /ws/ {
            proxy_pass http://aegis_backend;
            proxy_http_version 1.1;

            # These headers are required for WebSocket upgrade
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Long timeout — WebSocket connections stay open for minutes
            proxy_read_timeout 180s;
            proxy_send_timeout 180s;
            proxy_connect_timeout 10s;

            # Disable buffering for streaming
            proxy_buffering off;
        }

        # ── API routes ──
        location /api/ {
            limit_req zone=aegis_ratelimit burst=10 nodelay;
            limit_req_status 429;

            proxy_pass http://aegis_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 180s;
        }

        # ── Admin API routes ──
        location /admin/ {
            limit_req zone=aegis_ratelimit burst=10 nodelay;
            limit_req_status 429;

            proxy_pass http://aegis_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
        }

        # ── Health check (no rate limiting) ──
        location /health {
            proxy_pass http://aegis_backend;
            proxy_read_timeout 10s;
        }

        # ── Frontend (Next.js) ──
        location / {
            proxy_pass http://aegis_frontend;
            proxy_http_version 1.1;
            # Also support WebSocket upgrade for Next.js hot reload
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 30s;
        }

        # ── Block server-side script extensions ──
        location ~* \.(php|asp|aspx|cgi)$ {
            return 404;
        }
    }
}
```

---

## FIX 2: Admin Page — Proxy API Calls

**Why:** After Session 21, `getAccessToken()` returns null (tokens are now in HttpOnly cookies). Every admin page that calls `fetch("/admin/...", { headers: { Authorization: "Bearer null" } })` will get 401 errors. All admin portal pages are broken.

**The fix:** Remove `getAccessToken()` import and use `/api/proxy/` prefix instead. This routes through the Next.js API proxy (created in Session 21) which reads the HttpOnly cookie and forwards the token.

Replace each admin page file with the corrected version below.

### frontend/src/app/admin/documents/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

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

  useEffect(() => { fetchDocuments(); }, []);

  async function fetchDocuments() {
    setIsLoading(true);
    // Uses /api/proxy/ — Next.js server reads HttpOnly cookie and forwards auth
    const resp = await fetch("/api/proxy/admin/documents");
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
    const resp = await fetch("/api/proxy/api/upload/document", { method: "POST", body: form });
    const data = await resp.json();
    setUploadMsg(resp.ok
      ? `✓ ${data.document_id} ingested (${data.chunk_count} chunks)`
      : `✗ ${data.message || "Upload failed"}`);
    if (resp.ok) fetchDocuments();
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
          <input type="file" accept=".docx,.pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {uploadMsg && (
        <div className={`mb-4 p-3 rounded text-sm ${uploadMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {uploadMsg}
        </div>
      )}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Document ID","Type","Module","Chunks","Verified","Status"].map(h => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No documents ingested yet. Upload a document using the button above.</td></tr>
            ) : docs.map(doc => (
              <tr key={doc.document_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{doc.document_id}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{doc.content_type}</td>
                <td className="px-4 py-2 text-xs">{doc.module}</td>
                <td className="px-4 py-2 text-xs">{doc.chunk_count}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{doc.last_verified_date}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[doc.status] || "bg-gray-100"}`}>{doc.status}</span>
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

### frontend/src/app/admin/knowledge-gaps/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

interface GapCluster { entity_combination: string; count_7d: number; count_30d: number; example_queries: string[]; gap_description: string; }

export default function KnowledgeGapsPage() {
  const [clusters, setClusters] = useState<GapCluster[]>([]);
  const [days, setDays] = useState<7 | 30>(7);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/proxy/admin/knowledge-gaps?days=${days}`)
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
      {isLoading ? <p className="text-gray-400 text-sm">Loading...</p> :
       clusters.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-700">
          No knowledge gaps in the last {days} days.
        </div>
       ) : (
        <div className="space-y-3">
          {clusters.map((c, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{c.entity_combination}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.gap_description}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-lg font-bold text-red-600">{c.count_7d}</p>
                  <p className="text-xs text-gray-400">last 7d</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100">
                {c.example_queries.slice(0, 2).map((q, j) => (
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

### frontend/src/app/admin/review-queue/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

interface ReviewItem { id: string; query_text: string; answer_text: string; unsupported_claims: string[]; status: string; created_at: string; }

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [correction, setCorrection] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/proxy/admin/review-queue").then(r => r.json()).then(d => setItems(d.items || []));
  }, []);

  async function submitCorrection(itemId: string) {
    setSubmitting(true);
    await fetch(`/api/proxy/admin/review-queue/${itemId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_correct_answer: correction }),
    });
    setSelected(null);
    setCorrection("");
    setSubmitting(false);
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Human Review Queue</h2>
        {items.length === 0 ? <p className="text-gray-400 text-sm">No items pending review.</p> : (
          <div className="space-y-2">
            {items.map(item => (
              <button key={item.id} onClick={() => { setSelected(item); setCorrection(""); }}
                className={`w-full text-left p-3 rounded border transition-colors ${selected?.id === item.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                <p className="text-sm font-medium text-gray-900 truncate">{item.query_text}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.unsupported_claims.length} unsupported · {item.created_at.slice(0, 10)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-sm mb-2">Review Item</h3>
          <p className="text-xs font-medium text-gray-500">Question</p>
          <p className="text-sm text-gray-800 mb-3">{selected.query_text}</p>
          <p className="text-xs font-medium text-gray-500">AEGIS Answer (Needs Correction)</p>
          <p className="text-sm text-gray-600 mb-3 bg-red-50 p-2 rounded text-xs">{selected.answer_text.slice(0, 200)}...</p>
          <p className="text-xs font-medium text-gray-500 mb-1">Correct Answer</p>
          <textarea value={correction} onChange={e => setCorrection(e.target.value)}
            placeholder="Enter the correct answer..." rows={5}
            className="w-full border border-gray-300 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => submitCorrection(selected.id)} disabled={!correction.trim() || submitting}
            className="mt-2 w-full bg-blue-600 text-white rounded py-2 text-sm disabled:opacity-50">
            {submitting ? "Submitting..." : "Submit Correction"}
          </button>
        </div>
      )}
    </div>
  );
}
```

### frontend/src/app/admin/registry/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

export default function RegistryPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proxy/admin/registry").then(r => r.json()).then(d => { setEntries(d.entries || []); setIsLoading(false); });
  }, []);

  async function approve(id: string) {
    await fetch(`/api/proxy/admin/registry/${id}/approve`, { method: "PATCH" });
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: "approved" } : e));
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Known Patterns Registry</h2>
      {isLoading ? <p className="text-gray-400 text-sm">Loading...</p> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{["Pattern","Type","Document","Status","Actions"].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No registry entries yet.</td></tr>
              ) : entries.map((e: any) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{e.pattern_string}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{e.pattern_type}</td>
                  <td className="px-4 py-2 text-xs font-mono">{e.linked_document_id}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${e.status === "approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {e.status === "draft" && (
                      <button onClick={() => approve(e.id)} className="text-xs text-blue-600 hover:underline">Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### frontend/src/app/admin/config-snapshot/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

interface ConfigEntry { config_category: string; config_key: string; config_value: string; staleness: string; age_days: number; updated_by: string; }

export default function ConfigSnapshotPage() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetch("/api/proxy/admin/config-snapshot").then(r => r.json()).then(d => setEntries(d.entries || []));
  }, []);

  async function saveEdit(category: string, key: string) {
    await fetch(`/api/proxy/admin/config-snapshot/${category}/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config_value: editValue }),
    });
    setEntries(prev => prev.map(e =>
      e.config_category === category && e.config_key === key ? { ...e, config_value: editValue, staleness: "fresh" } : e
    ));
    setEditing(null);
  }

  const stalenessColors: Record<string, string> = { fresh: "text-green-700", warning: "text-amber-600", critical: "text-red-600", unknown: "text-gray-400" };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">SAP Config Snapshot</h2>
      <p className="text-xs text-gray-400 mb-4">Amber = 35+ days old. Red = 70+ days old. Click a row to edit.</p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Category","Key","Value","Age","Updated By"].map(h => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const editKey = `${e.config_category}:${e.config_key}`;
              return (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => { setEditing(editKey); setEditValue(e.config_value); }}>
                  <td className="px-4 py-2 text-xs text-gray-500">{e.config_category}</td>
                  <td className="px-4 py-2 text-xs font-medium">{e.config_key}</td>
                  <td className="px-4 py-2 text-xs">
                    {editing === editKey ? (
                      <div className="flex gap-2" onClick={ev => ev.stopPropagation()}>
                        <input value={editValue} onChange={ev => setEditValue(ev.target.value)}
                          className="border rounded px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => saveEdit(e.config_category, e.config_key)} className="text-xs text-blue-600">Save</button>
                        <button onClick={() => setEditing(null)} className="text-xs text-gray-400">Cancel</button>
                      </div>
                    ) : <span className="truncate block max-w-xs">{e.config_value}</span>}
                  </td>
                  <td className={`px-4 py-2 text-xs ${stalenessColors[e.staleness]}`}>{e.age_days}d</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{e.updated_by}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### frontend/src/app/admin/audit-trail/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetch(`/api/proxy/admin/audit-trail?days=${days}`)
      .then(r => r.json()).then(d => setEntries(d.entries || []));
  }, [days]);

  const badgeColors: Record<string, string> = { green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-700", none: "bg-gray-100 text-gray-500" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Employee Audit Trail</h2>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 text-sm">
          {[1, 7, 30].map(d => <option key={d} value={d}>Last {d} day{d > 1 ? "s" : ""}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Time","Type","Badge","Score","Feedback"].map(h => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No audit records for this period.</td></tr>
            ) : entries.map((e: any, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-4 py-2 text-xs text-gray-500">{e.occurred_at?.slice(0, 19)}</td>
                <td className="px-4 py-2 text-xs">{e.request_type}</td>
                <td className="px-4 py-2">
                  {e.confidence_badge && <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColors[e.confidence_badge] || ""}`}>{e.confidence_badge}</span>}
                </td>
                <td className="px-4 py-2 text-xs">{e.validation_score?.toFixed(2) || "-"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{e.feedback_signal !== "none" ? e.feedback_signal : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### frontend/src/app/admin/tickets/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");

  useEffect(() => {
    fetch(`/api/proxy/admin/tickets?status=${statusFilter}`)
      .then(r => r.json()).then(d => setTickets(d.tickets || []));
  }, [statusFilter]);

  async function updateStatus(ticketId: string, newStatus: string) {
    await fetch(`/api/proxy/admin/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTickets(prev => prev.map(t => t.ticket_id === ticketId ? { ...t, status: newStatus } : t));
  }

  const statusColors: Record<string, string> = { open: "text-red-600 bg-red-50", in_progress: "text-amber-600 bg-amber-50", resolved: "text-green-700 bg-green-50" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Mock Ticket Management</h2>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm">
          {["open","in_progress","resolved"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {tickets.length === 0 ? <p className="text-gray-400 text-sm">No {statusFilter} tickets.</p> :
          tickets.map((t: any) => (
            <div key={t.ticket_id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-mono text-gray-400">{t.ticket_id}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{t.query_text.slice(0, 100)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.reason}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[t.status]}`}>{t.status}</span>
                  {t.status === "open" && (
                    <button onClick={() => updateStatus(t.ticket_id, "in_progress")}
                      className="text-xs text-blue-600 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-50">
                      Start
                    </button>
                  )}
                  {t.status === "in_progress" && (
                    <button onClick={() => updateStatus(t.ticket_id, "resolved")}
                      className="text-xs text-green-600 border border-green-200 px-2 py-0.5 rounded hover:bg-green-50">
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
```

---

## FIX 3: tests/conftest.py (NEW)

```python
"""
AEGIS Test Configuration
Shared pytest configuration for all test files.
asyncio_mode = "auto" is set in pyproject.toml so async tests work automatically.
"""
import pytest


# Shared marker for slow integration tests
slow = pytest.mark.slow


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow (integration tests)")
    config.addinivalue_line("markers", "asyncio: marks tests as async")
```

---

## SESSION 22 VERIFICATION

```bash
# 1. Verify nginx.conf has /ws/ location
grep "location /ws/" infrastructure/nginx/nginx.conf && echo "✓ WebSocket location exists"

# 2. Restart nginx to pick up new config
docker compose restart aegis-nginx
sleep 3

# 3. Test WebSocket through Nginx (requires wscat: npm install -g wscat)
TOKEN=$(curl -s -X POST http://localhost:8080/realms/aegis-realm/protocol/openid-connect/token \
  -d "grant_type=password&client_id=aegis-chat&client_secret=aegis_chat_client_secret_dev&username=employee1&password=employee_demo_2024" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
wscat -c "wss://localhost/ws/chat?token=$TOKEN" --no-check 2>&1 | head -5
# Expected: {"type":"session_ready",...}

# 4. Verify admin pages use proxy (no getAccessToken)
grep -r "getAccessToken" frontend/src/app/admin/ | wc -l
# Expected: 0

# 5. Test admin documents page through browser
open https://localhost/admin/documents
# Login as itadmin1, should see Document Management page with empty table
# No 401 errors in browser DevTools Network tab

# 6. Run all unit tests
cd backend && source venv/bin/activate
python -m pytest tests/unit/ -v --timeout=30

# 7. Run integration tests
python scripts/seed_test_documents.py
python -m pytest tests/integration/ -v --timeout=180 -s
```

---

```bash
git add -A
git commit -m "IMPL-22: Final polish - Nginx WebSocket route, admin proxy calls, conftest"
```

---

*Document version: 1.0 | AEGIS Specification Set — Absolute Final Session*
