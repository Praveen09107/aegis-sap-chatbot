# AEGIS Inference Benchmark Results — 2026-07-19

Real, unmocked latency and format-compliance data for every tier of every inference role in `INFERENCE_CHAINS` (`backend/app/config_inference_chains.py`), produced by the rewritten `scripts/aegis_inference_benchmark.py` — closes `OPEN-05`. Every call in this report is a real HTTP request to the real provider, made with `model_gateway._dispatch_tier_nonstreaming()`, the exact same dispatch function `walk_chain()` uses in production. Nothing here is mocked, estimated from documentation, or extrapolated.

**Methodology note — rate limits are reported with their evidence, not asserted as fact.** A separate probe step fired one minimal-token real call per provider first and captured the complete raw response header set, specifically because this project already flags SambaNova's real limit as unconfirmed (`OPEN-06`) and the existing pacing numbers in `circuit_breaker.py`'s comments had never been independently checked against a live response before this pass.

---

## Rate-limit evidence, per provider (Step 0 probe)

| Provider | Evidence found | Real per-minute ceiling | Status |
|---|---|---|---|
| **Groq** | `x-ratelimit-limit-requests: 1000` / `14400` (judge), `x-ratelimit-remaining-*`, `x-ratelimit-reset-*` — full real headers on every call | Generous, request-scoped (14,400/day confirmed for `llama-3.1-8b-instant`, matching `DEC-020`) | **CONFIRMED (live header)** |
| **Cerebras** | `x-ratelimit-limit-requests-minute: 5` — present verbatim in the real response | **5 RPM, exactly** | **CONFIRMED (live header)** — directly reconfirms `DEC-019`'s figure with fresh evidence, not just trusted from provider docs |
| **Cloudflare** | No rate-limit headers on a 200 response (`headers={}`) | Not RPM-bound in this evidence; real constraint is its account-wide neuron/cost budget (`quota_kind: "neuron_pool"`) | Consistent with the existing architecture's own design assumption — no per-minute ceiling to confirm the same way |
| **SambaNova** | No rate-limit headers on a 200 response (`headers={}`), for both `main` and `judge` tiers | **Not established by this probe** — a single 200 doesn't reveal a ceiling the way a 429 or an explicit header would | **UNCONFIRMED — `OPEN-06` stays open.** The existing "20 RPM" figure in `circuit_breaker.py`'s override comment remains an assumption, not evidence. This benchmark paced SambaNova conservatively (~6 RPM, 10s spacing) rather than trusting that number. |
| **Gemini** | Not re-triggered in this probe (got a 200) — but a real 429 during `DEC-058`'s own build already captured `{"quotaValue": "5"}` directly from Gemini's error body (`providers_gemini.py::parse_quota_value`, confirmed live at that time) | **5 RPM** | **CONFIRMED (live evidence, captured in an earlier session)** — cited here rather than re-induced, to avoid spending quota deliberately triggering a 429 |

---

## Latency and format compliance (Step 1 — 3 real repetitions per tier)

### Main reasoning (4 tiers)

| Tier | Provider | Model | Min | Avg | Max | Success | Format OK |
|---|---|---|---|---|---|---|---|
| 1 | Groq | `openai/gpt-oss-120b` | 1.29s | 1.35s | 1.42s | 3/3 | 3/3 |
| 2 | Cloudflare | `@cf/openai/gpt-oss-120b` | 6.87s | 7.11s | 7.41s | 3/3 | 3/3 |
| 3 | Cerebras | `gpt-oss-120b` | **0.65s** | **0.71s** | 0.79s | 3/3 | 3/3 |
| 4 | SambaNova | `gpt-oss-120b` | 1.39s | 2.57s | 4.79s | 3/3 | 3/3 |

Every tier produced a correct, grounded answer (cited the exact T-codes given in the prompt) on all 3 reps. Cerebras is fastest by a wide margin despite being tier 3 — worth knowing, though tier order stays fixed for the zero-drift-on-failover reason `DEC-019` already established (identical weights across tiers), not latency ranking.

### Judge / CRAG (4 tiers)

| Tier | Provider | Model | Min | Avg | Max | Success | Format OK |
|---|---|---|---|---|---|---|---|
| 1 | Groq | `llama-3.1-8b-instant` | **0.19s** | **0.28s** | 0.38s | 3/3 | 3/3 |
| 2 | Groq | `openai/gpt-oss-20b` | 0.43s | 0.53s | 0.63s | 3/3 | **0/3** |
| 3 | Cloudflare | `@cf/openai/gpt-oss-120b` | 1.48s | 1.69s | 1.93s | 3/3 | 3/3 |
| 4 | SambaNova | `Meta-Llama-3.3-70B-Instruct` | 0.98s | 1.24s | 1.51s | 3/3 | 3/3 |

