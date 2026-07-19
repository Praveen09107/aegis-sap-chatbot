# AEGIS Frontend Session Guide — Part 2 of 3: Employee & Admin Features
## Sessions F09–F14
## References FRONTEND_VERIFICATION_STANDARDS.md throughout — read Part 1 of this guide first for stack/setup context

---

# SESSION F09 — EMPLOYEE CHAT INTERFACE

**The most critical session in Part 2 — this is where the real, live backend contract gets built against for the first time.**

### Branch
```bash
git checkout -b session/build-f09-employee-chat
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_12_EMPLOYEE_CHAT.md,
FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md, and
FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md completely.

Build the employee chat interface. Build SUPPLEMENT_05's Part 1 (multi-tab
WebSocket coordination — useWebSocket.ts, uiStore extension,
MultiTabWarningBanner) and Part 2 (partial stream error handling — chatStore
extension, AIResponseBubble update, recovery from a stream erroring mid-
response) in from the start, as part of the same components — not retrofitted
after, since nothing exists yet to retrofit.

Build against the REAL, confirmed-live backend WebSocket contract, not an
assumed one: ws://.../ws/chat?token=<JWT>, message types token/stream_complete/
validation_result/error/ping — confirmed working end-to-end as of DEC-059,
including the critical fix that made streaming actually reach a browser for
the first time in this project's history (the Pub/Sub relay). Confirm
validation_result includes answer_text (a real, separate DEC-059 fix) — the
employee must see the actual answer, not just a confidence badge.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–6 in full — this session touches functional correctness (WebSocket message handling), visual regression (streaming bubble states, masked appropriately per Part 3), accessibility (a live region announcing streaming progress to screen readers is a real WCAG requirement here, not optional), and security (Part 6's markdown/XSS check applies directly to `AIResponseBubble`).

Residual manual checks (Part 7), specific to this session:
```
- Open the chat in two browser tabs simultaneously — confirm the warning banner appears
- Manually interrupt a streaming response (stop the backend mid-stream) —
  confirm graceful partial-response handling, not a crash or silent hang
- Connect against the REAL running backend (not mocked) for at least one
  full real query — confirm a real, live streamed answer renders correctly
```

### Commit
```bash
git add -A && git commit -m "F09: Employee chat interface, multi-tab coordination, stream recovery, real backend contract confirmed"
git checkout main && git merge session/build-f09-employee-chat && git push origin main
```

---

# SESSION F10 — EMPLOYEE HISTORY & ONBOARDING

### Branch
```bash
git checkout -b session/build-f10-history-onboarding
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_14_EMPLOYEE_HISTORY.md,
FRONTEND_15_EMPLOYEE_ONBOARDING.md, AMENDMENT_GENERALIZATION_FRONTEND.md,
FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md, and FRONTEND_SUPPLEMENT_01
completely.

Build src/components/onboarding/OnboardingStep.tsx and the rest of this
session's scope, with three things correct from the first version, not
patched in afterward:
(1) Logo alt text and the "AEGIS answers your SAP questions instantly using
    [org]'s..." copy both read from orgName (FILE 5).
(2) src/lib/utils.ts is built with NEXT_PUBLIC_DEPLOY_LOCALE/
    NEXT_PUBLIC_DEPLOY_TIMEZONE-driven date formatting from the start
    (formatDateLocalized) — formatDateIST exists only as a deprecated alias
    for compatibility, not a hardcoded Asia/Kolkata/en-IN default (FILE 10).
