# AEGIS — Inference Model Selection: Final Validation (2026-07-18)
## Your chosen chain, checked against every model in it live, plus one deeper capability sweep

**Status: PROPOSAL, validated — still not adopted until you say so.** This is the third and final pass in this research thread. It validates the exact chain you specified in your last message, corrects one apparent copy-paste error, checked one platform (Cloudflare) more exhaustively than before at your request for "100% ensure," and reports one significant new finding that was deliberately *not* folded into the recommended chain — with the reasoning for that shown, not just the conclusion.

---

## Verdict, up front

**Your chain works. All 11 model/platform combinations in it were called live, right now, in this session, and all 11 responded correctly.** One item needs your confirmation (the judge fallback-1 line), and one open question from the previous document remains open (SambaNova billing) because it genuinely cannot be resolved from the API. Full detail below.

---

## 1. The judge-model line that needs your confirmation

You wrote:

> judge model: primary - `llama-3.1-8b-instant` — Groq, first fallback (**not purely fallback, also must be used if higher logic, heavy task which needs bigger model**) use - `llama-3.1-8b-instant` — Groq, second fallback - `@cf/openai/gpt-oss-120b` — Cloudflare

The parenthetical describes a **bigger, more capable model** used for harder judge calls — but the model named is `llama-3.1-8b-instant` again, identical to the primary. A model can't be its own "bigger" upgrade. This reads like a copy-paste artifact rather than an intentional choice, and it exactly matches what I recommended in the previous document: **`openai/gpt-oss-20b` on Groq** as the capability-upgrade fallback. I've treated it as that below and verified `gpt-oss-20b` live. If you actually did mean to repeat `llama-3.1-8b-instant` deliberately (e.g., as a same-model retry before escalating to Cloudflare), let me know and I'll re-validate against that instead — but the parenthetical's own wording strongly suggests `gpt-oss-20b` was intended.

---

## 2. Final live verification — all 11 combinations, run fresh in this session

| Role | Slot | Model | Platform | Result |
|---|---|---|---|---|
| Main | Primary | `gpt-oss-120b` | Groq | **PASS** |
| Main | Fallback 1 | `@cf/openai/gpt-oss-120b` | Cloudflare | **PASS** |
| Main | Fallback 2 | `gpt-oss-120b` | Cerebras | **PASS** |
| Main | Fallback 3 | `gpt-oss-120b` | SambaNova | **PASS** |
| Judge | Primary | `llama-3.1-8b-instant` | Groq | **PASS** |
| Judge | Fallback 1 (corrected) | `openai/gpt-oss-20b` | Groq | **PASS** |
| Judge | Fallback 2 | `@cf/openai/gpt-oss-120b` | Cloudflare | **PASS** |
| Vision | Primary | `qwen/qwen3.6-27b` | Groq | **PASS** (vision confirmed — correctly read a test image) |
| Vision | Fallback 1 | `@cf/meta/llama-4-scout-17b-16e-instruct` | Cloudflare | **PASS** (vision confirmed) |
| Vision | Fallback 2 | `gemma-4-31B-it` | SambaNova | **PASS** (vision confirmed) |
| Vision | Fallback 3 | `gemma-4-31b` | Cerebras | **PASS** (vision confirmed, still Preview status) |

Every single link in your chain, as specified (with the one judge correction above), is real and callable today with your actual keys.

---

## 3. The deeper sweep you asked for — what a full Cloudflare catalog check turned up

You asked me to ensure the primaries are genuinely the best available, not just good enough. The three platforms with small catalogs (Groq: 15 models, Cerebras: 3, SambaNova: 6) were already fully accounted for in the previous document. **Cloudflare's catalog has 274 models and had only been spot-checked for the 3 you'd already picked.** A full sweep of its Text Generation category found two models worth reporting in full, because leaving them out silently would undercut the "100%" you asked for.

### `@cf/moonshotai/kimi-k2.6` — genuinely accessible, and genuinely the most capable model found anywhere in this entire research process

This is Kimi K2.6 — 1T total parameters / 32B active (MoE), the single highest-benchmarking open-weight model found across all prior research (highest Artificial Analysis Intelligence Index of any open-weight model; beats GPT-5.4, Claude Opus 4.6, and Gemini 3.1 Pro on SWE-Bench Pro). The previous document told you this model had no stable, production-viable free host anywhere. **That needs correcting: it's live on Cloudflare's free Workers AI plan, confirmed with a real call in this session, and it is vision-capable** — tested directly, correctly identified a test image's color.

