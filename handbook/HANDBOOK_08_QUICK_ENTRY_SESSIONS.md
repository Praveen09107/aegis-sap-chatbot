# AEGIS Implementation Handbook — Document 08
# Quick Entry Sessions — Sessions 23–29

**Prerequisite:** Document 07 complete (backend functionally complete, stack healthy).
**Outcome:** The Quick Entry feature (admin-authored knowledge entries with screenshots) built and verified.
**Time:** 4–6 hours across seven sessions.

---

## WHAT QUICK ENTRY IS, AND WHY IT'S LOWER-RISK

Quick Entry lets an IT admin quickly author a knowledge entry (an error guide, procedure, or config note) through a form, optionally attaching SAP screenshots that get analyzed by the vision pipeline. It's *additive* — it builds on the stable core you finished in Document 07 without modifying the employee chat or retrieval paths, except at two specific points flagged below. That makes it lower-risk than the Document 07 work: fewer ways for a mistake to ripple into the core system.

**These seven sessions follow the exact same shape as Document 07's fresh-build pattern.** Rather than repeat the 10-step mechanics seven more times, this document gives you the per-session specifics and flags only the two sessions with special considerations. For the mechanics (branch, read, build, verify, rebuild, commit, merge), refer to Document 07's Session 17 walkthrough.

---

## THE SEVEN SESSIONS — DO THEM IN ORDER 23 → 29

Each builds on the previous, so numeric order is also dependency order here (unlike the retrofits).

### Session 23 — Quick Entry Overview and Architecture
- **Branch:** `session/build-23-qe-overview`
- **Read:** the three tier1_foundation docs + `IMPL_23_QUICK_ENTRY_OVERVIEW.md`
- **Note:** This is largely architectural/scaffolding — it establishes the structure the next six sessions fill in. Read it especially carefully, because it frames everything that follows.

### Session 24 — Quick Entry Data Model (FRESH BUILD, +amendment)
- **Branch:** `session/build-24-qe-datamodel`
- **Read:** three foundation docs + `IMPL_24_QUICK_ENTRY_DATA_MODEL.md` + `AMENDMENT_GENERALIZATION_BACKEND.md`
- **Special consideration:** This session pulls in the generalization amendment. Apply its relevant FILE (the guide entry / amendment header names which) so the data model uses configurable values, not hardcoded company specifics — same principle as Session 18.

### Session 25 — Quick Entry API Endpoints
- **Branch:** `session/build-25-qe-api`
- **Read:** three foundation docs + `IMPL_25_QUICK_ENTRY_API_ENDPOINTS.md`
- Standard fresh build.

### Session 26 — Quick Entry Processing Pipeline
- **Branch:** `session/build-26-qe-processing`
- **Read:** three foundation docs + `IMPL_26_QUICK_ENTRY_PROCESSING_PIPELINE.md`
- Standard fresh build.

### Session 27 — Quick Entry Chunking Engine
- **Branch:** `session/build-27-qe-chunking`
- **Read:** three foundation docs + `IMPL_27_QUICK_ENTRY_CHUNKING_ENGINE.md`
- **Watch for one core invariant:** the `config_values` chunk is never split (this is one of the never-break rules in `CLAUDE.md`). If Quick Entry's chunking touches config-type content, confirm this rule holds.

### Session 28 — Quick Entry Screenshot Pipeline (FRESH BUILD, +two amendments) ⚠ SPECIAL
- **Branch:** `session/build-28-qe-screenshot`
- **Read:** three foundation docs + `IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md` + `AMENDMENT_OBJECT_STORAGE_MINIO.md` + `AMENDMENT_INFERENCE_ARCHITECTURE.md`
- **This is the special one. Two critical points:**
  1. **Reuse the existing vision client — do NOT build a new one.** IMPL_28's original spec text describes building a separate vision client hardcoding `llava:13b`. Do not do that. The real, already-retrofitted `classify_sap()` and `extract_sap_content()` functions in `backend/app/clients/ollama_vision.py` (which you retrofitted in Session 13) already do exactly what Quick Entry needs, already routing to Cerebras/Groq. Instruct Claude Code to *import and call those*, not duplicate them. AMENDMENT_INFERENCE_ARCHITECTURE's FILE 8 spells this out.
  2. **MinIO storage for screenshots:** apply the relevant AMENDMENT_OBJECT_STORAGE_MINIO FILE for Quick Entry's own screenshot storage (its `knowledge_form_screenshots` table). Do NOT call the employee-chat `store_diagnostic_object()` function — that's for the live chat flow, a different path.
- **Why this session gets extra care:** it's the one place Quick Entry touches the vision and storage subsystems, which were themselves recently reworked. Getting the "reuse, don't duplicate" right here avoids reintroducing a model inconsistency that was deliberately eliminated.

### Session 29 — Quick Entry Operational Systems
- **Branch:** `session/build-29-qe-operational`
- **Read:** three foundation docs + `IMPL_29_QUICK_ENTRY_OPERATIONAL_SYSTEMS.md`
- Standard fresh build. This closes out Quick Entry with its operational pieces (lifecycle, cleanup jobs, etc.).

---

## AFTER SESSION 29 — TEST THE FEATURE END TO END

Unit tests passing isn't enough for a user-facing feature. Do one real end-to-end pass:
1. Through the admin interface (or its API), create a Quick Entry — a simple error guide.
2. Attach a test SAP screenshot; confirm it gets analyzed and stored in MinIO.
3. Confirm the entry gets chunked and indexed so it's retrievable.
4. As an employee, ask a question that entry answers; confirm it comes back with the entry as a source.

**Why:** Quick Entry spans seven sessions and multiple subsystems (API, processing, chunking, vision, storage, retrieval). Only an end-to-end test proves they connect. This is the Document 08 equivalent of a milestone check.

---

## GATE — DO NOT PROCEED TO DOCUMENT 09 UNTIL ALL OF THESE ARE TRUE

- [ ] Sessions 23–29 each built, verified, committed, merged, in order.
- [ ] Session 28 reuses the existing vision client (no duplicate `llava:13b` client exists anywhere).
- [ ] A real Quick Entry round-trips: create → screenshot to MinIO → chunk → retrievable → answers an employee query.
- [ ] Full `pytest` passes.
- [ ] `docker compose ps` — stack healthy.

**This is the second of the three milestone-testing checkpoints (backend fully complete, now including Quick Entry).** Per `TESTING_STRATEGY.md`, do the fuller manual checklist here.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

Quick Entry works end to end and the backend is now truly complete. Move to Document 09 for the frontend.