(3) Session history cards use formatDateLocalized for timestamps from the
    start (SUPPLEMENT_05 Part 3's session-history-card subsection).
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4. Plus:
```bash
grep -n "Sona Comstar" src/components/onboarding/OnboardingStep.tsx   # expect no output
grep -n "formatDateIST\|formatDateLocalized" src/lib/utils.ts   # expect both present
```

### Commit
```bash
git add -A && git commit -m "F10: Employee history and onboarding, formatDateLocalized, orgName onboarding copy"
git checkout main && git merge session/build-f10-history-onboarding && git push origin main
```

---

# SESSION F11 — ADMIN SHELL & DASHBOARD

### Branch
```bash
git checkout -b session/build-f11-admin-shell
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_16_ADMIN_SHELL.md,
FRONTEND_17_ADMIN_DASHBOARD.md, and FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md
completely.

Build src/components/admin/EmptyState.tsx as the ONE canonical location for
this component from the start, per SUPPLEMENT_05 Part 4. Never create it at
@/components/shared/EmptyState or @/components/ui/empty-state — both are
confirmed non-existent paths that must never be introduced. Every admin page
needing an empty state imports from @/components/admin/EmptyState from the
moment that page is written. Props: icon (a LucideIcon component, not a
string), title, optional description, optional action, and a variant prop.

Build the rest of the admin shell and live-metrics dashboard per FRONTEND_16/17.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4. Plus:
```bash
grep -rn "components/shared/EmptyState\|components/ui/empty-state" src/
# expect no output — both are confirmed non-existent paths
```

### Commit
```bash
git add -A && git commit -m "F11: Admin shell, dashboard, canonical EmptyState component"
git checkout main && git merge session/build-f11-admin-shell && git push origin main
```

---

# SESSION F12 — ADMIN DOCUMENTS & REGISTRY

### Branch
```bash
git checkout -b session/build-f12-admin-documents
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_18_ADMIN_DOCUMENTS.md,
FRONTEND_19_ADMIN_REGISTRY_CONFIG.md, and
FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md completely.

Build the admin documents and registry pages. The registry page's created_at
column uses formatDateLocalized from the start (defined in F10 — confirm F10
landed first).

This session connects to the real ingestion pipeline (IMPL_18, confirmed
complete and live) for document upload/tracking — build against its real,
confirmed endpoint shapes, not assumed ones.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4. Plus:
```bash
grep -n "formatDateLocalized\|formatDateIST" "src/app/(admin)/admin/registry/page.tsx"
```

### Commit
```bash
git add -A && git commit -m "F12: Admin documents and registry, formatDateLocalized on registry timestamps"
git checkout main && git merge session/build-f12-admin-documents && git push origin main
```

---

# SESSION F13 — ADMIN GAPS, AUDIT, REVIEW & TICKETS

### Branch
```bash
git checkout -b session/build-f13-admin-gaps
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_20_ADMIN_GAPS_AUDIT.md,
FRONTEND_21_ADMIN_REVIEW_TICKETS.md, and
FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md completely.

Build the admin gaps/audit/review/tickets pages. The audit trail timeline and
knowledge-gap "last seen" display both use formatDateLocalized from the start.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4. Plus:
```bash
grep -rn "formatDateLocalized\|formatDateIST" src/components/admin/AuditTimeline.tsx
```

### Commit
```bash
git add -A && git commit -m "F13: Admin gaps, audit, review, tickets pages"
git checkout main && git merge session/build-f13-admin-gaps && git push origin main
```

---

# SESSION F14 — ADMIN HEALTH & ANALYTICS

### Branch
```bash
git checkout -b session/build-f14-admin-health
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md
completely. No amendment applies.

Build the system health grid and analytics charts against the REAL, confirmed
admin endpoints: pipeline-health, inference-health (the new N-tier orchestration
endpoint from DEC-058), and knowledge-entries feedback-summary — all confirmed
live and correct as of DEC-059/DEC-060. The inference-health endpoint in
particular didn't exist when this spec document was originally written —
confirm its real response shape directly rather than assuming a generic
health-check format.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Part 5 (this is one of the two dedicated performance-sensitive sessions — chart-heavy pages are exactly where bundle size and render performance need real measurement, not assumption):
```bash
npx lighthouse http://localhost:3000/admin/health --preset=desktop --output=json
# LCP < 2.5s, INP < 200ms, CLS < 0.1, performance score ≥ 90
```

### Commit
```bash
git add -A && git commit -m "F14: Admin health and analytics, real inference-health endpoint integration"
git checkout main && git merge session/build-f14-admin-health && git push origin main
```

---

## PART 2 GATE — EMPLOYEE + ADMIN FEATURES COMPLETE WHEN

- [ ] All 6 sessions (F09–F14) merged to `main`.
- [ ] A real end-to-end employee chat query against the live backend has been confirmed working, not just unit-tested against mocks.
- [ ] Every admin page's empty state imports from the one canonical `@/components/admin/EmptyState` path.
- [ ] Every timestamp display across history, registry, audit, and gaps pages uses `formatDateLocalized`.
- [ ] Full `FRONTEND_VERIFICATION_STANDARDS.md` gate (Parts 2–7) passes for every session in this document.

**Part 3 (F15–F19, polish through Quick Entry) continues in the next document.**
