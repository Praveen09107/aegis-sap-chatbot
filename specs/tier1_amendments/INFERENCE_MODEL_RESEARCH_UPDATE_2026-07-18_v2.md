# AEGIS — Inference Model Research Update v2 (2026-07-18)
## Live verification of your proposed 3-role, multi-fallback chain, against your real API keys

**Status: PROPOSAL — not yet adopted.** Same status as `INFERENCE_MODEL_RESEARCH_UPDATE_2026-07-18.md` (the earlier pass this one supersedes for anything they disagree on). Nothing here is implemented; nothing here is logged as a `DEC-XXX` decision. That happens only when you decide to adopt it.

**What's different about this pass:** the previous document was based on web research alone. This one is based on **live API calls made with your real Groq, Cerebras, SambaNova, and Cloudflare keys**, run in this session. Every model-availability and rate-limit claim below is either something I directly observed from a real response, or explicitly marked as not directly observed. Several things web research got wrong or missed are corrected here against the live evidence.

**On the keys themselves, said once and not belabored further:** they were pasted in plaintext into this chat. They were used here only in-memory, in direct API calls, and never written to any file in this repository or anywhere else. That doesn't undo the fact that they now exist in this conversation's history — I'd rotate all four after you're done reviewing this.

---

## 1. Your reasoning for 3-4 deep fallback chains — yes, it's justifiable

You asked directly whether the reasoning holds. It does, for exactly the two failure modes you named, and they're genuinely different failure modes that a simple 2-tier primary/fallback doesn't fully cover:

1. **Transient unavailability** — a provider is slow, erroring, or rate-limiting a single burst of traffic. A 2-tier failover already handles this if the fallback is on a different platform.
2. **Daily budget exhaustion under real multi-user load** — this is the one a 2-tier design handles badly. If your primary and fallback are both rate-limited *per day*, and both get exhausted by the same traffic pattern (likely, since they're serving the same role), you have nothing left. A 3-4 deep chain across independently-billed platforms means each platform's daily budget is a separate pool — exhausting Groq's daily quota doesn't touch Cerebras's, which doesn't touch Cloudflare's.

Using **identical model weights** across every link in the chain (not a capability downgrade at each step) is the correct way to do this — it's a direct extension of the exact principle this project already established for the main-reasoning role (`DEC-019`'s reasoning for dual-homing `gpt-oss-120b`), just carried to more than two platforms. The one thing this reasoning doesn't yet cover, which is worth naming explicitly: **the current `model_gateway.py` circuit breaker is built for a 2-tier primary/fallback, not an N-deep chain.** Implementing what you're describing is a real, separate architecture change to that file — not something this research document does, and not something to silently fold into a model-selection decision. Flagging it here so it doesn't get lost.

---

## 2. What the live calls found — corrections to the previous research pass

### Groq — your account's real, current model catalog

```
$ GET https://api.groq.com/openai/v1/models
```

Confirmed live: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b`, `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `qwen/qwen3.6-27b`, plus Whisper and a couple of small guard/moderation models.

**Correction to my previous research: Llama 4 Scout and Llama 4 Maverick are gone from Groq's live catalog.** Both still have documentation pages on `console.groq.com`, which is what my earlier web research found and reported as current — but neither appears in the real `/v1/models` response for this account. My previous recommendation to use Llama 4 Maverick as the primary vision model on Groq is **withdrawn** — it does not appear to be servable there anymore. This is exactly the kind of thing a docs page can lag behind reality on, and it's why this pass checked the live endpoint instead of trusting the docs page a second time.

**`qwen/qwen3.6-27b` is real, and it's a strong pick — better than what I'd recommended.** This model was released after my training data and didn't surface in my first research pass's searches (which were tuned toward "Qwen3-VL" naming). It is:
- **Dense, not MoE — 27B parameters.** The only dense model in serious contention across this whole research process.
- Apache 2.0, natively multimodal (text, image, video), 262K context.
- Benchmarks found: MMMU 82.9, GPQA Diamond 87.8, SWE-bench Verified 77.2 — reported to beat the previous-generation 397B MoE flagship on coding despite being 1/15th the size.
- **Live-tested in this session, twice**, after two of my own base64-encoding mistakes were caught and fixed (details below) — it correctly identified a solid blue test image as "Blue" on the second, properly-encoded attempt.
- It is a **visible-reasoning ("thinking") model** — it produces a `<think>...</think>` reasoning trace before its final answer, confirmed directly in the raw response. This has a real implication for AEGIS specifically: `classify_sap()`/`extract_sap_content()` expect fast, structured extraction, not a long reasoning trace. Worth checking whether the prompt needs an explicit "answer directly, no reasoning" instruction, and budgeting more `max_tokens` than a non-reasoning model would need for the same output — the test above needed 300 tokens to get past reasoning to a one-word answer at `max_tokens=20`.

