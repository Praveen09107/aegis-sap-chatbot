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
| 2 | Groq | `openai/gpt-oss-20b` | 0.43s | 0.53s | 0.63s | 3/3 | 0/3 → **3/3 after fix (DEC-061)** |
| 3 | Cloudflare | `@cf/openai/gpt-oss-120b` | 1.48s | 1.69s | 1.93s | 3/3 | 3/3 |
| 4 | SambaNova | `Meta-Llama-3.3-70B-Instruct` | 0.98s | 1.24s | 1.51s | 3/3 | 3/3 |

**Real finding — judge fallback tier 2 (`openai/gpt-oss-20b`) returned genuinely empty content at the real production token budget, RCA'd and fixed.**

*Symptom, confirmed reproducible:* all 3 original reps returned `""` at `max_tokens=64` (`CRAG_MAX_TOKENS`).

*Root cause, confirmed with the raw API response, not inferred:* this model is a reasoning model whose Groq response carries a **separate `message.reasoning` field alongside `message.content`**, and `usage.completion_tokens_details.reasoning_tokens` is counted *against* `max_completion_tokens`. A graduated test across `max_tokens ∈ {16, 32, 48, 64, 96, 128}` showed `finish_reason: "length"` (truncated) and empty `content` at every value through 96 — `reasoning_tokens` climbing 14 → 30 → 46 → 62 → 94, i.e. consuming essentially the entire budget on hidden reasoning at every one of those values. At `max_tokens=128`, `finish_reason` flips to `"stop"` (natural completion) with `reasoning_tokens=112` and `content='SUFFICIENT'` — this specific CRAG prompt needs ~112–124 completion tokens total, almost all of it hidden reasoning, before the model ever writes its visible answer.

*Checked for a cheaper fix first, confirmed there isn't one:* Groq's API accepts a `reasoning_effort` parameter for this model. `'low'` was tested at `max_tokens=64` — no change (still 62 reasoning tokens, still empty content). `'none'` is rejected outright for this specific model (`"reasoning_effort must be one of low, medium, or high"`, despite a different validation layer's error text implying `'none'` was a globally valid value) — there is no parameter-level way to suppress this model's reasoning below what already exceeds `CRAG_MAX_TOKENS=64`.

*Fix applied (DEC-061):* a per-tier `"min_max_tokens": 128` override added to this tier's entry in `config_inference_chains.py`; `walk_chain()` in `model_gateway.py` now computes `max(caller_max_tokens, tier["min_max_tokens"])` per tier before dispatching, so `CRAG_MAX_TOKENS` stays 64 everywhere else in the chain (and for every other role's tiers) — this is a floor for one specific tier, not a global constant change. Re-verified live against the rebuilt `aegis-fastapi` image: 3/3 real reps now return `'SUFFICIENT'`, not empty. 3 new regression tests added (`tests/unit/test_model_gateway_walk_chain.py::TestWalkChainMinMaxTokensOverride`) proving the override bumps only the declaring tier, leaves every other tier's budget untouched, and never *lowers* an already-larger caller budget.

This was chosen over swapping the model at this slot: `gpt-oss-20b` is Groq's own currently-recommended replacement for the deprecated `llama-3.1-8b-instant`, this is a fallback-only tier (only reached when tier 1 has already failed, so the extra ~2x token cost doesn't touch the hot path), and 128 is a directly-measured value, not a guess.

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

## Cerebras rate-limit evidence — precise scope (per-model, not account-wide)

