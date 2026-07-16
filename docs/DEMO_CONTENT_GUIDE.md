# AEGIS — Demo Content Guide
## The Synthetic SAP Document Corpus for the Public Deployment
## Place in: docs/DEMO_CONTENT_GUIDE.md (project root)

---

## WHY SYNTHETIC CONTENT, NOT REAL SONA COMSTAR DOCUMENTS

Brief summary — full reasoning in `DECISIONS_LOG.md` DEC-016: the live, public deployment uses fictional SAP-style documents, not the real Sona Comstar business documents from the internship phase, since publishing another company's actual internal business documents on a public, recruiter- and client-facing demo is a distinct concern from whatever the code-ownership situation turns out to be (DEC-001).

---

## WHAT THE CORPUS NEEDS TO CONTAIN

Every document follows the structure in `docs/DOCUMENT_AUTHORING_TEMPLATE.md` (the generalized version of `AEGIS_DOCUMENT_TEMPLATES.md`, per `DECISIONS_LOG.md` DEC-036) — the `CAUSE_N` pattern for error guides, the standard section separators, and `CURRENT_PRODUCTION_VALUES` (not the frozen original's `CURRENT_VALUES_AT_SONA_COMSTAR`) for config documents.

### Coverage target

Span the default `ALLOWED_MODULES` set (`FI, MM, SD, HR, PP, CO, BASIS` — per `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 1) with at least a few documents per module, across all three document types:

| Document type | Suggested count | Example topics |
|---|---|---|
| Error guides (`{MODULE}-ERR-NNN`) | 15-20 | Delivery blocking (SD), goods receipt failures (MM), posting period errors (FI), missing cost center (CO) |
| Procedures (`{MODULE}-PROC-NNN`) | 10-15 | Creating a purchase order, running MRP, releasing a blocked sales order, month-end closing steps |
| Config snapshots (`{MODULE}-CFG-NNN`) | 5-10 | Tax code configuration, plant/storage location setup, pricing procedure configuration |

This is enough breadth to make the semantic cache and retrieval pipeline demonstrate real behavior (hybrid search across genuinely different topics, RRF fusion mattering, CRAG firing on genuinely ambiguous queries) without requiring an unrealistic volume of content for a portfolio deployment.

### A fictional company identity, used consistently

Pick one fictional company name and industry (distinct from any real company) and use it consistently across every generated document and in `AEGIS_COMPANY_NAME`/`AEGIS_COMPANY_INDUSTRY` — this is what the system prompt (`AMENDMENT_GENERALIZATION_BACKEND.md` FILE 3) and every UI branding touchpoint (`AMENDMENT_GENERALIZATION_FRONTEND.md`) will surface to a visitor.

---

## GENERATING THE CONTENT

Claude Code (or Claude directly) is well-suited to generating realistic synthetic SAP documentation, given the template structure — provide it `docs/DOCUMENT_AUTHORING_TEMPLATE.md` and ask for documents following the exact structure, with realistic but fictional T-codes, error codes, and resolution steps. Cross-reference real SAP transaction code conventions (VL01N, MIGO, MB1C, ME21N, etc. are genuine, widely-documented SAP T-codes, not company-specific — reusing them in fictional scenarios is accurate, not a privacy concern, since they're standard SAP terminology confirmed generic in `DECISIONS_LOG.md` DEC-004).

**Do not reuse any specific error scenario, procedure wording, or configuration value from the real uploaded Sona Comstar documents**, even reworded — generate genuinely new fictional scenarios rather than lightly disguising real ones, consistent with the actual intent behind DEC-016.

---

## LOADING THE CORPUS

Once `IMPL_18` (ingestion pipeline) is built, load each document through the real ingestion pipeline (not a direct database insert) — this exercises the actual chunking, embedding, and dual-vector-space logic the pipeline is built around, and confirms MinIO persistence (`AMENDMENT_OBJECT_STORAGE_MINIO.md`) works end-to-end with real content, not just test fixtures.

```bash
# Once the admin portal is live, use its document upload feature, or:
python scripts/seed_test_documents.py --source docs/demo-corpus/
```

(Adjust the script invocation to match however `IMPL_21`'s `seed_test_documents.py` is actually parameterized once built.)

---

## PRE-WARMING THE SEMANTIC CACHE

For the best first-impression experience, pre-run the 15-20 questions a visitor is most likely to ask (e.g., "Why is my delivery blocked?", "How do I create a purchase order?") once after loading the corpus, so the semantic cache (`SEMANTIC_CACHE_THRESHOLD=0.88`) already has entries for common questions before a real visitor arrives. A first-time visitor asking a common question then gets a near-instant, cached response rather than the full 5-9 second grounded-generation path — both are legitimate, real system behavior, but the cached path makes a stronger first impression for a casual visitor clicking around.

```bash
python scripts/warmup_cache.py --questions docs/demo-warmup-questions.txt
```

(This script does not yet exist in the current spec set — write it as a small, one-off utility script when this stage is reached, not as part of any formal `IMPL_XX` session.)

---

## KEEPING THE CORPUS UP TO DATE

If the demo deployment runs for an extended period, periodically review the corpus for staleness per the existing freshness-scoring design (`IMPL_17`'s validation engine already penalizes documents past certain age thresholds) — a demo where every document shows a stale-content warning badge undermines the "production-grade" impression as much as a broken feature would.

---

*Related: `DECISIONS_LOG.md` DEC-001, DEC-004, DEC-016, DEC-036.*