**Real, live rate-limit headers observed** (per-model, this account, right now):

| Model | Requests | Tokens |
|---|---|---|
| `openai/gpt-oss-120b` | 1,000/day | 8,000/min |
| `openai/gpt-oss-20b` | 1,000/day | 8,000/min |
| `qwen/qwen3.6-27b` | 1,000/day | 8,000/min |
| `llama-3.1-8b-instant` | **14,400/day** | 6,000/min |

This is the concrete number that resolves your judge-model question — see §4.

### Cerebras — confirmed exactly 3 models, real limits pulled

```
$ GET https://api.cerebras.ai/v1/models
```

Confirmed: `gpt-oss-120b`, `gemma-4-31b`, `zai-glm-4.7` — nothing else, matching what the previous research pass found from Cerebras's docs page. No Qwen, no Llama 4, no DeepSeek on this account's public tier.

**Real, live rate-limit headers for `gpt-oss-120b`:** 5 req/min, 150 req/hour, **2,400 req/day**, 30,000 tokens/min, 1,000,000 tokens/hour and /day. This is a materially higher daily *request* ceiling than Groq's 1,000/day for the same model — worth knowing when deciding chain order (§4).

**`gemma-4-31b` vision confirmed working live** — correctly identified a test image. Still **Preview** status, same disclosed risk as before; nothing here changes that.

### SambaNova — real access is broader than the documented free-tier list, with one open question

```
$ GET https://api.sambanova.ai/v1/models
```

Confirmed live and callable on this account, all four tested successfully: `gpt-oss-120b`, `DeepSeek-V3.1`, `DeepSeek-V3.2`, `Meta-Llama-3.3-70B-Instruct`, `MiniMax-M2.7`, **`gemma-4-31B-it`**.

**This corrects what I told you in the previous message.** I had reported, based on SambaNova's own rate-limits documentation page, that their genuine no-card free tier has exactly 3 models and no vision capability at all. That was wrong, or at least incomplete — `gemma-4-31B-it` is live, callable, and **correctly performed a vision task** on this account right now (tested directly, correct answer returned).

**The open question I can't resolve from the API alone:** SambaNova runs two separate things — a genuinely permanent, no-card free tier (documented at 20 RPM / 20 RPD / 200,000 TPD, listing only 3 models), and a separate **$5 promotional credit that expires in 30-90 days** depending on the source. The account behind this key may currently be spending down that promotional credit rather than using the permanent free tier's model list — the API has no way for me to tell the difference from outside. **Before relying on `gemma-4-31B-it`, `DeepSeek-V3.2`, or `MiniMax-M2.7` on SambaNova long-term, check your SambaNova dashboard's billing/plan page directly** and confirm whether these models remain reachable once any promotional credit is gone. `gpt-oss-120b` and the documented `Meta-Llama-3.3-70B-Instruct`/`DeepSeek-V3.1` are safe to treat as the permanent-tier baseline; the rest need that one manual check before being trusted as a durable fallback.

Also worth noting for completeness: SambaNova does not expose rate-limit headers on responses the way Groq and Cerebras do, so the 20 RPD figure above is from their docs, not independently re-confirmed live in this session.

### Cloudflare Workers AI — confirmed working, including vision, after fixing my own mistakes

```
$ GET https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/models/search
```

Confirmed present in the full 274-model catalog: `@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b`, `@cf/meta/llama-4-scout-17b-16e-instruct` (explicitly tagged `vision: true`).

**`@cf/openai/gpt-oss-120b` tested live and works** — real response returned, and the response header reported `cf-ai-neurons: 0.00` for that call, confirming genuine zero marginal cost for a small request against the free daily Neuron allowance.

**`@cf/meta/llama-4-scout-17b-16e-instruct` vision initially failed twice, on both of Cloudflare's API shapes** — I concluded, incorrectly at first, that vision was broken on this model/platform. It was my own error: the base64 test image I'd hand-typed into the request was malformed. Generating a real image programmatically and retrying fixed it immediately — the model correctly identified a solid blue test image as "Blue." **Confirmed working, vision included, on this platform.** This is disclosed in full because it's exactly the kind of "verify, don't assume, and when your first check contradicts expectation, check your own check before concluding the platform is broken" moment this project's stated culture is built around — I got it wrong once in this same research session and want that visible, not quietly cleaned up.

