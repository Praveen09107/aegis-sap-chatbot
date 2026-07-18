# AEGIS — Inference Provider Model Selection
## Final Decision Record: Model Replacements, Justification, Benchmarks, Fallbacks

**Status:** SUPERSEDED (2026-07-19) for model selection specifically — kept in place as the historical record of the original 2-provider (Cerebras/Groq) decision, not deleted, per this project's standing practice.
**Verified against:** Official Cerebras docs (`inference-docs.cerebras.ai`), official Groq docs (`console.groq.com/docs`), direct live fetch on the date of research
**Supersedes:** All earlier model discussions in this conversation — this is the authoritative, corrected reference *for the 2-provider design this document describes*.

> **This document describes the ORIGINAL, now-superseded 2-provider selection (Cerebras + Groq only).** The system now routes across a 3-5 tier chain per role, spanning Groq, Cloudflare, Cerebras, SambaNova, and (vision only) Google — see:
> - **What the current chains actually are:** `INFERENCE_MODEL_RESEARCH_UPDATE_2026-07-18_v3_FINAL.md` — the final, live-verified model selection, including the real judge-primary/fallback reasoning this document never covered (SambaNova, Cloudflare, and Gemini didn't exist as options when this document was written).
> - **How the system actually routes across them:** `INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md` and `DECISIONS_LOG.md` `DEC-058` — the N-tier `walk_chain()` engine, quota tracking, and health monitoring, all implemented and live-verified.
> - **Section 3.3 below is also stale in a second, independent way**, unrelated to the multi-provider expansion: `GROQ_MODEL_VISION` was found live to be pointing at a model (`meta-llama/llama-4-scout-17b-16e-instruct`) no longer present on Groq's catalog at all — confirmed and fixed in `DEC-058`. The real current vision primary is `qwen/qwen3.6-27b`.
>
> Kept here, unedited below this notice, as the accurate historical record of the reasoning that produced the *original* Cerebras/Groq design — several of its underlying judgments (dual-homing identical weights for zero-drift failover, preferring documented rate limits over marketing claims, checking the exact tab on a multi-tab pricing page) still hold and were directly extended, not reversed, by the later work.

---

## 1. Why This Change Exists

The original AEGIS architecture specified three self-hosted models served via Ollama on local/on-prem hardware:

| Original Role | Original Model | Original Serving |
|---|---|---|
| Main generation | `qwen2.5:32b-instruct-q4_K_M` | Ollama, self-hosted |
| Judge / CRAG / Tier 1 | `qwen2.5:7b-instruct-q4_K_M` | Ollama, self-hosted |
| Vision | `qwen2.5vl:7b-instruct-q4_K_M` | Ollama, self-hosted |

This required a dedicated GPU server, which conflicts with the project's constraints: **zero recurring cost, forever-free, no future GPU upgrade planned.** No free-tier GPU hosting exists that can run a 32B model at acceptable speed (verified earlier: CPU-only free tiers produce 60-150 second response times, which is unacceptable for a portfolio-grade live demo).

**The solution:** replace self-hosted inference with dual-homed, verified free-tier API providers — while keeping every other part of the architecture (retrieval, validation, the 3-tier routing logic in `model_gateway.py`, the circuit breaker pattern) completely unchanged.

---

## 2. Final Model Selection — Replacement Table

| Pipeline Role | Original (Replaced) | **New Primary** | **New Fallback** |
|---|---|---|---|
| **Main Reasoning** (Tier 2/3 — ERROR_RESOLUTION, PROCESS, CONFIG, Mode C) | `qwen2.5:32b-instruct-q4_K_M` (Ollama) | **`gpt-oss-120b` on Cerebras** | **`openai/gpt-oss-120b` on Groq** |
| **Judge / CRAG / Fast Path** (Tier 1 — SIMPLE_FACT) | `qwen2.5:7b-instruct-q4_K_M` (Ollama) | **`llama-3.1-8b-instant` on Groq** | Degrade to gpt-oss-120b pair (shorter completion budget) |
| **Vision** (screenshot field extraction) | `qwen2.5vl:7b-instruct-q4_K_M` (Ollama) | **`meta-llama/llama-4-scout-17b-16e-instruct` on Groq** | **`gemma-4-31b` on Cerebras** |

**Critical architectural note:** for the Main Reasoning role, primary and fallback are the **identical model weights** (`gpt-oss-120b`) hosted on two independent platforms. This is deliberate — a failover that switches to a different model would introduce output drift right when the system is already under stress. Same weights, different host, means the circuit breaker in `model_gateway.py` can fail over transparently with zero behavior change.

---

## 3. Justification — Role by Role

### 3.1 Main Reasoning → `gpt-oss-120b` (Cerebras primary / Groq fallback)

| Criterion | Verdict |
|---|---|
| Status | **Production-grade** on both platforms (not Preview) |
| Architecture | Mixture-of-Experts, 117B total / 5.1B active parameters per token |
| License | Apache 2.0 — fully open, commercial use permitted |
| Reasoning capability | Configurable reasoning effort (low/medium/high), full chain-of-thought, native tool calling |
| Why it beats alternatives | It is the **only model available as identical weights on two independent free platforms**, enabling true dual-homed resilience. `llama-3.3-70b-versatile` was considered but exists only on Groq (no Cerebras equivalent), losing the same-weights failover guarantee |
| Daily budget (primary) | 1,000,000 tokens/day on Cerebras — comfortable headroom for bulk primary traffic at AEGIS's stated usage (10-30 users, irregular/on-demand) |

### 3.2 Judge / CRAG → `llama-3.1-8b-instant` (Groq primary)

| Criterion | Verdict |
|---|---|
| Status | Production |
| Why this role needs a dedicated model | CRAG fires on a meaningful fraction of queries (every Mode C query, plus any query where retrieval confidence is borderline) — this role needs the **highest available request headroom**, not necessarily the largest model, since its output is short and structured |
| Daily request budget | **14,400 requests/day** — by a wide margin the most generous limit found across every platform researched (next best was 1,000 RPD) |
| Why not reuse gpt-oss-120b for this role too | Would consume from the same 5 RPM / 1M TPD Cerebras budget as main-answer generation, creating resource contention between the high-frequency judge calls and the primary answer-generation path |

### 3.3 Vision → `meta-llama/llama-4-scout-17b-16e-instruct` (Groq primary / Cerebras `gemma-4-31b` fallback)

> **Note:** the `meta-llama/` prefix is required by Groq's API — confirmed directly against `console.groq.com/docs/rate-limits`. An earlier version of this document omitted the prefix in its tables (the benchmark script always had it correct); using the unprefixed name will return a 404.

| Criterion | Verdict |
|---|---|
| Status | Preview (on Groq) — flagged, not disqualifying |
| Why Scout over Gemma as primary | 30,000 TPM vs Gemma's 30,000 TPM tied on paper, but Scout's 1,000 RPD vs Gemma's stricter 5 RPM ceiling makes Scout meaningfully more usable for bursty vision requests; Scout also carries no per-request image-count/payload restriction, unlike Gemma's 2-images/4MB cap |
| Multimodal architecture | 109B total / 17B active (MoE), early-fusion native multimodality — text and image handled by the same forward pass, not a bolted-on vision adapter |
| Fallback reasoning | `gemma-4-31b` is a genuinely different provider (Cerebras) and different model family (Google DeepMind vs Meta) — true redundancy if Groq has an outage, despite tighter per-request limits |

---

## 4. Platforms Evaluated and Rejected (For the Record)

| Platform | Why Rejected |
|---|---|
| **Google Gemini** | Official/multiple sources confirm free-tier prompts **"may be used to improve Google's products."** Directly conflicts with AEGIS's no-third-party-data-training design principle. Additionally, Gemini 2.5 Pro (best reasoning tier) was removed from the free tier entirely in April 2026 |
| **Mistral (La Plateforme)** | No longer publishes exact free-tier rate limits; the well-known "free" tier is actually the **consumer chat product** (Le Chat, ~25 messages/day), not a real production API tier |
| **OpenRouter** | Free tier thinner than going direct (20 RPM / 50 RPD unless a one-time paid top-up is made — disqualifying under the zero-required-spend constraint). Free-model catalog **rotates without notice** (confirmed: previously popular free DeepSeek models were removed between 2025 and now) |
| **SambaNova** | Official docs confirm a genuine no-card "Free Tier" exists, but numeric rate limits for it could not be located/verified. Excluded rather than built on unverified numbers |

---

## 5. Benchmark Methodology and Status

A benchmark script (`aegis_inference_benchmark.py`, delivered separately) was built to test the 3 selected models against **AEGIS's actual prompt shapes** rather than generic leaderboard scores:

| Test | What It Measures | Mirrors |
|---|---|---|
| Test 1 — Main Reasoning | Latency + groundedness (does the answer cite the exact T-codes given in context) | `reasoning_service.py`'s 6-section prompt structure |
| Test 2 — Judge/CRAG | Latency + strict format compliance (`SUFFICIENT` / `INSUFFICIENT: <reason>`) | `retrieval_engine.py`'s `_stage6_crag` prompt |
| Test 3 — Vision | Latency + valid JSON field extraction from a sample SAP screenshot | `vision_integration.py`'s expected output contract |

**Honest status:** live numeric benchmark results are **not yet captured** — the script requires API keys (`GROQ_API_KEY`, `CEREBRAS_API_KEY`) which have not been provisioned in this environment. The script is ready to run and should be executed 5-10 times per model before trusting any single latency figure, since free-tier inference speed varies with provider load.

**Directional evidence available in place of live numbers (from official docs):**

| Model | Documented Inference Speed |
|---|---|
| `gpt-oss-120b` on Cerebras | ~3,000+ tokens/second (Cerebras wafer-scale hardware) |
| `gpt-oss-120b` on Groq | ~500 tokens/second (Groq LPU hardware) |
| `llama-3.1-8b-instant` on Groq | Fastest model in Groq's catalog (exact figure not officially published; qualitatively "extremely fast" per docs) |
| `llama-4-scout` on Groq | ~300-500 tokens/second range (consistent with other Groq-hosted models) |

**Action required before production sign-off:** run `aegis_inference_benchmark.py` with real API keys and record actual latency/quality numbers in Section 6 below.

---

## 6. Live Benchmark Results

*(To be filled in after running `aegis_inference_benchmark.py` with real API keys)*

| Model | Role | Avg Latency (5 runs) | Format/Groundedness Pass Rate | Notes |
|---|---|---|---|---|
| Cerebras `gpt-oss-120b` | Main | — | — | |
| Groq `gpt-oss-120b` | Main (fallback) | — | — | |
| Groq `llama-3.1-8b-instant` | Judge/CRAG | — | — | |
| Groq `llama-4-scout` | Vision | — | — | |
| Cerebras `gemma-4-31b` | Vision (fallback) | — | — | |

---

## 7. Rate Limit Reference (Re-Verified Twice via Direct Official Fetch)

| Model | Provider | RPM | RPD | TPM | TPD |
|---|---|---|---|---|---|
| `gpt-oss-120b` | Cerebras | **5** | — | 30,000 | 1,000,000 |
| `openai/gpt-oss-120b` | Groq | 30 | 1,000 | 8,000 | 200,000 |
| `llama-3.1-8b-instant` | Groq | 30 | **14,400** | 6,000 | 500,000 |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Groq | 30 | 1,000 | 30,000 | 500,000 |
| `gemma-4-31b` | Cerebras | **5** | — | 30,000 | 1,000,000 (2 images/req, 4MB limit — Free Trial tier only) |

> **Confirmed via direct fetch of `inference-docs.cerebras.ai/support/rate-limits`:** the tier is literally labeled `<Tab title="Free Trial">` in the page source — not "Free Tier." No evidence of an expiration date or lifetime cap was found. The Gemma-4-31b image limit of 2/4MB is specific to this Free Trial tab; the Developer (Pay-as-you-go) tab on the same page shows a higher 5 images/10MB limit for paid usage — these are easy to conflate if reading a secondary source instead of the tabbed original.

## 7a. Verification Addendum — Second-Pass Audit Results

This document was independently audited after initial publication. The audit correctly identified one real bug and incorrectly disputed two facts that were already accurate. Documented here for transparency:

| Claim Audited | Audit's Verdict | Re-Verification (direct official fetch) | Outcome |
|---|---|---|---|
| Groq model ID for vision lacked `meta-llama/` prefix | ❌ Bug — would cause 404 | Confirmed via `console.groq.com/docs/rate-limits`: prefix is required | **Fixed** — corrected throughout this document |
| Missing TPD figures for 3 Groq models | ❌ Incomplete data | Confirmed exact figures: 200K / 500K / 500K | **Fixed** — added to table above |
| "Free Trial" naming claim | ❌ "Could not verify anywhere" | Re-fetched the exact page — `<Tab title="Free Trial">` appears in raw source | **Audit was incorrect** — original claim stands |
| Gemma-4-31b image limits (2 images/4MB) | ❌ "Actual is 5 images/10MB" | Re-fetched the exact page — 2/4MB is the Free Trial tab; 5/10MB is the separate Developer (paid) tab | **Audit conflated two different pricing tiers** — original claim stands |

**Lesson applied:** even a careful-sounding audit citing "official docs" can misattribute which tier a number belongs to on a multi-tab page. Both disputed points were re-settled by fetching the exact page a second time and reading the specific tab, not by trusting either the original research or the audit at face value.

---

## 8. Implementation Notes for `model_gateway.py`

- The existing 3-tier `select_model_tier()` logic requires **no structural changes** — only the target endpoint/model-name constants change per tier
- The existing circuit breaker (`ollama_main` ↔ `ollama_judge` fallback pattern) is repurposed: `cerebras_gpt_oss_120b` ↔ `groq_gpt_oss_120b` for the main tier
- Vision routing in `vision_integration.py` changes its single endpoint from the local Ollama vision container to Groq's `llama-4-scout`, with Cerebras `gemma-4-31b` added as a new fallback path (this is new logic, since the original architecture had no vision fallback)
- All model names, endpoints, and API keys should be environment-configurable (`.env`), consistent with the project's existing configuration pattern — no hardcoded model strings in application code

---

*This document is the authoritative model-selection reference. Any future change to model selection should update this file directly rather than being decided ad hoc in implementation.*
