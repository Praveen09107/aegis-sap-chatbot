# AEGIS Frontend Session Guide — Part 3 of 3: Polish, Integration & Quick Entry
## Sessions F15–F19
## References FRONTEND_VERIFICATION_STANDARDS.md throughout

---

# SESSION F15 — ANIMATIONS & MICRO-INTERACTIONS

### Branch
```bash
git checkout -b session/build-f15-animations
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_23_FRAMER_MOTION.md, and
FRONTEND_24_MICRO_INTERACTIONS.md completely.

Build against "motion" (the current package), not "framer-motion" — confirmed
rebrand, same API, import path changed to motion/react. FRONTEND_23's code
examples use the old framer-motion import path throughout; translate every
import to motion/react as you build — this is a mechanical rename, the
component and hook APIs themselves are unchanged, confirmed directly against
the library's own migration guide.

Respect prefers-reduced-motion via useReducedMotion from the start — this is
both a real accessibility requirement (WCAG 2.2) and explicitly supported by
the current library.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Part 3 (visual regression with animations disabled during capture, per the config already set in Part 1 — capturing mid-animation is not a real screenshot to baseline against) and Part 4 (`useReducedMotion` respected — test with the OS setting enabled).
```bash
grep -rn "from ['\"]framer-motion['\"]" src/
# expect no output — every import should read from "motion/react"
```

### Commit
```bash
git add -A && git commit -m "F15: Animations and micro-interactions, motion/react (not framer-motion), reduced-motion support"
git checkout main && git merge session/build-f15-animations && git push origin main
```

---

# SESSION F16 — DARK MODE, ERROR HANDLING & POLISH

### Branch
```bash
git checkout -b session/build-f16-dark-mode
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_25_DARK_MODE.md, and
FRONTEND_26_ERROR_HANDLING.md completely.

Note: FRONTEND_25's "Sona Comstar logo" section header is a documentation
label only — the actual technique (a brightness-0 invert CSS filter for dark
mode) is already generic, confirmed directly, no functional fix needed there.

Build error boundaries, offline detection, and WebSocket reconnection handling
per FRONTEND_26 — this connects directly to F09's real WebSocket contract,
confirm reconnection actually re-establishes a working stream against the
live backend, not just that a reconnect attempt fires.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4. Residual manual check (Part 7): toggle dark mode, confirm the logo inverts correctly and persists across a refresh; disconnect network mid-session, confirm the offline banner appears and reconnection genuinely restores a working chat session.

### Commit
```bash
git add -A && git commit -m "F16: Dark mode, error handling, WebSocket reconnection confirmed against live backend"
git checkout main && git merge session/build-f16-dark-mode && git push origin main
```

---

# SESSION F17 — ACCESSIBILITY & PERFORMANCE

**Two dedicated sessions worth of rigor in one — this is where WCAG 2.2 AA and the confirmed Core Web Vitals targets get applied comprehensively across the whole app, not just per-page as each session went.**

### Branch
```bash
git checkout -b session/build-f17-accessibility-performance
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_27_ACCESSIBILITY.md, and
FRONTEND_28_PERFORMANCE.md completely.

Build to WCAG 2.2 AA, not FRONTEND_27's originally-specified 2.1 AA — 2.2 is
current practice and includes real new success criteria 2.1 never required
(target size minimums, focus-not-obscured, accessible authentication). Apply
these across every page built so far, not just new components in this session.

Performance: FRONTEND_28's numeric targets (LCP <2.5s, CLS <0.1, INP <200ms)
are confirmed still current — build to them as specified, correcting only the
"FID / INP" naming (FID is retired, not a second name for INP).

Apply lazy loading, virtualization, and bundle-splitting per FRONTEND_28
across the whole app now that every route exists to actually measure.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 4–5, applied app-wide, not per-page:
```bash
# Run axe-core across every route, not just new ones
npx playwright test -g "accessibility" --project=chromium

# Run Lighthouse against every major route
for route in / /history /admin/dashboard /admin/documents; do
  npx lighthouse "http://localhost:3000$route" --preset=desktop --output=json --output-path="./lighthouse-$route.json"
done
```
Residual manual check (Part 7): one full keyboard-only pass through the entire app (both portals), one full NVDA pass through the employee chat flow specifically (the most complex interactive flow in the app).

### Commit
```bash
git add -A && git commit -m "F17: WCAG 2.2 AA app-wide, confirmed Core Web Vitals targets, lazy loading and bundle splitting"
git checkout main && git merge session/build-f17-accessibility-performance && git push origin main
```

---

# SESSION F18 — BACKEND API PROXY & FINAL VERIFICATION

**The first session where every prior session's real output exists to verify together, not assumed already built. One real pre-existing file to check first.**

### Branch
```bash
git checkout -b session/build-f18-proxy-verification
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_34_VERIFICATION.md,
FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF.md, FRONTEND_SUPPLEMENT_03_SESSION_API_COMPLETE.md,
and FRONTEND_SUPPLEMENT_04_BACKEND_APIS_30_33.md completely.

One real file already exists: src/app/api/proxy/[...path]/route.ts (Session 21,
ad hoc, never executed). Read it, compare against SUPPLEMENT_02's proxy-route
portion and this session's real spec, complete/correct rather than discard.

