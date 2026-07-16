# AEGIS Implementation Handbook — Document 07
# Backend Build Sessions — Writing New Code (Sessions 17, 18, 21, 22)

**Prerequisite:** Document 06 complete (all four retrofits done, stack healthy).
**Outcome:** The remaining backend sessions built fresh, verified, and integrated.
**Time:** 4–8 hours total. Session 21 is by far the largest.

---

## HOW A "FRESH BUILD" DIFFERS FROM A RETROFIT

In Document 06 you *edited* existing code. Here you *create* new code from a spec. The good news: fresh builds are lower-risk than retrofits, because there's no existing file that might not match assumptions — you're writing to a blank canvas defined by the spec. The bad news: there's more of it, so the "read the entire spec first" discipline matters even more.

The session shape is almost identical to Document 06's Session 16 walkthrough, with two differences:
- **No retrofit-check step** — there's no existing file to diagnose (except Session 21, which touches some existing files; noted there).
- **You create files rather than modify them**, so the verification focuses on "does the new thing work and integrate," not "did I avoid breaking the old thing."

Because the shape is the same, this document gives Session 17 as a complete worked example, then only the specifics for 18, 21, 22 — refer back to Document 06's 10-step structure for the mechanics of branching, verifying, committing, and merging.

---

# ═══════════════════════════════════════════════════
# THE FULLY-WORKED EXAMPLE: SESSION 17 (Validation Engine)
# ═══════════════════════════════════════════════════

## 17.1 — Start clean and branch
```bash
cd ~/projects/aegis-project
git status                                   # expect: clean
git checkout -b session/build-17-validation
```

## 17.2 — Confirm stack healthy
```bash
docker compose ps
```
**Expect:** all healthy (as left after Document 06).

## 17.3 — Open Claude Code, run session-start
```bash
claude
```
```
/aegis-session-start 17
```

## 17.4 — Tell Claude Code what to read
Session 17's guide entry lists four documents (three foundation + the IMPL). Instruct:

> Read these completely before writing anything:
> - specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md
> - specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md
> - specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md
> - specs/tier2_implementation/IMPL_17_VALIDATION_ENGINE.md
>
> Do not write anything yet. Confirm when you've read all four.

**Why no amendment here:** Session 17 is unusual — it's a fresh build with *no* amendment attached, because its code already delegates correctly to `model_gateway.call_judge()`. Since you did Session 16 first (Document 06), that `call_judge()` already routes to Cerebras/Groq. So Session 17 inherits the new inference automatically, with zero extra work — you just build it exactly as `IMPL_17` specifies. (This is worth understanding: it's why Session 16 had to come before everything, not just before Session 15.)

## 17.5 — Build
> Create backend/app/services/validation_engine.py exactly as specified in IMPL_17_VALIDATION_ENGINE.md. Build what's specified and nothing more. When done, list the file(s) you created.

**Expect:** Claude Code creates `validation_engine.py`.

## 17.6 — Verify against the session's specific checks
Session 17's guide entry names three concrete things to verify:
> Run: python -m pytest tests/unit/test_validation_engine.py -v
> Then confirm: the ensemble weights sum to exactly 1.0; all 7 freshness boundaries are correct; the confidence badge thresholds are 0.85 and 0.70.

**Why these three:** They're the load-bearing correctness properties of a validation engine. Weights not summing to 1.0 would silently skew every confidence score. The freshness boundaries and badge thresholds are exact numbers from the spec — off-by-one here corrupts every answer's trust signal.
**Expect:** The test passes; Claude Code confirms all three numeric properties.

Then run the standard verify command:
```
/aegis-verify
```

## 17.7 — Rebuild and health-check
```bash
docker compose up -d --build aegis-fastapi aegis-arq
docker compose ps
```
**Expect:** healthy.

## 17.8 — Commit and merge
Same as Document 06's steps .9/.10, with a Session 17 message.