**Why it is not recommended as a drop-in replacement anywhere in your chain, despite being the most capable model found:**

1. **It breaks the identical-weights design your whole chain is built on.** Your main-model chain's entire value is that Groq/Cloudflare/Cerebras/SambaNova all serve the *exact same* `gpt-oss-120b` weights — a failover is behaviorally invisible to the rest of AEGIS. Swapping Cloudflare's slot to Kimi K2.6 would mean the one platform most likely to be needed under real load suddenly returns a differently-formatted, differently-toned answer at the exact moment something already went wrong upstream. This is precisely the drift risk `DEC-019` designed the whole dual-homing pattern to avoid.
2. **It's a visible-reasoning ("thinking") model, and an expensive one.** A plain "say hi" request produced 54 completion tokens of reasoning before a 1-word answer; the vision test produced 216. That's slow and token-heavy for roles that need fast, short output — a poor fit for judge specifically, and a real cost for vision.
3. **The real, measured Neuron cost is high — 14x higher than the alternative already in your chain.** Confirmed live: Kimi K2.6 vision costs **80.70 Neurons/call**; `llama-4-scout` (your current fallback 1 for vision) costs **5.78 Neurons/call** for the identical test. Against Cloudflare's shared 10,000-Neuron/day account-wide budget, that's the difference between roughly **123 vision requests/day** if you leaned on Kimi K2.6 versus roughly **1,730/day** with Scout — and remember, this budget is shared across *all three roles'* Cloudflare fallback slots on one account, not per-model.

**What I'd actually do with this finding:** keep it out of the primary chain, but know it exists as a genuine fifth-tier "maximum capability, accept the cost and the drift" option — worth having in your back pocket for a scenario you didn't originally ask this chain to solve (e.g., a single very hard, low-frequency admin task where raw capability matters more than consistency or budget), not as a fallback link in the high-frequency chain you're building now.

### `@cf/zai-org/glm-5.2` — confirmed real, confirmed **not usable**