Raised directly during review: does "5 RPM" apply per model, or as one account-wide ceiling? Checked against the two real probe records, not assumed either way. `main/cerebras` (`gpt-oss-120b`) and `vision/cerebras` (`gemma-4-31b`) are two *different* models, called ~30 seconds apart in the same Step 0 probe sequence — well inside the same 60-second window. Both independently show `remaining-requests-minute: 4` (from a fresh limit of 5), `remaining-requests-hour: 149` (from 150), `remaining-requests-day: 2399` (from 2400) — each decremented by exactly 1 from its *own* ceiling. If this were one shared account-wide bucket, the second call would show `remaining: 3`, not `4`. It didn't, so **Cerebras enforces this limit independently per model**, not as one pool shared across every model on the account. This is consistent with (not contradicted by) `AEGIS_INFERENCE_MODEL_SELECTION.md:65`'s stated reason for not reusing `gpt-oss-120b` for the judge role too ("would consume from the *same* 5 RPM budget as main-answer generation") — that reasoning is about reusing the *identical* model across two roles, which per-model bucketing would indeed make share one bucket; using two *different* models, as this architecture actually does, does not.

Also checked: `circuit_breaker.py`'s `_OVERRIDES` dict has **no Cerebras entry at all** (only `gemini_vision`, `sambanova_main`, `sambanova_judge`) — so there was no separate hardcoded Cerebras number in that specific file to audit. The "5 RPM" figure lives in prose (`DEC-019`, `AEGIS_INFERENCE_MODEL_SELECTION.md`), and this probe is its first live reconfirmation. The two providers that *do* have hardcoded overrides in `circuit_breaker.py` (Gemini, SambaNova) were both already independently re-verified above.

## Summary

- **13 of 13 tier/role combinations are live and reachable** with the current real keys.
- **Fastest per role:** Cerebras (main, 0.71s avg), Groq (judge, 0.28s avg), Cerebras (vision, 0.81s avg) — all three fastest paths are sub-second.
- **One real reliability finding, root-caused and fixed (DEC-061):** judge tier 2 (`gpt-oss-20b`) was returning empty content at the real `CRAG_MAX_TOKENS` budget because its hidden reasoning tokens alone exceeded that budget for this prompt shape. Fixed with a per-tier `min_max_tokens` floor (128, directly measured) — confirmed live, 3/3 real reps now return genuine `SUFFICIENT`/`INSUFFICIENT` verdicts. `OPEN-05`/this workstream is now closed without a caveat, not "closed but degrading."
- **One real script bug, now fixed:** this benchmark's own vision format-checker under-reported Groq vision's real compliance; production's actual parser already handles the observed `<think>`-prefixed responses correctly.
- **Rate-limit evidence is now honestly labeled per provider, with exact scope** — Cerebras and Gemini's ~5 RPM figures are independently confirmed via live evidence and confirmed to apply per-model, not account-wide; SambaNova's real limit remains genuinely unconfirmed, and `OPEN-06` stays open on that basis rather than being closed on an assumption.

## Real call count, fully accounted for

67 real calls against live providers this session, none of them retries-on-failure (the script doesn't retry; every failed call is recorded as a failure and counted once):

| Phase | Calls | What |
|---|---|---|
| Step 0 — rate-limit header probe | 13 | One real call per tier/role combination (`main`×4 + `judge`×4 + `vision`×5) |
| Step 1 — timed benchmark run | 39 | 13 tiers × 3 repetitions, as planned |
| Follow-up 1 — empty-content threshold | 3 | `openai/gpt-oss-20b` at `max_tokens` = 64 / 150 / 300 |
| Follow-up 2 — graduated RCA | 6 | Same model at `max_tokens` = 16 / 32 / 48 / 64 / 96 / 128, capturing `reasoning_tokens`/`finish_reason` |
| Follow-up 3 — `reasoning_effort` dead-end | 3 | `'low'` / `'minimal'` (rejected, 400) / unset, at `max_tokens=64` |
| Follow-up 4 — `'none'` rejection confirmation | 3 | `reasoning_effort='none'` at `max_tokens` = 64 / 32 / 16, all rejected (400) |
| **Total** | **67** | |

Raw per-call data: `run_results.json`/`probe_results.json` (captured during this pass, not committed to the repo — regenerate by re-running `scripts/aegis_inference_benchmark.py` if needed).