**Session 17 done.** 18, 21, 22 follow the same shape — specifics below.

---

# ═══════════════════════════════════════════════════
# SESSION 18 — Ingestion Pipeline (specifics)
# ═══════════════════════════════════════════════════

**Branch:** `git checkout -b session/build-18-ingestion`

**Read (seven documents — this session pulls in two amendments from the start):**
- The three tier1_foundation docs (MASTER_REFERENCE, DATA_CONTRACTS, CONFIGURATION_CONSTANTS)
- specs/tier1_foundation/AEGIS_DOCUMENT_TEMPLATES.md
- specs/tier2_implementation/IMPL_18_INGESTION_PIPELINE.md
- specs/tier1_amendments/AMENDMENT_GENERALIZATION_BACKEND.md
- specs/tier1_amendments/AMENDMENT_OBJECT_STORAGE_MINIO.md

**The build — incorporate two amendments from the start (not as an afterthought):**
1. From AMENDMENT_GENERALIZATION_BACKEND FILE 1/2: use the configurable `ALLOWED_MODULES` sourced from `config.py`, NOT `IMPL_18`'s own hardcoded 7-module set. Also build `docs/DOCUMENT_AUTHORING_TEMPLATE.md` per FILE 7, using the field name `CURRENT_PRODUCTION_VALUES` (not `CURRENT_VALUES_AT_SONA_COMSTAR`).
2. From AMENDMENT_OBJECT_STORAGE_MINIO FILE 4/5: write the original uploaded document to MinIO in Stage 1 (before parsing), and create migration `005_minio_object_keys.sql`.

**Why "from the start":** This is a fresh build, so rather than build IMPL_18's original version then retrofit it, you build the already-amended version directly. Cleaner and avoids a needless intermediate state.

**This is the session that introduces MinIO as a real service.** After building, MinIO becomes active. Confirm it's healthy in `docker compose ps` alongside the others.

**Verify:** `pytest tests/unit/test_ingestion_pipeline.py -v`, plus the MinIO-specific verification steps written in AMENDMENT_OBJECT_STORAGE_MINIO. Run a real ingestion of one test document and confirm it lands in MinIO.

**Migration note:** `005_minio_object_keys.sql` is a new DB migration. Confirm it applies cleanly — if the stack is running, the migration runs on the next `docker compose up` for Postgres, or apply it per IMPL_18's instructions.

---

# ═══════════════════════════════════════════════════
# SESSION 21 — Fix and Integration (specifics) — THE BIG ONE
# ═══════════════════════════════════════════════════

**⚠ This is the largest, most critical single session. Do not skip it, do not rush it. Budget a dedicated block of time.**

**Branch:** `git checkout -b session/build-21-integration`

**Read (six documents):**
- The three tier1_foundation docs
- specs/tier2_implementation/IMPL_21_FIX_SESSION.md
- specs/tier1_amendments/AMENDMENT_OBJECT_STORAGE_MINIO.md
- specs/tier2_implementation/IMPL_20_ADMIN_PORTAL_OBSERVABILITY.md (reference only — for its FILE 7/FILE 8 content, used in Part C)

**What this session does — three distinct parts:**

**Part A — IMPL_21's core:** Fixes 13 confirmed bugs (not 15 — older guidance had the wrong number) and adds 12 configuration constants (not 9 or 11 — the complete list including `MODE_C_MAX_SUBQUERIES=2` is in IMPL_21 itself). For every file IMPL_21 lists, create or replace it with the exact content shown: `postgres_client.py`, `ARQTaskClient` in `redis_client.py`, updated task signatures, the fixed CRAG parser, Qdrant cache cleanup, multi-worker synonym listener, `admin_handler.py`, complete `main.py`, WebSocket auth, HttpOnly cookie auth routes, the API proxy route, updated `auth.ts`, frontend Dockerfile, frontend compose service, fixed `nginx.conf`, `warmup_models.py`, and `seed_test_documents.py`.

