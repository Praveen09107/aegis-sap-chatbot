# AEGIS — Inference Model Research Update (2026-07-18)
## A researched candidate revision to `AEGIS_INFERENCE_MODEL_SELECTION.md`

**Status: PROPOSAL — not yet adopted.** This document is deep research performed on request, not a decision. It does not supersede `AEGIS_INFERENCE_MODEL_SELECTION.md` (the current, in-force selection) until the developer reviews it and explicitly decides to adopt some or all of it, at which point it should be logged as a new `DEC-XXX` entry in `DECISIONS_LOG.md` and the model-selection doc updated in place — neither has been done here.

**Research method:** live web search performed in this session (not recalled from training data, which predates most of the providers/models below), cross-checked against each provider's own official documentation page where possible, with corrections noted explicitly where a secondary source (blog, aggregator) turned out to be wrong against the primary source.

---

## 1. The four hard requirements this research was scoped against

1. **Strictly recurring, zero-cost, "forever" access** — not a one-time credit grant, not a time-limited trial.
2. **Highest proven capability first; parameter count is a tie-breaker only**, not the primary criterion. Dense parameter counts and total/active MoE (Mixture-of-Experts) parameter counts are reported separately and never conflated.
3. **A model tailored to this architecture's actual needs** — SAP-domain instruction following and structured/JSON output for reasoning and judge roles; real screenshot/document field extraction for vision — not a generic "biggest number" pick.
4. **Two options per role — a primary and a fallback — for all three roles** (main reasoning, judge, vision), with the fallback close in capability to the primary, not a steep downgrade. Identical model weights hosted on two independent platforms is the ideal (zero behavioral drift on failover, the pattern this project already established for the main-reasoning role) — used wherever it genuinely exists at production-usable rate limits, and **not claimed where it doesn't**, even though that was the original hope going into this research.

**Explicit honesty requirement carried through this entire document, per direct instruction:** no provider found anywhere in this research legally guarantees "forever free" in their terms of service. Every option below is a *recurring, no-expiration-date, no-credit-card* free tier that has been stable for a meaningful period — but every provider's own terms reserve the right to change or discontinue it. Where a document elsewhere in this project says "forever free," read that as shorthand for this same qualified meaning, not a literal guarantee. This document flags, per model, whether it is on a **Production**-labeled endpoint (provider treats it as stable) or a **Preview**-labeled endpoint (provider explicitly reserves the right to pull it on short notice) wherever that distinction is published.

---

## 2. Provider-by-provider free-tier audit (2026-07-18)

This is the actual state of every free API tier checked, including the ones that turned out not to qualify. Several confirm findings already in `DECISIONS_LOG.md`; several are new since that log was last updated on this topic.