GLM-5.2 (a model I'd also flagged in earlier research as having no confirmed free path) is listed in Cloudflare's catalog — but a live call returned an explicit, unambiguous error: **`"Model @cf/zai-org/glm-5.2 is not available on the Workers Free plan: This model requires a Workers Paid plan."`** This closes the question definitively rather than leaving it ambiguous: GLM-5.2 has no free path on any platform checked across this entire research thread. Not usable here.

### One smaller, genuinely useful find: `@cf/google/gemma-4-26b-a4b-it`

A different Gemma 4 variant than the one already in your chain (this one's MoE — 26B total/4B active, per its naming — versus the dense 31B `gemma-4-31b`/`gemma-4-31B-it` you're already using on Cerebras/SambaNova). Tested live: correctly read the test image, and at **5.87 Neurons/call** — essentially the same cost as `llama-4-scout`. I'm not recommending you swap anything to it — Scout has real, published, third-party-verified MMMU benchmarks; this one doesn't, in anything I found. Noting it only because it's a legitimate, working, similarly-cheap alternative if you ever want a second Cloudflare-hosted vision option distinct from Scout, without the Kimi K2.6 cost/drift trade-off.

---

## 4. Final, locked chain (pending your confirmation on §1)

| Role | Primary | Fallback 1 | Fallback 2 | Fallback 3 |
|---|---|---|---|---|
| **Main** | `gpt-oss-120b` — Groq | `@cf/openai/gpt-oss-120b` — Cloudflare | `gpt-oss-120b` — Cerebras | `gpt-oss-120b` — SambaNova |
| **Judge** | `llama-3.1-8b-instant` — Groq | `openai/gpt-oss-20b` — Groq | `@cf/openai/gpt-oss-120b` — Cloudflare | `Meta-Llama-3.3-70B-Instruct` — SambaNova |
| **Vision** | `qwen/qwen3.6-27b` — Groq | `@cf/meta/llama-4-scout-17b-16e-instruct` — Cloudflare | `@cf/google/gemma-4-26b-a4b-it` — Cloudflare | `gemma-4-31b` — Cerebras (Preview) → `gemini-3.5-flash` — Google AI Studio (5th tier, break-glass only — 5 RPM ceiling, §7.2) |

*(Superseded, see §7: `gemma-4-31B-it` on SambaNova was removed from vision fallback 2 — it was the only vision-capable model on that platform, and its long-term free-tier status was unconfirmed. Replaced with `@cf/google/gemma-4-26b-a4b-it`, tested live, same Neuron cost tier as the existing Scout fallback.)*

Every model above was called live and returned a correct response in this session. **This is the final, locked table** — see §6.2 for the judge-chain addition's reasoning and §7 for the vision-chain revision and the Gemini 3.5 Flash evaluation.

---

## 5. Still open — two items, neither resolvable from here

1. **SambaNova billing status.** I tried to find an API endpoint to check this directly (`/v1/usage`, `/v1/billing`, `/v1/account`, `/v1/plan`, `/v1/organizations`, `/v1/me`) — none exist on SambaNova's public API surface. `gemma-4-31B-it`, `DeepSeek-V3.2`, and `MiniMax-M2.7` all work right now, but whether that's the permanent free tier or a $5 promotional credit that expires is only checkable from `cloud.sambanova.ai`'s own dashboard. Please check before treating vision fallback 2 as durable long-term.
2. **`model_gateway.py` is still a 2-tier circuit breaker, not a 4-tier one.** Nothing in this validation pass changes that. Implementing genuine 3-4 deep failover per role is real, separate code work whenever you're ready to build it.

And, unchanged from before: **rotate all four keys** — they've been in this conversation's plaintext history since your first message with them, independent of anything done here.

---

## 6. Addendum — direct answers to three follow-up questions (same session, continued)

You pushed back on the previous section rather than accepting it at face value, which was the right call. Here's what actually changed on closer, more adversarial examination.

### 6.1 "Is there really no better always-free option?"

Checked four more platforms not covered in either previous document, specifically to close this question rather than assume it:

| Platform | Real finding |
|---|---|
| **Together AI** | **No permanent free tier at all**, confirmed. Only a one-time signup credit ($5–$100 depending on source, the earlier $25 credit was retired in July 2025). Once spent, full pay-as-you-go. Disqualified outright. |
| **Fireworks AI** | **No permanent free tier.** $1 one-time credit. Without a payment method on file, capped at 10 RPM — barely usable for anything. Disqualified. |
| **Chutes.ai** | A free tier exists but every source describing it hedges with "shared GPU queues," "verify current limits in their docs," and no concrete, stable numbers found anywhere. This doesn't clear the bar this project has held every other provider to (a real, checkable number, not "approximately, subject to change"). Not recommended without a direct, live test against a real key, which I don't have for this one. |
| **Cohere** | Trial tier: **1,000 calls/month** (not per day — roughly 33/day averaged out), 20 RPM cap, explicitly "for testing and development only, not production use." Worse than SambaNova's already-marginal 20/day. Disqualified. |

Combined with everything already checked in the two earlier documents (Google AI Studio — privacy-disqualified, OpenRouter — rotation risk, Mistral — explicitly non-production, NVIDIA NIM — one-time credits, GitHub Models — prototyping-only), **the honest answer is no: nothing found across this entire research process beats the four platforms already in your chain** (Groq, Cerebras, SambaNova, Cloudflare) on the combination of proven capability and genuinely recurring, production-viable free access. This isn't a reassurance — it's what's left after actively trying to find something better and failing to.

### 6.2 `Meta-Llama-3.3-70B-Instruct` on SambaNova — yes, as an additional fallback, not as primary

Tested live with a real judge-style prompt (a faithfulness-check task matching what CRAG/judge actually does): it correctly answered `UNSUPPORTED` to a deliberately unsupported claim, in well under a second.

**It satisfies your conditions better than one model already in your chain does, in one specific way worth knowing:** unlike `gemma-4-31B-it` (the vision model on SambaNova whose long-term free status is still an open question — §5), `Meta-Llama-3.3-70B-Instruct` is one of the three models explicitly named in SambaNova's own **documented, permanent** free-tier page. It's a more trustworthy "free forever" claim than the vision fallback you're already running with.

**Not suitable as primary** — same reasoning as before, now with the number restated plainly: SambaNova's real ceiling is 20 requests/day. Judge fires on nearly every query; 20/day would be exhausted almost immediately at any real usage.

**Good as an additional fallback — recommended addition, not just a validated option.** Your current judge chain is Groq → Groq → Cloudflare: two of three links share a platform. Adding `Meta-Llama-3.3-70B-Instruct` on SambaNova as a fourth tier gives judge genuine three-platform diversity, matching what your main and vision chains already have. Suggested position: last, after Cloudflare, since 20/day makes it purely a last-resort layer, not a working fallback:

**Revised judge chain: `llama-3.1-8b-instant` (Groq) → `openai/gpt-oss-20b` (Groq) → `@cf/openai/gpt-oss-120b` (Cloudflare) → `Meta-Llama-3.3-70B-Instruct` (SambaNova, last-resort).**

### 6.3 Kimi K2.6 on Cloudflare — no, not worth switching, and here's hard evidence it isn't "free forever" either

Three more things were checked specifically to answer this properly rather than repeat the previous judgment call.

**Measured latency, same task, same conditions:** Kimi K2.6 took **10.5 seconds** for a single vision call. `llama-4-scout` (your current fallback) took **2.5 seconds** for the identical task. That's not a rounding difference — it's a 4.2x latency gap, on top of the 14x Neuron-cost gap already found. If this ever became a regularly-hit fallback rather than a rare one, it would visibly slow down whatever's waiting on it.

**Is it "free forever"? No — and there's now direct, concrete evidence against that framing, not just caution.** Checked Cloudflare's own changelog: **`@cf/moonshotai/kimi-k2.5` was deprecated and auto-aliased to `kimi-k2.6` on 2026-05-30 — at a higher price.** This is the exact model family in question, with a documented history of being repriced upward within the last three months. Separately confirmed: Cloudflare already restricts other large, expensive models to their **paid** plan entirely — `GLM-5.2` (found in §3) and, per this latest check, even `Llama 3.1 70B`. Kimi K2.6 is priced at Cloudflare's own paid rate ($0.95/M input, $4/M output — expensive even by paid-tier standards) and sits in exactly the size/cost category Cloudflare has already shown it's willing to reprice or paywall. Nothing here proves it *will* be pulled from free — but "currently free, no stability tag, same model family already repriced once, sibling models of similar size already paid-only" is a materially weaker "forever" than `gpt-oss-120b`/`gpt-oss-20b`/`llama-4-scout`, none of which show any of these warning signs.

**Verdict, with the numbers behind it now: not worth switching.** The capability gain is real, but the cost is a measured 4.2x latency penalty, a measured 14x budget penalty, and a documented repricing precedent on the exact model — against a chain whose entire design goal is fast, cheap, predictable resilience. It remains worth knowing about as a separate, occasional-use tool for a task where raw capability matters more than speed, cost, or stability — not as a link in this chain.

---

*Sources for this addendum: live API calls (SambaNova judge test, Cloudflare timing comparison, Cloudflare model-metadata and changelog lookups), plus web research on Together AI, Fireworks AI, Chutes.ai, and Cohere's current free-tier terms, and Cloudflare's public Workers AI changelog.*

---

## 7. Final revision — vision fallback 2 replaced; Gemini 3.5 Flash evaluated and excluded

### 7.1 `gemma-4-31B-it` (SambaNova) removed from vision fallback 2

It was the only vision-capable model in SambaNova's entire catalog — nothing else there could substitute for it, so this removed SambaNova from the vision chain entirely rather than swapping one model for another. Replaced with **`@cf/google/gemma-4-26b-a4b-it`** on Cloudflare — tested live in this session, correctly identified a test image, and costs 5.87 Neurons/call, essentially identical to the existing Scout fallback's 5.78. Trade-off accepted knowingly: this puts two of the vision chain's four tiers on Cloudflare, reducing platform diversity versus the SambaNova option — but removes the one item in this entire finalized list whose long-term free-tier status wasn't fully confirmed.

### 7.2 Gemini 3.5 Flash — evaluated on merit and quantity, explicitly excluded

Tested live with a real key. Capability is genuinely strong — tops the Roboflow Vision Evals leaderboard, native multimodal, and per Google's own published benchmarks, competitive with or ahead of everything else in this research process on raw quality.

**Excluded anyway, on quantity grounds alone, data-use trade-off set aside per direct instruction.** An empirical burst test in this session hit a real, confirmed quota wall: **`gemini-3.5-flash`'s free tier is capped at 5 requests per minute** (`quotaValue: "5"`, direct from Google's own `429` response, not a docs estimate). Every other model in the finalized list has a request ceiling at least two orders of magnitude more generous. At 5 RPM, the model cannot survive AEGIS's own already-established normal traffic pattern (1-3 simultaneous generations at peak, `DEC-018`) without erroring, let alone serve as a dependable fallback for a moment when something else is already under load.

**Update: added anyway, at your explicit direction, as vision's 5th and final tier.** `gemini-3.5-flash` — Google AI Studio, positioned after `gemma-4-31b` (Cerebras), reached only once all four prior vision tiers have failed. Go in with the 5 RPM number in mind: this tier will itself frequently fail under the exact conditions that get it reached, so treat it as "marginally better than a hard failure," not a dependable fallback. Vision is the lowest-frequency of the three roles in this system, which is the only reason this tier has any realistic chance of being useful at all.