**One conflict to resolve during Part A:** IMPL_21 includes a "fixed CRAG parser," but if you already did Session 15's retrofit (you did — Document 06), AMENDMENT_INFERENCE_ARCHITECTURE FILE 7 already superseded that. **Apply whichever is more recent — the amendment's version wins.** Tell Claude Code this explicitly so it doesn't regress Session 15's work.

**Part B — MinIO finishing (from AMENDMENT_OBJECT_STORAGE_MINIO):** Apply FILE 6 (admin document-download endpoint + deletion cleanup) and FILE 8 (add `minio` as the 6th key in `/health`, alongside redis_session, redis_queue, qdrant, opensearch, postgres).

**Part C — Observability (folded from IMPL_20):** IMPL_20's frontend deliverable is skipped, but its backend observability piece has no other home, so it lives here. Build `backend/app/observability.py` exactly as IMPL_20's FILE 7 shows — 13 custom Prometheus metrics (the guide lists all 13 by name; the list is authoritative) plus the `record_pipeline_metrics()` helper, called from `chat_handler.py` at the end of each turn. Build `infrastructure/grafana/dashboards/aegis-main.json` per IMPL_20's FILE 8 (the 8-panel dashboard).

**Verify (three layers):**
- All verifications at the bottom of IMPL_21
- AMENDMENT_OBJECT_STORAGE_MINIO's verification steps
- After a test query, `curl http://localhost:8000/metrics` returns all 13 `aegis_*` metric series, and `/health` shows all 6 keys including `minio`

**Why this session is critical:** It's the integration point where the backend becomes genuinely whole — bug fixes, the full config constant set, MinIO completion, and observability all land here. A skipped or half-done Session 21 leaves the system subtly broken in ways that surface confusingly later. Treat its verification as seriously as Document 05's gate.

**Rebuild:** After this session, rebuild broadly — `docker compose up -d --build` (no service names = rebuild all changed), then a full `docker compose ps` health sweep.

---

# ═══════════════════════════════════════════════════
# SESSION 22 — Final Polish (specifics)
# ═══════════════════════════════════════════════════

**Branch:** `git checkout -b session/build-22-polish`

**Read (four documents):** the three tier1_foundation docs + specs/tier2_implementation/IMPL_22_FINAL_POLISH.md. No amendment applies.

**Three fixes:**
1. Nginx WebSocket route — replace `nginx.conf` entirely with the version shown in IMPL_22.
2. Admin pages — replace all seven admin page files with the corrected versions that use `/api/proxy/` instead of `getAccessToken()`.
3. `tests/conftest.py` — create the shared test configuration file.

**Verify:** all verification steps at the bottom of IMPL_22. Specifically confirm: WebSocket works through Nginx (not just directly), and admin pages load without 401 errors.

**Why this is the last backend session before Quick Entry:** It closes the gaps that make the employee chat and admin portal fully functional end-to-end through the real Nginx edge. After this, the core product works; Quick Entry (Document 08) is additive.

---

## GATE — DO NOT PROCEED TO DOCUMENT 08 UNTIL ALL OF THESE ARE TRUE

- [ ] Sessions 17, 18, 21, 22 each built, verified, committed, merged.
- [ ] MinIO is healthy and a test document round-trips through it (Session 18).
- [ ] `/metrics` returns all 13 `aegis_*` series; `/health` shows all 6 keys (Session 21).
- [ ] WebSocket works through Nginx; admin pages load without 401 (Session 22).
- [ ] Full `pytest tests/unit/ backend/tests/unit/ -v` passes.
- [ ] `docker compose ps` — entire stack healthy.

**This gate marks the backend as functionally complete.** This is one of the three milestone-testing checkpoints from `TESTING_STRATEGY.md` — do a fuller manual click-through here, not just the automated checks.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

The backend is complete: validation, ingestion with MinIO, the big integration session, and final polish all done and verified. Move to Document 08 for Quick Entry.
