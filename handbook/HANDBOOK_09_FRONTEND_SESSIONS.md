# AEGIS Implementation Handbook — Document 09
# Frontend Sessions — F01 through F19

**Prerequisite:** Document 08 complete (backend fully complete including Quick Entry).
**Outcome:** The complete Next.js frontend — employee chat + admin portal — built, verified, and connected to the real backend.
**Time:** 8–15 hours across 20 sessions (F01–F19, with F05 split into F05/F05b).

---

## HOW FRONTEND SESSIONS DIFFER FROM BACKEND ONES

Three practical differences to keep in mind:

1. **Different verification.** Backend sessions verify with `pytest`. Frontend sessions verify with `npm run build` (does it compile with zero TypeScript errors?) and manual click-through (does the UI actually work?). There's no pytest here.

2. **Most of these are RETROFITS, not fresh builds.** Unlike the backend, the frontend's original 18 sessions were already fully built. So F02–F18 are mostly applying the generalization amendment (removing the hardcoded company name from UI text) and reconciling the five SUPPLEMENT documents — editing existing components, not writing new ones. Only F19 (Quick Entry UI) is a genuine fresh build. `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s RETROFIT STATUS table tells you, per session, whether it's a retrofit or a build and exactly what to apply.

3. **The frontend has its own critical rule** (from `CLAUDE.md`): the browser never talks to the backend directly — every API call goes through the Next.js proxy route that adds authentication. Watch that no frontend session introduces a direct browser-to-FastAPI call.

**The session shape is the same 10-step pattern from Documents 06 and 07.** Retrofit sessions use the retrofit shape (with `/aegis-retrofit-check` on the component being edited); F19 uses the fresh-build shape. This document gives you the structure and the special cases; `FRONTEND_AGENT_SESSION_GUIDE_v2.md` is your per-session source of truth for exactly what each one does.

---

## FIRST — INSTALL FRONTEND DEPENDENCIES

Before any frontend session, install the Node dependencies (once):
```bash
cd ~/projects/aegis-project/frontend
npm install
```
**Why:** The frontend's `package.json` lists React, Next.js, TanStack Query, etc. `npm install` fetches them into `node_modules/`. Without this, nothing compiles.
**Expect:** npm downloads packages; ends with a summary. May show warnings (usually harmless).
**Confirm:**
```bash
npm run build
```
**Expect:** Next.js builds the existing frontend. If the original 18 sessions were sound, this should succeed (possibly with warnings). If it fails, note the errors — some may be the very things the retrofits fix, in which case they'll resolve as you work through the sessions.

---

## THE SESSION FLOW

Work through `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s sessions in order: F01, F02, F03, F04, F05, F05b, F06 … F18, F19. Its RETROFIT STATUS table is your map — for each session it says either "Already built — RETROFIT: apply X" or (for F19) "fresh build."

**For each session, the rhythm is:**

1. **Branch:** `git checkout -b session/frontend-FNN-name`
2. **Session-start:** `claude`, then `/aegis-session-start FNN`
3. **Read** what that session's guide entry lists (the `Documents:` line — foundation refs, the specific FRONTEND_XX doc, any SUPPLEMENT, the generalization amendment).
4. **If retrofit:** `/aegis-retrofit-check <the component file>` before editing.
5. **Apply** exactly what the guide entry's prompt says — usually a specific, small edit (an alt text, a piece of copy, an import path).
6. **Verify:** `npm run build` must succeed with zero type errors. For sessions with visible UI changes, also load the page and look.
7. **Commit + merge** as in Document 06.

---

## SPECIAL CASES TO KNOW ABOUT

**F03 and F18 — the SUPPLEMENT reconciliations.** These sessions apply the SUPPLEMENT documents that the original v1 guide never referenced. F18 in particular attaches SUPPLEMENT_03 and SUPPLEMENT_04, which *supersede* an older "too thin" API-contract document. Follow v2's guide entry exactly — it tells you to use the supplements, not the superseded original.

**F11 — the import-path standardization.** SUPPLEMENT_05's Part 4 establishes `src/components/admin/EmptyState.tsx` as the single canonical location for that component, and fixes any imports pointing at two non-existent paths. Small but real; the guide entry spells it out.

**F19 — the one genuine fresh build.** This builds the entire Quick Entry admin UI (the list, the form, form fields, screenshot upload) plus the employee-side screenshot attribution display, from `FRONTEND_36` through `FRONTEND_40`. Use the fresh-build shape (no retrofit-check). Cross-check against the generalization amendment, since these five newer docs weren't part of the original company-name sweep — the guide entry notes this.

---

## AFTER F19 — CONNECT AND CLICK THROUGH THE WHOLE PRODUCT

The frontend now exists in full. Do a real end-to-end pass against the live backend (not mocked data):
1. `npm run build` — zero type errors.
2. Start the frontend (or rebuild its Docker service) and open it in a browser via the VM's IP.
3. Employee flow: log in, ask a SAP question, confirm a real grounded answer streams back with sources.
4. Admin flow: log in as admin, open the dashboard, the document registry, the health page — confirm they load without 401 errors.
5. Quick Entry flow: create an entry through the new F19 UI, confirm it works against the backend Quick Entry you built in Document 08.

**Why the full click-through:** This is the moment the whole product — backend and frontend — is proven to work together for the first time. Unit-level and build-level checks can't catch integration problems between a working backend and a working frontend; only actually using it can.

---

## GATE — DO NOT PROCEED TO DOCUMENT 10 UNTIL ALL OF THESE ARE TRUE

- [ ] All 20 frontend sessions (F01–F19, incl. F05b) done, verified, committed, merged.
- [ ] `npm run build` succeeds with **zero TypeScript errors**.
- [ ] No frontend code calls the backend directly (all through the proxy route).
- [ ] Employee chat works end-to-end against the real backend in a browser.
- [ ] Admin pages load without 401s.
- [ ] Quick Entry works through its real F19 UI.
- [ ] `docker compose ps` — full stack (including frontend service) healthy.

**This is the third and final milestone-testing checkpoint (full system complete).** Per `TESTING_STRATEGY.md`, run the complete manual checklist here — every page, every feature. This is the last checkpoint before you make it public.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

The entire product works end to end in a browser against the real backend. Everything is built. Move to Document 10 to take it live.
