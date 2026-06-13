# AEGIS Frontend Specification Set — Tier 4
37 documents covering the complete Next.js 15 frontend for the AEGIS SAP Helpdesk AI.

## Quick start
Read FRONTEND_MASTER_REFERENCE.md first.
Then follow FRONTEND_35_AGENT_SESSION_GUIDE.md for the 18-session implementation plan.

## Supplements (read before starting)
The /supplements/ folder contains 5 critical fix documents that patch the main docs.
ALWAYS attach the relevant supplement alongside the main document it patches.

| Supplement | Patches | Session to apply |
|---|---|---|
| SUPPLEMENT_01_CRITICAL_BUG_FIXES | useAuth, adminStore, types, CSS | F02, F05, F07 |
| SUPPLEMENT_02_PROXY_ROUTE_PDF | Proxy FILE 15, PDF component | F03, F06 |
| SUPPLEMENT_03_SESSION_API | Full session API + PostgreSQL schema | F18 |
| SUPPLEMENT_04_BACKEND_APIS_30_33 | Full backend API depth | F18 |
| SUPPLEMENT_05_PRODUCTION_HARDENING | Multi-tab, timezone, import paths | F09, F11 |

## Document count
- Main spec: 32 documents
- Supplements: 5 documents
- Total: 37 documents