This session's original attach-list (FRONTEND_29_33_BACKEND_API_CONTRACTS.md)
is stale — build against SUPPLEMENT_03 (supersedes FRONTEND_29, described in
its own header as "too thin") and SUPPLEMENT_04 (supersedes FRONTEND_30-33)
instead.

Connect the real backend now, for the first time across the whole app — every
route, every WebSocket connection, every admin endpoint. The backend is
confirmed working end-to-end against live inference as of DEC-059, so this is
connecting to genuinely working endpoints, not debugging frontend and backend
simultaneously against an uncertain target.

Run FRONTEND_34_VERIFICATION.md's original manual checklist in full now, as
the residual layer (FRONTEND_VERIFICATION_STANDARDS.md Part 7) — every page,
every feature flow, on both Chrome and Firefox at 1440×900, per its original
instructions. This checklist's content is real and valuable; what changed is
its role, not its content.
```

### Verify — the full standards gate, app-wide, for the first time
```bash
npx tsc --noEmit              # 0 errors, whole tree
npx next lint                 # 0 errors, 0 warnings
npx vitest run --coverage     # thresholds met, whole tree
npx playwright test           # full suite: functional + visual + accessibility + security, both browsers
npm run build                 # builds successfully
ANALYZE=true npm run build    # @react-pdf not in initial chunk
npm start                     # production server starts on :3000
grep -rn "Sona Comstar" src/  # final full-codebase check — expect no output anywhere
```
Plus `FRONTEND_34_VERIFICATION.md`'s complete original manual checklist, run in full, both browsers.

### Commit
```bash
git add -A && git commit -m "F18: Real backend integration, proxy route completed, full verification gate passed"
git checkout main && git merge session/build-f18-proxy-verification && git push origin main
```

---

# SESSION F19 — ADMIN QUICK ENTRY + EMPLOYEE SCREENSHOT ATTRIBUTION

**Fresh build — none of these 5 documents were covered by the original 18-session guide.**

### Branch
```bash
git checkout -b session/build-f19-quick-entry
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_36_ADMIN_QUICK_ENTRY_LIST.md,
FRONTEND_37_ADMIN_QUICK_ENTRY_FORM.md, FRONTEND_38_ADMIN_QUICK_ENTRY_FORM_FIELDS.md,
FRONTEND_39_ADMIN_QUICK_ENTRY_SCREENSHOT.md, and
FRONTEND_40_EMPLOYEE_ATTRIBUTION_SCREENSHOTS.md completely.

Build the Quick Entry list page, the multi-step entry form and its field
components, the screenshot upload/review UI, and the employee-side attribution
display. Cross-check every file against AMENDMENT_GENERALIZATION_FRONTEND.md
for any Sona Comstar references not caught in the original sweep, since these
5 documents postdate it.

React 19-specific check for this session specifically (flagged during
reconciliation as the most form-heavy session in the whole spec set): if
FRONTEND_37's multi-step form uses useFormState anywhere, confirm this against
React 19's real current API — useFormState is deprecated in favor of
useActionState (still present but deprecated, will be removed in a future
release per React's own migration guide). Build against useActionState
directly rather than the deprecated alias.

Build against the real, confirmed-live Quick Entry backend (IMPL_23-29,
complete and re-verified multiple times, most recently DEC-057/DEC-059):
/api/admin/knowledge-entries, /api/admin/knowledge-screenshots — real
endpoints, not an assumed contract.
```

### Verify
Full `FRONTEND_VERIFICATION_STANDARDS.md` gate, plus:
```bash
npx tsc --noEmit
grep -rn "Sona Comstar" src/components/admin/quick-entry/ 2>/dev/null
# expect no output — if found, it's a new touchpoint not covered by the
# amendment and should be added to it
grep -rn "useFormState" src/components/admin/quick-entry/
# expect no output — should be useActionState throughout
```
Residual manual check (Part 7): create one real Quick Entry with a real screenshot through the actual built UI, confirm it appears correctly in a real employee query's attribution panel — the true end-to-end proof this feature works, UI included, not just the backend's own earlier `DEC-059` proof.

### Commit
```bash
git add -A && git commit -m "F19: Quick Entry admin UI, employee screenshot attribution, React 19 useActionState"
git checkout main && git merge session/build-f19-quick-entry && git push origin main
```

---

## PART 3 GATE, AND FULL FRONTEND GATE — GENUINELY COMPLETE WHEN

- [ ] All 5 sessions (F15–F19) merged to `main`.
- [ ] `FRONTEND_VERIFICATION_STANDARDS.md`'s full gate passes app-wide.
- [ ] A real Quick Entry, created through the real built UI with a real screenshot, is confirmed correctly attributed in a real employee query's response.
- [ ] Zero `grep` hits for "Sona Comstar" anywhere in the final `src/` tree.
- [ ] Zero `framer-motion` imports remain — all read from `motion/react`.
- [ ] Zero deprecated `useFormState` usage remains — all read `useActionState`.
- [ ] `npm run build` succeeds; production server starts and serves correctly.

**This closes all 19 frontend sessions.** Frontend and backend are now both proven working end-to-end. Production deployment and the remaining scoped backend items are covered separately in `REMAINING_BACKEND_ITEMS_GUIDE.md`.