| Provider | Real, current free tier | Qualifies as "recurring, production-viable, zero-cost"? |
|---|---|---|
| **Groq** | No credit card, no credits system — a genuine rate-limited free tier across its entire model catalog. Typical limits ~30 RPM / 6,000 TPM / 1,000 RPD per model, with some models (e.g. Llama 4 Maverick) at a reduced quota and others (`llama-3.1-8b-instant`-class) far higher. | **Yes.** Confirmed against Groq's own docs. Best combination of breadth, stability, and real daily volume found in this research. |
| **Cerebras** | No credit card, 1,000,000 tokens/day. **But the public, per-token (free-tier-eligible) catalog is now only 3 models**, confirmed directly against Cerebras's own model-catalog page: `gpt-oss-120b` (Production), `gemma-4-31b` (Preview), `zai-glm-4.7` (Preview, **scheduled for deprecation 2026-08-17**). Everything else this project might want (Llama 4, Qwen3, DeepSeek, Kimi K2.x) has moved to **Dedicated Endpoints — paid, reserved-capacity only**, not free. | **Yes, but narrower than before.** Only usable for the 3 models above; do not assume any other model is free here without checking the live catalog page first. |
| **SambaNova Cloud** | Genuinely free, no-card tier confirmed directly against SambaNova's own rate-limits doc. Real limits: **20 RPM / 20 RPD / 200,000 TPD, per model.** Free models: `DeepSeek-V3.1`, `Meta-Llama-3.3-70B-Instruct`, `gpt-oss-120b`. **No vision-capable model on the genuine free tier** — an earlier secondary source claimed Llama 4 Maverick vision was free here; checked directly against SambaNova's own docs and this is false, that requires their separate paid Developer tier. | **No, for production use at this project's volume.** 20 requests/day is not viable for a judge role that fires on most queries, or even for a low-traffic fallback. Confirmed capability is real (DeepSeek-V3.1 is a strong model) but the request ceiling disqualifies it here. Worth knowing about as an emergency last-resort layer only. |
| **Google AI Studio (Gemini)** | Genuine no-card, non-expiring free tier — but as of April 2026, Pro-tier models moved to paid-only; free tier is now Flash/Flash-Lite class only. | **Disqualified on this project's own already-established grounds (`DEC-022`), not on stability.** Google's terms allow free-tier prompts to be used to improve Google's products — this was already the specific, deliberate reason Gemini was rejected during the original model selection, and nothing found in this research changes that. Not recommended below. |
| **OpenRouter** | 28+ models at `:free`, no card. Real caps: 20 RPM always; 50 requests/day with zero spend, or 1,000/day after a one-time $10 top-up. The free-model *lineup itself rotates* — models are added and pulled without notice; Meta's Llama 4 Scout/Maverick free listings, for example, existed earlier and are confirmed gone as of this research. | **No, as a primary or sole fallback.** This is the same reasoning `DEC-022` already used to reject OpenRouter as a default choice ("catalog rotates without notice") — this research reconfirms that risk is still live and current, now with a concrete example (Llama 4's free listing being pulled). Useful for occasional testing against high-capability models (Kimi K2.6, Qwen3-235B) that have no other free path, not for a production role. |
| **Mistral (La Plateforme)** | A genuine free "Experiment" tier exists (~1B tokens/month), but Mistral's own documentation explicitly states it is "for evaluation, not production" and no longer publishes exact numeric limits. | **No.** Confirms the original `DEC-022` rejection still holds. |
| **NVIDIA NIM / Build** | 1,000 inference credits on signup, up to 5,000 total via a manual forum request. This is a **one-time credit grant**, not a recurring tier — credits do not refill. | **No.** Fails requirement 1 outright regardless of how capable the hosted models are (and the catalog is impressive — DeepSeek, Llama, Qwen, Nemotron). |
| **Z.ai (BigModel) direct** | `GLM-4.7-Flash` is listed as a genuinely free tier on Z.ai's own pricing page. Real limit found: **~1 request/second**, and the platform requires **real-name identity verification** to activate the free tier. | **Technically yes, practically constrained.** The rate limit itself (~86,400 req/day theoretical ceiling at 1 RPS sustained) is not the blocker — the real-name verification requirement is a genuine practical and legal friction point for a non-Chinese-resident developer running a portfolio project, and is disclosed here rather than glossed over. Not recommended as a primary dependency for that reason; noted as a real, capable option if that friction is acceptable. |
| **Cloudflare Workers AI** | Genuine no-card recurring tier: 10,000 "Neurons" (Cloudflare's own compute-unit metric, not tokens) per day, 50+ models including Llama, Mistral, Gemma, DeepSeek, Qwen variants. | **Marginally, for smaller models only.** Neuron-based billing makes real request volume hard to predict in advance, and nothing in the 400B+/1T-class capability tier was confirmed hosted here. Not used in the final recommendation below, noted for completeness. |
| **GitHub Models** | Free for any GitHub account, no card — but explicitly scoped by GitHub itself as "for prototyping and experimentation." Real limits found: ~50 requests/day (10 RPM) for higher-tier models, 150/day for smaller ones. | **No, for production volume** — disqualified by GitHub's own stated intent and the tight daily ceiling, despite hosting an interesting catalog (GPT-4.1, o3, o4-mini, Llama 4, DeepSeek). |

---

## 3. Capability landscape — what's actually strongest right now, independent of whether it's freely available

This section answers "what is the best model" on its own, before the free-tier filter is applied — so the trade-off in §4 is visible rather than hidden.

| Model | Architecture (dense or MoE total/active) | License | Where it stands, per current benchmarks |
|---|---|---|---|
| **Kimi K2.6** (Moonshot AI) | MoE — **1T total / 32B active** | Open-weight | Highest Artificial Analysis Intelligence Index of any open-weight model found (54); beats several closed frontier models (GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro) on SWE-Bench Pro. The single most capable model surfaced in this entire research pass. |
| **GLM-5.2 / GLM-5** (Z.ai) | MoE, large (exact public breakdown not confirmed in this pass) | Open-weight | Leads several open-weight coding/agentic benchmarks; no genuine free API tier found anywhere for the full model (see §2). |
| **Qwen3-235B-A22B** | MoE — **235B total / 22B active** | Tongyi license (open-weight, not Apache 2.0) | Reported as topping the open-source leaderboard for general reasoning + coding by one tracker; free only via OpenRouter's volatile `:free` tier. |
| **DeepSeek-V3.1** | MoE — **671B total / ~37B active** | Open-weight | Strong general + deep-reasoning model; the highest-capability model confirmed on a genuinely free (if request-limited) tier in this research, via SambaNova. |
| **Llama 4 Maverick** | MoE — **400B total / 17B active**, natively multimodal | Open-weight (Llama license) | Strongest vision capability found with real free access — MMMU ≈73.4%. Free on Groq. |
| **gpt-oss-120b** | MoE — **117B total / 5.1B active** | Apache 2.0 | Production-status (not Preview) on more independent free platforms than any other model checked (Groq, Cerebras, and SambaNova all host it free) — MMLU 90%, GPQA 93.1%, IFEval 88.7%. |
| **gpt-oss-20b** | MoE — **20B total / 3.6B active** | Apache 2.0 | Same family as gpt-oss-120b; reported to match or exceed OpenAI's `o3-mini` on most evals despite its size. Free, Production-status, on Groq. |
| **GLM-4.7-Flash** | MoE — **31B total / 3B active** | Open-weight | Best-in-class among ~30B models on SWE-bench (59.2%) and tool-use (79.5%, matching Claude 3.5 Sonnet). Free on Z.ai direct, with the real-name-verification friction noted in §2. |
| **Llama-3.3-70B-Instruct** | **Dense — 70B** (not MoE) | Open-weight (Llama license) | The only large *dense* model in this table — included specifically to give a genuine dense-vs-MoE comparison point, since every other strong option here is MoE. Free on Groq and SambaNova. |

**The honest trade-off this table makes visible:** the single most capable open-weight model overall (Kimi K2.6) and the current benchmark leaders in coding/agentic tasks (GLM-5.x, Qwen3-235B) do **not** have a stable, production-viable, recurring-free host anywhere this research found. Every path to them (OpenRouter's volatile free list, Cerebras's paid-only Dedicated Endpoints, no free tier at all) fails requirement 1. This is stated plainly rather than fudged — see §5 for what that means for the final recommendation.

---

## 4. Recommendation — primary and fallback, per role

### 4.1 Main reasoning — **no change recommended**

| | Model | Platform | Status | Params |
|---|---|---|---|---|
| Primary | `gpt-oss-120b` | Cerebras | Production | MoE, 117B total / 5.1B active |
| Fallback | `gpt-oss-120b` (identical weights) | Groq | Production | same |

This researched every plausible alternative and could not find a materially more capable model with equally stable, equally redundant free access. `gpt-oss-120b` is now confirmed free on a **third** independent platform (SambaNova) beyond the existing two, which is worth knowing about as an emergency third layer even though its 20 RPD ceiling makes it unsuitable as a primary or standard fallback. Qwen3-235B-A22B and Kimi K2.6 both plausibly out-benchmark `gpt-oss-120b` on paper, but neither clears requirement 1 at production volume (§2, §3). **Recommendation: keep the current choice — it remains the best available option that satisfies all four requirements simultaneously, not just the capability one.**

### 4.2 Judge / CRAG / fast-path — **upgrade recommended**

| | Model | Platform | Status | Params |
|---|---|---|---|---|
| Primary (new) | `gpt-oss-20b` | Groq | Production | MoE, 20B total / 3.6B active |
| Fallback | `gpt-oss-120b` pair (Groq/Cerebras), reduced token budget | — | — | same as §4.1 |

**Why the change:** `gpt-oss-20b` is a genuine, same-family, Production-status upgrade over the current `llama-3.1-8b-instant` — reported to match or beat OpenAI's `o3-mini` on most evals, still fast and cheap enough for a high-frequency role, and free on Groq today. It shares Apache 2.0 licensing and output conventions with the main-reasoning model, which is a better architectural fit for a judge that has to parse the main model's own output structure.

**Where this honestly falls short of requirement 4:** no second independent platform was found hosting `gpt-oss-20b` free (Cerebras's public catalog is confirmed limited to exactly 3 models, none of which is `gpt-oss-20b`). A true identical-weights, cross-platform pair does not currently exist for this role at production volume — this was the original hope going into this research and it did not hold up under verification. The fallback recommended above is therefore the same one already established in the current architecture (degrade to the main-reasoning pair with a shorter completion budget) rather than a new cross-provider judge-specific pair, because no better option cleared the bar. This is disclosed rather than papered over. **Exact live rate limits for `gpt-oss-20b` on Groq should be confirmed against `console.groq.com/docs/rate-limits` before this is implemented** — this research found the model listed and priced but did not extract a fully confirmed RPM/RPD figure specific to it (values were extrapolated from the closely-related `gpt-oss-120b` entry, and rate limits are exactly the kind of thing this project's own discipline says must be checked live, not assumed).

### 4.3 Vision — **primary upgrade recommended, fallback unchanged**

| | Model | Platform | Status | Params |
|---|---|---|---|---|
| Primary (new) | `meta-llama/llama-4-maverick-17b-128e-instruct` | Groq | Production | MoE, 400B total / 17B active, natively multimodal |
| Secondary (same provider) | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq | Production | MoE, 109B total / 17B active, natively multimodal |
| Fallback (cross-provider) | `gemma-4-31b` | Cerebras | **Preview** | Dense, 31B, multimodal |

**Why the primary change:** Maverick is the more capable of the two Llama 4 vision models (MMMU ≈73.4% vs Scout's lower published figure), confirmed free on Groq today, at a real but tighter quota (≈15 RPM / 3,000 TPM / 500 RPD vs Scout's fuller quota) — worth the trade for a screenshot-classification/extraction task that is not this project's highest-QPS path.

**Where this also falls short of the original hope:** this research initially found a secondary-source claim that Llama 4 Maverick was free with vision on SambaNova too — which would have given a genuine cross-provider, identical-weights vision pair. **Checked directly against SambaNova's own rate-limits documentation and found false** — SambaNova's real no-card free tier has no vision-capable model at all. This is flagged explicitly because it's exactly the kind of claim that looked right in a summary and wasn't, and this project's own standing discipline is to verify primary sources before acting on a claim like that.

The existing cross-provider fallback (`gemma-4-31b` on Cerebras) is **kept, not replaced** — it remains on Cerebras's public free endpoint today, confirmed directly against Cerebras's own model catalog page. Its **Preview** status is real and already disclosed in this project's existing documentation (`DEC-021`, `docs/TROUBLESHOOTING_RUNBOOK.md`) — nothing in this research changes that risk, it's carried forward as-is. Adding Scout as a same-provider secondary (Groq → Groq) gives a cheaper, higher-quota intermediate step before falling all the way to the cross-provider Preview-status model.

---

## 5. Summary — what changes, what doesn't, and what's still owed

| Role | Current | Researched recommendation | Verdict |
|---|---|---|---|
| Main reasoning | `gpt-oss-120b`, Cerebras/Groq | Same | **No change — already the best option found** |
| Judge | `llama-3.1-8b-instant`, Groq | `gpt-oss-20b`, Groq | **Upgrade primary; fallback stays the existing gpt-oss-120b degrade path, honestly, not a new cross-provider pair** |
| Vision | Scout (Groq) / `gemma-4-31b` (Cerebras) | Maverick primary / Scout secondary (both Groq) / `gemma-4-31b` (Cerebras) unchanged | **Upgrade primary capability; keep the existing, already-disclosed cross-provider fallback** |

**What this research could not deliver, stated plainly rather than quietly dropped:** a true, identical-weights, production-volume-viable, two-independent-platform pair for the judge role, and a genuine second free vision-capable *provider* beyond Cerebras's existing Preview-status option. Both were actively searched for — including one lead (SambaNova + Llama 4 Maverick vision) that looked promising and was disproven against the primary source. If either matters enough to keep searching, the two most likely places a future check could turn up something new are: (a) whichever model Cerebras designates as `zai-glm-4.7`'s replacement after its 2026-08-17 deprecation, not yet announced anywhere checked in this pass, and (b) whether SambaNova's paid Developer tier's low $5 entry cost is ever revisited as an acceptable exception to the zero-cost rule for vision specifically, given it does host real multimodal Llama 4 there.

**Before implementing anything above:** re-confirm every exact rate-limit number live against each provider's own docs at implementation time, not from this document — free-tier terms in this landscape have been shown, in this same research pass, to change without notice (Cerebras's catalog shrinking from ~12 models to 3, OpenRouter pulling Llama 4's free listing). This matches the existing standing instruction already in `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s own verification sections.

---

*Sources consulted (web search + direct doc fetch, 2026-07-18): `console.groq.com/docs/models`, `console.groq.com/docs/rate-limits`, `inference-docs.cerebras.ai/models/overview`, `inference-docs.cerebras.ai/support/rate-limits`, `docs.sambanova.ai/docs/en/models/rate-limits`, `cerebras.ai/pricing`, `docs.z.ai`, `openrouter.ai/models` and provider pages, plus independent benchmark/pricing aggregators cross-checked against the above wherever a claim wasn't independently verifiable — each such secondary-sourced claim is marked as such above rather than presented as directly confirmed.*