**Real finding — judge fallback tier 2 (`openai/gpt-oss-20b`) returns genuinely empty content at the real production token budget.** All 3 reps returned `""` at `max_tokens=64` (this benchmark's judge role uses the same value as `CRAG_MAX_TOKENS` in `config.py`) — reproducible, re-confirmed with a dedicated follow-up test: `max_tokens=64 → ''`, `max_tokens=150 → 'SUFFICIENT'`, `max_tokens=300 → 'SUFFICIENT'`. `gpt-oss-20b` is a reasoning-style model that appears to spend its entire 64-token budget on internal reasoning before ever emitting the visible verdict.

**This is not a crash and does not need an urgent fix** — traced through `retrieval_engine.py::_stage6_crag` (lines 564-592): an empty `model_response` hits neither the `INSUFFICIENT` nor `SUFFICIENT` substring checks, falls through the sentiment-keyword-counting branch (0 positive, 0 negative signals in an empty string), and lands on the existing `logger.warning(...)` + `return "SUFFICIENT", None` default — exactly the safe, already-designed "CRAG failure defaults to SUFFICIENT" behavior. **But it is a real, disclosed reliability characteristic worth knowing:** if judge tier 1 (`llama-3.1-8b-instant`) ever exhausts its daily quota and CRAG falls to tier 2, that call effectively contributes no real judgment — it silently defaults to SUFFICIENT every time, rather than genuinely evaluating sufficiency, until the chain either recovers tier 1 or falls further to tier 3. Not fixed in this pass — flagged for whoever next reviews judge-chain reliability. A larger `CRAG_MAX_TOKENS` would likely resolve it (150 tokens worked cleanly) but changing that budget is a deliberate architectural value (CLAUDE.md: "CRAG's token budget is never silently widened to JUDGE_MAX_TOKENS — they're intentionally different") and outside this benchmark's scope to alter unilaterally.

### Vision (5 tiers)

| Tier | Provider | Model | Min | Avg | Max | Success | Format OK |
|---|---|---|---|---|---|---|---|
| 1 | Groq | `qwen/qwen3.6-27b` | 1.33s | 1.36s | 1.39s | 2/3 | 0/3* |
| 2 | Cloudflare | `@cf/meta/llama-4-scout-17b-16e-instruct` | 2.29s | 4.04s | 6.90s | 3/3 | 3/3 |
| 3 | Cloudflare | `@cf/google/gemma-4-26b-a4b-it` | 6.28s | 10.58s | 13.06s | 3/3 | 3/3 |
| 4 | Cerebras | `gemma-4-31b` | **0.50s** | **0.81s** | 1.17s | 3/3 | 3/3 |
| 5 | Gemini | `gemini-3.5-flash` | 1.74s | 1.87s | 2.12s | 3/3 | 3/3 |

**Two real findings on the vision primary tier (Groq `qwen/qwen3.6-27b`):**

1. **Rep 3 hit a genuine live `429 Too Many Requests`** after 2 back-to-back successes at this benchmark's 2.5s spacing — real evidence that Groq's vision endpoint has a tighter effective throughput ceiling than its main-reasoning endpoint, even though both return the same `x-ratelimit-limit-requests: 1000` header shape on individual calls. Worth pacing vision-role Groq calls more conservatively than main/judge in any future benchmark run.
2. **`*` Reps 1-2 were flagged `format_bad` by this script's original, less permissive JSON checker** — the model prefixed its answer with a `<think>...</think>` reasoning block before the actual JSON (a real, observed behavior of this model, not a script bug in the sense of mishandling something production doesn't also see). The real production parser, `app/clients/ollama_vision.py::_parse_extraction_response`, already handles this correctly (`find("{")` / `rfind("}")` rather than requiring the whole response to be JSON) — `DEC-059`'s own live vision test, run through that real parser, confirmed flawless extraction. **This benchmark's checker has been corrected in `scripts/aegis_inference_benchmark.py` to match** (mirrors the same substring-extraction approach), so future runs of this script will report Groq vision's true format compliance rather than an artificially low number. Not re-run against the fixed checker in this pass, to avoid spending additional real quota on a finding already independently confirmed correct by `DEC-059`.

Cloudflare's second vision tier (`gemma-4-26b-a4b-it`) is meaningfully the slowest real path measured in this whole benchmark (up to 13s) — still well within `EXTERNAL_INFERENCE_TIMEOUT_SECONDS=30`, but worth knowing if it's ever reached in production (only happens if both Groq and the first Cloudflare vision tier are unavailable).

---

## Summary

- **13 of 13 tier/role combinations are live and reachable** with the current real keys.
- **Fastest per role:** Cerebras (main, 0.71s avg), Groq (judge, 0.28s avg), Cerebras (vision, 0.81s avg) — all three fastest paths are sub-second.
- **One real reliability finding, safely degrading:** judge tier 2 (`gpt-oss-20b`) is effectively non-functional at the real `CRAG_MAX_TOKENS` budget (returns empty, defaults safely to SUFFICIENT rather than crashing).
- **One real script bug, now fixed:** this benchmark's own vision format-checker under-reported Groq vision's real compliance; production's actual parser already handles the observed `<think>`-prefixed responses correctly.
- **Rate-limit evidence is now honestly labeled per provider** — Cerebras and Gemini's ~5 RPM figures are now independently confirmed via live evidence (not just trusted docs/comments); SambaNova's real limit remains genuinely unconfirmed, and `OPEN-06` stays open on that basis rather than being closed on an assumption.

Raw per-call data: `run_results.json`/`probe_results.json` (captured during this pass, not committed to the repo — regenerate by re-running `scripts/aegis_inference_benchmark.py` if needed).