One structural note that matters for chain design: Cloudflare's free allowance is **10,000 Neurons/day shared across your entire account**, not per-model like Groq/Cerebras. If this account calls both the main-reasoning fallback and the vision fallback on Cloudflare, they draw from the same daily pool — worth factoring in if Cloudflare ends up serving more than one role's fallback chain simultaneously.

**One unrelated, minor finding:** the Cloudflare API token you provided fails `/user/tokens/verify` ("Invalid API Token") but succeeds on every Workers AI call made in this session. This is very likely a scoped token (permissioned for Workers AI specifically, not the general account-token-verification endpoint) rather than a broken key — nothing to fix, just don't be alarmed if you check the token status yourself and see that same verify failure.

---

## 3. Your proposed main-model chain — endorsed, with one ordering change to consider

**Your proposal:** Groq → Cloudflare → Cerebras → SambaNova, all `gpt-oss-120b`.

**Verdict: the design is right — identical weights across four independent platforms is genuinely the strongest redundancy structure found anywhere in this research, for any role.** All four confirmed live and working with your actual keys. I have no better model to suggest for this role; nothing else combines this level of proven capability with this much free, stable, cross-platform availability (see the first research document's §3 for why Kimi K2.6, Qwen3-235B, and GLM-5.x all fail the "stable recurring free" bar despite being arguably more capable on paper).

**The one thing worth reconsidering is the order, based on the real numbers just pulled:**

| Rank in your proposal | Platform | Real daily request budget (gpt-oss-120b) |
|---|---|---|
| 1 (primary) | Groq | 1,000/day |
| 3 (2nd fallback) | Cerebras | **2,400/day** |
| 2 (1st fallback) | Cloudflare | governed by shared 10,000 Neuron/day pool, not a clean per-model number |
| 4 (3rd fallback) | SambaNova | 20/day |

Cerebras has more than double Groq's daily request ceiling for this exact model. Putting Groq first isn't wrong, but if the goal is to survive the heaviest possible day with the fewest fallback switches, **Cerebras primary / Groq first fallback** would burn through less of the smaller-budget platform before falling back, and would only need to fall back once (to Groq) before the load has to be genuinely severe to reach Cloudflare or SambaNova. Either order is defensible — this is a real trade-off (Groq's LPU hardware is faster per-request; Cerebras has more daily headroom), not a correction, and I'd rather hand you the real numbers than pick for you.

SambaNova stays last regardless of order — 20 requests/day makes it a genuine last-resort/emergency layer only, not a normal-operation fallback.

---

## 4. Judge model — resolved with real numbers, not opinion

You said you couldn't decide between `llama-3.1-8b-instant` and `openai/gpt-oss-20b` as primary. The live rate-limit headers make this a clean call:

| Model | Real daily requests (this account) | Capability |
|---|---|---|
| `llama-3.1-8b-instant` | **14,400/day** | Good, not exceptional |
| `openai/gpt-oss-20b` | 1,000/day (same tight budget as your main model) | Reported to match/exceed OpenAI's `o3-mini` on most evals — a real step up |

**The judge/CRAG role's defining requirement is request volume, not raw capability** — this was already established reasoning in this project's existing architecture (`DEC-020`: CRAG fires on nearly every query, far more often than main-answer generation, and its output is short and structured). `gpt-oss-20b` sharing the exact same 1,000/day ceiling as your primary main-reasoning model on Groq means using it as judge-primary would put your two highest-frequency-adjacent roles competing for the same small budget on the same platform.

**Recommendation: keep `llama-3.1-8b-instant` as primary** — its 14.4x larger daily allowance is the deciding factor for a role that fires this often — **with `openai/gpt-oss-20b` as first fallback**, giving you a genuine capability upgrade for whenever `llama-3.1-8b-instant`'s (much larger, but not infinite) budget is exhausted, or for judge calls where the extra capability specifically matters. Your proposed second fallback (`@cf/openai/gpt-oss-120b` on Cloudflare) is a reasonable third layer — it's a bigger model than the role strictly needs, but that's a fine trade to make only once the first two options are both exhausted, and it reuses a model you're already running elsewhere in the chain rather than introducing a fifth distinct weight set to maintain.

**Final judge chain: `llama-3.1-8b-instant` (Groq) → `openai/gpt-oss-20b` (Groq) → `@cf/openai/gpt-oss-120b` (Cloudflare).**

One honest gap, same as the previous research pass: this chain's first two links are both on Groq. A single Groq outage (not just a rate-limit exhaustion) takes out both, and only the third link is on a different platform. If true platform-level outage resilience matters more than the volume/capability trade-off above, a cross-platform second link would be worth finding — nothing at equal capability and equal daily volume to `llama-3.1-8b-instant` turned up on another platform in this research.

---

## 5. Vision model — your chain is genuinely stronger than my previous recommendation

**Your proposal:** Groq (`qwen3.6-27b`) → Cloudflare (`llama-4-scout`) → SambaNova (`gemma-4-31B-it`).

**Verdict: this is a better chain than the one I recommended last message, and I'm updating my recommendation to match yours on the primary.** `qwen3.6-27b`'s MMMU score (82.9) beats Llama 4 Maverick's (≈73.4, the model I'd previously recommended as primary) — and Maverick, per §2, doesn't even appear to be servable on Groq anymore. Your pick is both more capable and more current than mine was.

All three links in your chain were tested live in this session and work, vision included (after the two base64 mistakes on my end noted in §2 were fixed). One structural refinement worth considering, given what §2 found:

**Consider adding Cerebras's `gemma-4-31b` as a fourth link, ahead of or alongside the SambaNova one**, since it's the same model already confirmed working there — and unlike SambaNova's `gemma-4-31B-it` (whose long-term free-tier status has the open question flagged in §2), Cerebras's copy is on their documented public endpoint list, just Preview status rather than Production. This would give the vision chain the same four-platform depth as your main-model chain, using only two distinct model weights (`qwen3.6-27b`, `gemma-4-31b`) across four platforms instead of three:

**Suggested vision chain: `qwen/qwen3.6-27b` (Groq) → `@cf/meta/llama-4-scout-17b-16e-instruct` (Cloudflare) → `gemma-4-31b` (Cerebras) → `gemma-4-31B-it` (SambaNova, pending the billing check in §2).**

---

## 6. Summary table

| Role | Primary | Fallback 1 | Fallback 2 | Fallback 3 |
|---|---|---|---|---|
| Main reasoning | `gpt-oss-120b` — Cerebras *or* Groq (your call, §3) | `gpt-oss-120b` — Groq *or* Cerebras | `@cf/openai/gpt-oss-120b` — Cloudflare | `gpt-oss-120b` — SambaNova (emergency-only, 20 req/day) |
| Judge | `llama-3.1-8b-instant` — Groq | llama-3.1-8b-instant` — Groq | `@cf/openai/gpt-oss-120b` — Cloudflare | — |
| Vision | `qwen/qwen3.6-27b` — Groq | `@cf/meta/llama-4-scout-17b-16e-instruct` — Cloudflare | `gemma-4-31b` — Cerebras (Preview) | `gemma-4-31B-it` — SambaNova (verify billing first) |

## 7. Before implementing any of this

1. **Rotate all four API keys.** They were pasted in plaintext into this conversation.
2. **Check the SambaNova billing/plan dashboard** to confirm whether `gemma-4-31B-it`, `DeepSeek-V3.2`, and `MiniMax-M2.7` survive past any promotional credit, or drop back to the documented 3-model permanent free list.
3. **`model_gateway.py`'s circuit breaker currently supports a 2-tier primary/fallback, not an N-deep chain.** Building genuine 3-4 deep failover per role, as this whole document assumes, is a real, separate implementation task — not something decided or built here.
4. **Re-check every rate limit live at implementation time**, the same standing instruction the original `AMENDMENT_INFERENCE_ARCHITECTURE.md` already carries — this research pass alone found Groq's Llama 4 listing gone and Cloudflare's vision behavior initially (wrongly) suspected broken, both within the same session. This landscape moves fast enough that "verified today" has a short shelf life.

---

*Sources: live API calls made in this session against `api.groq.com`, `api.cerebras.ai`, `api.sambanova.ai`, and `api.cloudflare.com` using the developer's own keys, plus targeted web research for `qwen3.6-27b`, `MiniMax-M2.7`, and `DeepSeek-V3.2` (all released after this assistant's training data cutoff). Supersedes `INFERENCE_MODEL_RESEARCH_UPDATE_2026-07-18.md` for the vision-role primary specifically; that document's main-reasoning and judge-role analysis still stands and is refined, not contradicted, here.*
