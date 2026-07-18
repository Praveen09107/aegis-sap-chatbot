# AEGIS — DECISIONS LOG
## Authoritative Chronological Record of Every Substantive Project Decision
## Place in: specs/tier3_verification/DECISIONS_LOG.md
## Status: Living document — append new entries at the end of the relevant Part; never edit or delete a past entry, only supersede it

---

## HOW TO USE THIS DOCUMENT

This log answers one question: **"Why is it this way, and what did we consider instead?"**

It is NOT the same document as `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md`. That document is a *lookup table* — you consult it when you encounter something in `tier5_historical/` and need to know whether it's still true. This document is a *chronological diary* — you consult it when you want to understand why a decision was made, what alternatives were rejected, and whether it's still in force.

Every entry has a unique ID (`DEC-NNN`) so other specification documents can cite it directly (e.g., "per DEC-019, `model_gateway.py` routes to Cerebras first"). Once this initial version of the log is published and cited elsewhere, IDs become permanent — if a decision is later reversed, the original entry is marked `SUPERSEDED BY DEC-XXX` and a new entry is added; the old one is never deleted or renumbered. (This initial draft was renumbered once, internally, after a self-review found four missing decisions before anything else referenced these IDs — see the note at the end of this document.)

**Status values used throughout:**
- `CONFIRMED` — currently in force, implementation should follow this
- `SUPERSEDED BY DEC-XXX` — no longer in force, kept for historical traceability
- `DEFERRED` — deliberately not decided yet, scheduled for a later phase
- `OPEN` — genuinely unresolved, requires action before it can be marked CONFIRMED

**Authority note:** Per the hierarchy established in `tier5_historical` (originally stated in the now-archived `AEGIS_TIER1_CLARIFICATION_ANSWERS.md`), where any decision in this log conflicts with an actual `IMPL_XX` spec file or `tier1_foundation` document, the spec file wins for backend implementation questions — but for decisions in Parts A, B, C, D, and F below (project direction, deployment environment, inference architecture, infrastructure additions, and specification strategy itself), **this log is the highest authority**, since these are new decisions made after the original Sona Comstar-era specs were frozen, and no original spec document can speak to them.

---

# PART A — PROJECT DIRECTION AND SCOPE DECISIONS

---

### DEC-001 — Project Continues Independently, Outside Sona Comstar
**Status:** CONFIRMED

**Decision:** AEGIS is no longer being built for or on behalf of Sona Comstar. The internship concluded and the project continues as the developer's own independent work: a portfolio piece and a potential product template for future clients.

**Context:** The internship period ended with an instruction to discontinue the project within the company. The developer had already pulled the complete repository (as an authorized collaborator) before departure and wished to complete the system independently rather than abandon substantial completed work (IMPL_01 through approximately IMPL_16, all tier1_foundation and tier2_implementation specs, all tier4_frontend specs).

**Alternatives considered:** None seriously — abandoning the work was rejected outright given the investment already made in architecture, specification, and partial implementation.

**Note on scope:** No claim is made here about intellectual property rights, NDAs, or employment terms governing this continuation. The developer was advised early in this process to review any agreements signed during the internship with a qualified advisor before publicly distributing or commercializing the resulting work. This log does not resolve that question — it only records the technical decision to continue building.

**Affects:** Every subsequent decision in this log.

---

### DEC-002 — Success Criteria: Fully Working, Immersive, Production-Grade Quality Throughout; No Feature or Quality Reduction Accepted
**Status:** CONFIRMED

**Decision:** The rebuilt system must be a genuinely complete, fully working, deployed application — not a partial demo or proof-of-concept. Every component must function to a production-grade quality bar. The experience for a recruiter or prospective client visiting the live deployment must feel like a real, immersive product, not "a demo." The dual goal is (a) a standout portfolio piece and (b) a credible template that could be offered to real companies in the future.

**Explicit constraints this establishes, referenced throughout later decisions:**
- Reducing feature scope to solve a technical constraint is not acceptable as a default response — it was rejected repeatedly across this process (e.g., rejecting a suggestion to defer Quick Entry, see DEC-005; rejecting the idea of dropping vision, see DEC-006).
- Reducing generation quality (a smaller/weaker model) to solve the free-tier latency problem was explicitly rejected — stated directly during the inference-architecture discussion: quality must not be sacrificed for a cheaper or simpler path.
- The system must run at genuinely zero recurring cost, indefinitely — not a time-limited trial, and not a low-but-nonzero monthly spend, since the project has no revenue and is not being sold to fund its own hosting.

**Why this is recorded as its own decision:** this bar is cited as the reasoning behind several later, more specific decisions (rejecting self-hosted small models, rejecting HF Spaces' architecture compromises, insisting on dual-homed failover rather than a single fragile provider) and needs one clear place where the underlying "why" is stated, rather than being re-derived piecemeal from context each time.

**Affects:** DEC-005, DEC-006, DEC-015, DEC-018 through DEC-021, and implicitly, the overall quality bar for every specification document produced under this strategy.

---

### DEC-003 — Deployment/Tenancy Model: Single-Tenant, Company-Agnostic (Not Multi-Tenant SaaS)
**Status:** CONFIRMED

**Decision:** AEGIS is built as a single-tenant, configurable-per-deployment product. Each company that uses it gets its own dedicated deployment (or self-hosts it themselves) with company-specific configuration (name, SAP modules, branding) set via environment variables — not a shared multi-tenant SaaS platform where multiple companies' data coexists on the same infrastructure.

**Alternatives considered and rejected:**
- **Multi-tenant SaaS** (any company signs up, creates an org, uses a shared platform): Rejected. This would require fundamental architectural changes not present anywhere in the current design — tenant-scoped database routing, per-tenant Qdrant/OpenSearch namespacing, a super-admin/org-admin role layer above the existing employee/it-admin RBAC, signup/billing infrastructure, and per-tenant quota enforcement. Estimated 2-3 months of additional architectural work, incompatible with the stated ~1-month timeline. The current Keycloak realm, Postgres schema, and Qdrant collection design are all single-tenant by construction.

**Reasoning for the chosen option:**
1. Timeline: achievable within the stated ~1 month; multi-tenant SaaS is not.
2. Enterprise privacy positioning: for software handling internal SAP configuration data, "your data lives on your own dedicated deployment, never on shared infrastructure" is a stronger sales position than a shared SaaS platform, particularly for the manufacturing/enterprise SAP client profile AEGIS targets.
3. Forward compatibility: because Option B (below) keeps company identity in configuration rather than hardcoded, a future move to multi-tenancy remains a structured engineering project rather than a rewrite.

**Affects:** All generalization work (DEC-007), the entire configuration approach in `AMENDMENT_GENERALIZATION_BACKEND.md` / `_FRONTEND.md`.

---

### DEC-004 — Generalization Scope: SAP-Focused, Any Company (Not Fully Domain-Agnostic)
**Status:** CONFIRMED

**Decision:** AEGIS remains an SAP-specific enterprise assistant, generalized only to remove the specific binding to Sona Comstar as a company — not generalized to handle arbitrary document types for arbitrary business domains (HR policy, legal, finance, etc.).

**Alternatives considered and rejected:**
- **Fully domain-agnostic platform** (any company's internal documents of any type): Rejected. This would require redesigning the ingestion pipeline's field-detection logic and the entity-extraction regex patterns in `query_intelligence.py` from scratch, since both are currently built around SAP-specific structures (T-codes, module codes, the `CAUSE_N` template pattern). Estimated 2-3 additional weeks of work, not justified given the current target use case.

**Reasoning:** The existing document template structure (`AEGIS_DOCUMENT_TEMPLATES.md`), the OpenSearch SAP-terminology analyzer, and the T-code permission model are already-built, working, generic-to-any-SAP-installation assets. Narrowing scope to "any company running SAP" (rather than "any company, any domain") preserves nearly all of this work and requires only configuration-level changes (module codes, company name, terminology lists), not a redesign.

**Note on naming collision:** This is a *different* "Option A vs Option B" decision from DEC-003 (tenancy model). Both were informally referred to as "Option A/B" during the conversation in which they were decided; they are unrelated decisions and should not be conflated. DEC-003 = tenancy model. DEC-004 = generalization depth.

**Affects:** `AMENDMENT_GENERALIZATION_BACKEND.md`'s scope boundary — it generalizes company identity and module configuration, not document-type-agnostic ingestion logic.

---

### DEC-005 — Quick Entry (IMPL_23-29, FRONTEND_36-40) Is In Scope
**Status:** CONFIRMED (reverses an earlier working assumption)

**Decision:** Quick Entry is a fully in-scope feature for this build, not deferred to a later version.

**History:** An earlier recommendation in this process suggested deferring Quick Entry to protect the implementation timeline, given it represents 7 backend sessions (IMPL_23-29) plus 5 frontend sessions (FRONTEND_36-40) — a non-trivial addition. This recommendation was not explicitly confirmed or rejected at the time it was made. Later in the same process, when frontend scope was discussed directly, the developer explicitly stated Quick Entry, the full admin portal, and observability dashboards were all required — directly conflicting with the earlier deferral suggestion. When this conflict was surfaced explicitly, the developer confirmed: Quick Entry is in scope, definitely.

**Reasoning:** Per DEC-002's success-criteria bar, reducing functionality was repeatedly and explicitly rejected as unsatisfying, including for features that would meaningfully shorten the timeline. Quick Entry is treated the same way.

**Affects:** Implementation session ordering (the eventual backend session sequence must include IMPL_23-29), frontend session ordering (FRONTEND_36-40 included), and `AMENDMENT_GENERALIZATION_BACKEND.md` (Quick Entry's one identified generalization touchpoint — see DEC-007).

---

### DEC-006 — Vision Pipeline Is a Primary Feature, Not Optional
**Status:** CONFIRMED

**Decision:** The vision/screenshot-analysis capability (originally `IMPL_13`, backed by `qwen2.5vl:7b-instruct` in the demo architecture) is a primary, required feature of the rebuilt system — contingent only on finding a genuinely free-tier vision-capable inference provider (which was subsequently found; see DEC-021).

**History:** Early in the hardware-constraint discussion, dropping vision was proposed as a way to reduce resource requirements on constrained local hardware. When directly asked whether vision should be primary or secondary, the developer stated clearly: vision is needed, not as a second option — it is a primary feature, contingent only on model availability.

**Alternatives considered and rejected:**
- **Drop vision entirely to save resources**: Rejected once the developer clarified its priority.
- **Keep vision but treat as best-effort/optional fallback**: Rejected — explicitly stated as primary, not secondary.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s vision routing section (DEC-021 onward), `IMPL_13` retrofit requirements, `docs/TROUBLESHOOTING_RUNBOOK.md`'s vision-provider-deprecation entry (see Part G).

---

### DEC-007 — Quick Entry's One Generalization Touchpoint Identified
**Status:** CONFIRMED

**Decision:** `IMPL_24_QUICK_ENTRY_DATA_MODEL.md` contains an instruction to whoever implements it: *"Replace all [PLACEHOLDER] values with real Sona Comstar SAP examples."* This instruction is corrected to read: *"replace with realistic SAP examples (synthetic, not tied to any specific company)."*

**Reasoning:** This is the only Sona-Comstar-specific instruction found anywhere in the Quick Entry specification set (IMPL_23-29) during the generalization audit. It is a documentation instruction aimed at whoever runs the implementation session, not a code-level dependency — correcting it is a one-line fix, not a structural change.

**Affects:** `AMENDMENT_GENERALIZATION_BACKEND.md`.

---

# PART B — HARDWARE AND DEPLOYMENT ENVIRONMENT DECISIONS

---

### DEC-008 — Local Hardware Cannot Run the Full Stack; Cloud Development/Deployment Required
**Status:** CONFIRMED

**Decision:** Development and deployment both happen on cloud infrastructure, not the developer's local laptop.

**Hardware baseline (for the record):** ASUS Vivobook K3605ZC — Intel i7-12700H, 16GB RAM, NVIDIA RTX 3050 (4GB VRAM), ~300GB free storage. Task Manager measurements showed ~5.6-8GB realistically free after accounting for Windows, WSL2 overhead (`VmmemWSL`), and typical background applications (antivirus, browser, messaging apps).

**Reasoning:** The original demo architecture (19 services, three Ollama-hosted models including a 32B main model) requires an estimated 35-40GB RAM to run simultaneously. Even an aggressively reduced/adapted local configuration (single consolidated Ollama container running a 7B model, reduced OpenSearch heap, dropped Postgres replica) was estimated at approximately 17-20GB — still exceeding available local RAM, and would in any case be superseded by the subsequent decision to move all LLM inference off local hardware entirely (DEC-015).

**Note:** A `.wslconfig`-based WSL2 memory cap and selective per-service `docker compose up` (only starting the services relevant to whatever is currently being implemented, rather than the full 19-service stack) were identified as partial local mitigations, but do not change the fundamental conclusion — cloud infrastructure is required for both development and deployment.

**Affects:** DEC-009 through DEC-014 (deployment platform selection), `docs/DEV_ENVIRONMENT_SETUP.md`.

---

### DEC-009 — Oracle Cloud Always Free Tier Selected as Base Compute Layer
**Status:** CONFIRMED

**Decision:** Oracle Cloud Infrastructure's Always Free tier (Ampere A1 ARM compute) is the base compute platform for the non-LLM-inference portion of the stack (all services except the three model-serving roles, which route to external APIs per DEC-015).

**Important correction during this decision:** Oracle's Always Free A1 allocation was initially believed to be 4 OCPUs / 24GB RAM. Direct verification against Oracle's own "Always Free Resources" documentation confirmed the actual current allocation is **2 OCPUs / 12GB RAM total**, described as "the first 1,500 OCPU hours and 9,000 GB hours per month for free... equivalent to 2 OCPUs and 12 GB of memory" for Always Free tenancies. This pool can be provisioned as one VM (2 OCPU/12GB) or split into two VMs (1 OCPU/6GB each) — the total does not increase either way.

**Reasoning this still holds despite the smaller-than-expected allocation:** With the LLM inference roles moved to external free-tier APIs (DEC-015), the remaining services (FastAPI, ARQ, Postgres, Redis x2, Qdrant, OpenSearch with reduced heap, Keycloak, Vault, Nginx, MinIO once added per DEC-024) fit comfortably within 12GB with meaningful headroom, since none of the actual RAM-heavy items (a locally-hosted LLM) remain.

**Status note on prior AWS production-deployment planning:** substantial AWS production-deployment planning documentation (instance sizing, cost estimates, VPC architecture, service-by-service AWS mapping) was produced earlier in this project's history, in the Sona Comstar-context planning phase, for a scenario involving GPU-backed self-hosted inference on paid infrastructure. That planning is **not superseded or invalidated** — it remains accurate for the scenario it was written for (a paying enterprise client wanting a dedicated, self-hosted, GPU-backed deployment) — but it is **not the active deployment target** for the independent, zero-recurring-cost portfolio project this log otherwise describes. A future paying client scenario could revive that planning largely as-is.

**Affects:** DEC-010, DEC-011, DEC-012 (rejected alternatives), `docs/CLOUD_DEPLOYMENT_GUIDE.md`.

---

### DEC-010 — Rejected: Two Oracle Free-Tier Accounts to Double Available Compute
**Status:** SUPERSEDED (never adopted — rejected before implementation)

**Decision considered:** Provision two separate Oracle Always Free accounts (e.g., one per collaborator or one personal plus one for a second identity) to obtain two independent 2 OCPU/12GB pools.

**Rejected for two independent reasons:**
1. **Policy violation:** Oracle's own account policy states one Always Free account is permitted per person; creating or attempting to create multiple free accounts for the same individual is explicitly prohibited and risks suspension of all associated accounts.
2. **Would not have solved the actual problem even if permitted:** The core latency constraint in the original self-hosted-inference plan was per-model token generation speed on ARM CPU (2-4 tokens/second for a 7B model), a function of CPU cores available *to that specific inference process*, not total account-level compute. Splitting Ollama onto its own dedicated 1-OCPU instance would have *reduced* its available cores compared to running on a full 2-OCPU instance, making generation slower, not faster. Two accounts would have solved a RAM-distribution problem that no longer existed once inference moved off local/Oracle compute entirely (DEC-015).

**Affects:** No files — this path was never implemented. Recorded here so the reasoning isn't re-litigated later.

---

### DEC-011 — Rejected: Hugging Face Spaces as Deployment Platform
**Status:** SUPERSEDED (never adopted — rejected before implementation)

**Decision considered:** Deploy AEGIS on Hugging Face Spaces' free tier (16GB RAM, 2 CPU cores, genuinely more generous RAM than Oracle's 12GB).

**Rejected for architectural incompatibility, not resource limits:** HF Spaces exposes a single public port per Space and expects one Docker container (or a reverse-proxy-fronted set of processes behind one exposed port). AEGIS's 19-service, 5-Docker-network architecture cannot run as `docker compose up` on this platform without collapsing all services into one container via a process manager — estimated as weeks of rework that would also compromise the multi-service architecture being showcased (directly conflicting with DEC-002's quality bar). Additionally, HF Spaces' free-tier disk (50GB) is explicitly ephemeral and resets on every Space restart or sleep/wake cycle, meaning ingested documents, Postgres data, and Qdrant vectors would be lost regularly — unacceptable for a system meant to demonstrate persistent, stateful operation.

**Affects:** No files — this path was never implemented.

---

### DEC-012 — Rejected: Distributed Multi-Provider Free-Tier Architecture
**Status:** SUPERSEDED (never adopted — rejected before implementation)

**Decision considered:** Split the stack across multiple specialized free-tier providers — Supabase (Postgres), Upstash (Redis x2), Qdrant Cloud (vectors), Oracle (compute for FastAPI/ARQ/OpenSearch/Ollama), Vercel (frontend), Grafana Cloud (observability), Cloudflare R2 (object storage).

**Analysis performed:** Storage limits were checked and found NOT to be the binding constraint (Qdrant Cloud's 1GB tier supports roughly 1,000,000 768-dim vectors — vastly more than a portfolio-scale document corpus needs; Supabase's 500MB free tier was calculated to support approximately 250,000 audit-log rows, roughly 250 days of continuous 1,000-query/day usage before approaching the limit).

**Rejected for two reasons that were the actual binding constraints:**
1. **Privacy inconsistency:** Splitting data across 5-7 independent third-party providers directly contradicts AEGIS's core architectural principle (data stays within infrastructure the operator controls) more severely than any single well-chosen provider would. This was judged to undermine the product's own value proposition even for demo/portfolio use.
2. **Operational complexity and added latency:** Each cross-service call over the public internet (session check, cache check, vector search, audit write) adds 80-200ms versus sub-millisecond for co-located services, and managing seven independent free-tier accounts (each with its own inactivity-suspension policy, dashboard, and failure mode) was judged to add meaningful operational risk for a solo-maintained system, disproportionate to the modest RAM savings versus a single well-configured Oracle instance.

**Affects:** No files — this path was never implemented. All data-layer services (Postgres, Redis x2, Qdrant, OpenSearch) remain co-located on the single Oracle instance per DEC-009.

---

### DEC-013 — Development Environment: VS Code Remote-SSH + Claude Code Extension, Directly on the Oracle VM
**Status:** CONFIRMED

**Decision:** The Oracle Cloud VM (per DEC-009) serves as both the development *and* deployment environment. The developer's laptop runs only a thin client: VS Code with the Remote-SSH extension connected to the Oracle VM, with the Claude Code extension installed *on the remote host* (not locally) via VS Code's SSH-aware "Install in SSH: [host]" extension installation path.

**Reasoning:** Claude Code itself (the coding agent) is lightweight — primarily network calls to Anthropic's API — while the actual resource-heavy component is the Docker stack it tests against. Running the agent locally while the stack runs remotely would require constant file-sync friction and network round-trips for every test cycle. Running the agent directly on the Oracle VM means development happens on the exact machine (same ARM architecture, same RAM ceiling) where the code will permanently live, eliminating an entire class of "works in dev, fails in production" environment-mismatch bugs. Estimated remote-side VS Code Server overhead: 200-400MB RAM, trivial against the 12GB budget.

**Affects:** `docs/DEV_ENVIRONMENT_SETUP.md`; supersedes the *approach* (not necessarily every specific instruction) described in `AEGIS_DIRECTORY_STRUCTURE.md`'s planned `docs/ONBOARDING.md`, which describes the original local-hardware (WSL2 + Docker Desktop) setup path. Both documents should exist; `DEV_ENVIRONMENT_SETUP.md` must state explicitly that it is the alternative path used instead of `ONBOARDING.md`'s WSL2 instructions, given local hardware constraints (DEC-008).

---

### DEC-014 — ARM64 Architecture Compatibility Confirmed as the One Infrastructure-Level Code Change Required
**Status:** CONFIRMED

**Decision:** Moving to Oracle's ARM-based Ampere A1 compute requires exactly one confirmed infrastructure-level accommodation: the OpenSearch container image must specify an explicit ARM64-compatible tag (most other images in the stack — Postgres, Redis, Nginx, Qdrant — publish multi-architecture images and require no tag change).

**Affects:** `docker-compose.yml` (image tag only, no application code change), `docs/CLOUD_DEPLOYMENT_GUIDE.md`.

---

# PART C — INFERENCE ARCHITECTURE DECISIONS

---

### DEC-015 — Self-Hosted LLM Inference Abandoned in Favor of Free-Tier API Providers
**Status:** CONFIRMED

**Decision:** No LLM model (main reasoning, judge/CRAG, or vision) is self-hosted via Ollama or any local/cloud-VM inference engine. All three roles route to external, verified, genuinely-free-tier API providers.

**Alternatives considered and rejected, in order of exploration:**

1. **Self-host the original 32B model on Oracle CPU:** Rejected outright — Oracle's free tier has no GPU; a 32B model on 2 ARM CPU cores was estimated well beyond acceptable response times for any real usage.
2. **Self-host a reduced 7B model on Oracle CPU:** Modeled at approximately 2-4 tokens/second on Oracle's 2 ARM cores, producing an estimated 75-150 second wait for a typical 300-token response. Rejected as unacceptable given DEC-002's requirement that the system feel production-grade, not merely functional.
3. **Self-host an even smaller 3B model on Oracle CPU:** Modeled at roughly 40-75 seconds per response — meaningfully better but still rejected once the developer clarified that generation quality must not be reduced to solve the latency problem, per DEC-002.
4. **Groq as sole/primary inference provider:** Considered and explicitly rejected by the developer as a *primary* solution, on the stated grounds that a project built as "just an API wrapper" is less impressive to recruiters and does not demonstrate genuine engineering work, compared to self-hosting. This objection was resolved not by abandoning API-based inference, but by reframing the design: a multi-provider inference gateway with automatic circuit-breaker failover between independent providers (serving identical model weights where possible) is itself a legitimate, demonstrable piece of distributed-systems engineering — not a thin wrapper around one API. This reframing is what made API-based inference acceptable to the developer.

**Reasoning for the final approach:** No free compute tier anywhere (checked: Oracle, Hugging Face Spaces GPU, Modal, RunPod) provides a persistent, always-warm, no-cost GPU suitable for continuous portfolio-demo availability — every free GPU option is either credit-limited/expiring or scale-to-zero with meaningful cold-start latency. Fast, free, persistent CPU-based inference APIs (Cerebras, Groq) do exist and were verified to meet the "fast, complete, high-quality, free forever, always live" requirement set that no self-hosted option could satisfy simultaneously.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md` in full; `model_gateway.py` (retrofit — see Part G open items); `vision_integration.py` (retrofit).

---

### DEC-016 — Live Demo Document Corpus: Synthetic SAP-Style Documents, Not Real Sona Comstar Data
**Status:** CONFIRMED

**Decision:** The document corpus used to seed and demonstrate the live, publicly-accessible deployment consists of synthetic, fictional SAP-style documents (error guides, procedures, config snapshots) generated to follow the existing, already-generic template structure — not the real Sona Comstar business documents originally uploaded during the internship phase.

**Context:** The uploads directory contains actual real Sona Comstar business PDFs (Tax Code Configuration, Stock Transport Order Process, Schedule Agreement Process, Withholding Tax Configuration, and others describing real internal processes). Three options were considered when this was raised directly: (a) synthetic/generic documents with zero real Sona Comstar content, (b) the real uploaded PDFs as-is, (c) heavily anonymized/rewritten versions of the real documents. The developer chose option (a).

**Reasoning:** Option (a) avoids a distinct concern from the code-ownership/NDA question already noted in DEC-001 — this is specifically about not making another company's actual internal business documents public as demo content on a live, recruiter- and client-facing deployment, independent of whatever the code-ownership situation turns out to be. The existing document template structure (confirmed generic and reusable in DEC-004) makes generating realistic synthetic content straightforward without needing to reuse any real source material.

**Affects:** `docs/DEMO_CONTENT_GUIDE.md`; the ingestion-pipeline testing/seeding process.

---

### DEC-017 — Privacy Trade-off Resolved: External Inference APIs Are Acceptable, Given a Synthetic Demo Corpus
**Status:** CONFIRMED

**Decision:** Sending assembled prompts (retrieved document chunks plus the user's question) to external inference providers (Cerebras, Groq — per DEC-015) is accepted as consistent with the project's goals, on the basis that the live deployment's content is synthetic demo data (per DEC-016), not real, sensitive company information.

**Context — the tension this resolves:** AEGIS's original architectural principle (established during the Sona Comstar-era design) is that data never leaves infrastructure the operator controls — the entire on-premise design was built around this. DEC-015's move to external inference APIs is, in the strictest sense, a departure from that principle. Rather than treat this as an unresolved contradiction, the developer explicitly confirmed that using demo data for this purpose is completely acceptable, resolving the tension directly.

**Reasoning and forward-looking implication:** This acceptance is scoped specifically to the portfolio/demo deployment described throughout this log. It is not a statement that the privacy principle itself is abandoned as an architectural capability — `model_gateway.py`'s design (per DEC-015's reframing) supports a configurable `INFERENCE_MODE` distinguishing external-API routing from a fully air-gapped local mode. A real prospective client with genuine data-sensitivity requirements would be offered the air-gapped configuration, not the external-API one used for the public demo. This distinction should be stated explicitly wherever the system's privacy properties are described (e.g., in any future client-facing materials), to avoid overstating the demo deployment's privacy guarantees.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md` (must document the `INFERENCE_MODE` configurability, not just the demo's default); any future client-facing description of AEGIS's privacy properties.

---

### DEC-018 — Traffic Pattern Reframing: Rare/On-Demand Usage, Not Sustained Concurrency
**Status:** CONFIRMED

**Decision:** AEGIS's actual target usage pattern is 10-30 total users, used irregularly and on-demand (recruiters, prospective clients, occasional friends) — not 50-100 users with regular daily concurrent usage, and realistic peak concurrency is 1-3 simultaneous active generations, essentially never more.

**Why this matters:** This reframing, arrived at partway through the inference-architecture discussion, is what made free-tier API rate limits (typically 5-30 requests/minute per model) viable at all. Earlier analysis had been implicitly anchored on a "50-100 concurrent users" framing carried over from the original Sona Comstar internal-helpdesk context, which would have made every free-tier rate limit look inadequate. Once the actual usage pattern was clarified directly by the developer, the entire feasibility analysis changed.

**Affects:** Every rate-limit adequacy judgment in DEC-019 through DEC-022.

---

### DEC-019 — Main Reasoning Role: `gpt-oss-120b`, Dual-Homed on Cerebras (Primary) and Groq (Fallback)
**Status:** CONFIRMED

**Decision:** The main reasoning role (originally Qwen2.5-32B, Tier 2/3 in the routing logic — ERROR_RESOLUTION, PROCESS, CONFIG, Mode C queries) is served by `gpt-oss-120b`, identically-weighted and available on both Cerebras (primary) and Groq (fallback).

**Verified specifications (via direct fetch of official documentation, not secondary sources):**
- Model: OpenAI GPT-OSS-120B — 117B total parameters, 5.1B active (Mixture-of-Experts), Apache 2.0 license, "Production" status (not Preview) on both platforms.
- Cerebras free tier (officially named "Free Trial" in the tabbed rate-limits documentation, not "Free Tier" as commonly assumed): 5 requests/minute, 30,000 tokens/minute, 1,000,000 tokens/day. No credit card required; no expiration date found during research, though the "Free Trial" naming warrants periodic reconfirmation.
- Groq free tier for this specific model: 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, 200,000 tokens/day.

**Why dual-homing the *same* model rather than using a different fallback model:** A failover to a different model (e.g., Llama 3.3 70B on Groq alone) would introduce output-shape drift — different formatting conventions, different refusal patterns — precisely at the moment the system is already under stress from a primary-provider failure. Serving identical weights on two independent platforms means the circuit breaker already present in `model_gateway.py`'s design (originally built for Ollama main/judge fallback) can fail over with zero behavioral change to the rest of the pipeline. This was identified as the single deciding factor in this model's selection over alternatives.

**Alternatives considered and rejected:**
- `llama-3.3-70b-versatile` (Groq only, no Cerebras equivalent found): rejected specifically because it lacks a dual-host partner, losing the zero-drift-failover property.
- `zai-glm-4.7` (Cerebras, ~400B parameters, Preview status): considered for its larger parameter count and advanced agentic/reasoning capabilities, but rejected as primary due to Preview (non-production) status and lack of a Groq-hosted equivalent.

**Affects:** `model_gateway.py` Tier 2/3 routing target; `AMENDMENT_INFERENCE_ARCHITECTURE.md`.

---

### DEC-020 — Judge/CRAG/Fast-Path Role: `llama-3.1-8b-instant` on Groq
**Status:** CONFIRMED

**Decision:** The judge/CRAG/Tier 1 (SIMPLE_FACT) role, originally Qwen2.5-7B, is served by Groq's `llama-3.1-8b-instant`.

**Verified specifications:** 30 requests/minute, **14,400 requests/day**, 6,000 tokens/minute, 500,000 tokens/day. Production status.

**Reasoning:** This role's defining requirement is request-volume headroom, not model size — CRAG self-reflection fires on every Mode C query and any query with borderline retrieval confidence, meaning this model is called far more frequently than the main reasoning model, with short, structured output. 14,400 requests/day is, by a wide margin, the most generous limit found across every model and platform researched for any role. Explicitly kept on a separate budget from the main-reasoning Cerebras/Groq pair to avoid resource contention between high-frequency judge calls and primary answer generation.

**No true dual-homed fallback exists for this role** (Cerebras has no small dense model in its free catalog). Fallback behavior on exhaustion: degrade to the `gpt-oss-120b` pair with a reduced completion-token budget, judged acceptable since judge/CRAG output is short and structured, less sensitive to a capability step-up than full answer generation would be.

**Affects:** `model_gateway.py` Tier 1 routing target and CRAG call target in `retrieval_engine.py`; `AMENDMENT_INFERENCE_ARCHITECTURE.md`.

---

### DEC-021 — Vision Role: `meta-llama/llama-4-scout-17b-16e-instruct` on Groq (Primary), `gemma-4-31b` on Cerebras (Fallback)
**Status:** CONFIRMED

**Decision:** The vision/screenshot-analysis role, originally Qwen2.5-VL-7B, is served by Groq's Llama 4 Scout as primary, with Cerebras's Gemma 4 31B as a genuinely different-provider fallback.

**Verified specifications:**
- `meta-llama/llama-4-scout-17b-16e-instruct` (Groq): 109B total / 17B active parameters (MoE), early-fusion native multimodality, 30 requests/minute, 1,000 requests/day, **30,000 tokens/minute**, 500,000 tokens/day. Status: **Preview** (Groq's own designation) — noted as an accepted risk given no production-status free vision alternative was found.
  - **Critical implementation note:** the exact API model identifier requires the `meta-llama/` prefix (`meta-llama/llama-4-scout-17b-16e-instruct`). An early draft of the model-selection reference omitted this prefix in its reference tables (while the accompanying benchmark script always had it correct) — using the unprefixed name returns a 404. Confirmed via direct fetch of Groq's official rate-limits documentation.
- `gemma-4-31b` (Cerebras): 30.7B parameters (dense, hybrid attention), Preview status, 5 requests/minute, 30,000 tokens/minute, 1,000,000 tokens/day, **on the Free Trial tier specifically: 2 images per request, 4MB total payload limit.**
  - **Correction record:** a third-party audit of the model-selection document claimed this limit was actually "5 images per request, 10MB total," calling the original 2-image/4MB figure an error. Direct re-fetch of Cerebras's official rate-limits documentation (checking the specific tab, not just the page) confirmed the original 2-image/4MB figure is correct **for the Free Trial tier**; the audit's "5 images/10MB" figure is real but belongs to the separate Developer (Pay-as-you-go) tab on the same page. The audit conflated two tiers on a multi-tab page. This is recorded as a specific, verified example of why tier-specific numbers must be checked against the exact tab/section, not assumed from a plausible-sounding secondary claim.

**Reasoning Scout was chosen as primary over Gemma:** Scout's 30,000 TPM (vs. Gemma's also-30,000 TPM, tied) combined with its more generous 1,000 RPD (vs. Gemma's 5 RPM ceiling, which is far more restrictive for bursty vision requests) made it the stronger primary despite its Preview status. Gemma's very recent public-preview launch (announced in the weeks immediately preceding this decision) was also noted as an additional stability risk for a fallback path being depended on for resilience.

**Affects:** `vision_integration.py` (retrofit — currently points at a local Ollama vision container and must be re-pointed); `AMENDMENT_INFERENCE_ARCHITECTURE.md`; `docs/TROUBLESHOOTING_RUNBOOK.md` (Preview-status deprecation risk entry, given vision's status as a primary, non-optional feature per DEC-006).

---

### DEC-022 — Platforms Researched and Rejected for Inference
**Status:** CONFIRMED (rejections stand; not revisited unless something material changes)

**Google Gemini / AI Studio:** Rejected. Official and independently-corroborated sources confirm free-tier prompts "may be used to improve Google's products" — directly conflicting with AEGIS's data-privacy design principle, a materially different (and worse) stance than found for either Cerebras or Groq, and inconsistent even with the narrower demo-scoped acceptance recorded in DEC-017 (which was reasoned specifically around Cerebras/Groq's terms, not Gemini's). Additionally, Gemini 2.5 Pro (the strongest reasoning-tier model) was reported removed from the free tier in April 2026, though this specific detail carries lower confidence — some sources describe a heavily throttled remainder (5 RPM/100 RPD) rather than full removal. This ambiguity does not change the rejection, since the privacy issue is independently disqualifying.

**Mistral (La Plateforme):** Rejected. No longer publishes exact free-tier numeric limits; the well-documented "free" offering is actually the consumer chat product (Le Chat, ~25 messages/day), not a genuine production API tier.

**OpenRouter:** Rejected as a primary/default choice. Its base free tier (20 requests/minute, 50 requests/day) is thinner than going directly to Cerebras or Groq, and reaching its better tier (1,000 requests/day) requires a one-time paid credit top-up — disqualifying under the zero-required-spend constraint (DEC-002). Its free-model catalog is also confirmed to rotate without notice (previously-available free DeepSeek models were removed between 2025 and the time of this research), an unacceptable stability risk for a production-quality reference architecture.

**SambaNova:** Excluded, not confirmed-rejected. Official documentation confirms a genuine no-card "Free Tier" exists (distinct from a credit-based "Developer Tier" offering $5 of credit expiring after 3 months), but specific numeric rate limits for the no-card tier could not be located during research. Rather than build routing logic on unverified numbers, SambaNova was excluded from the architecture. This remains open for future reconsideration if someone signs up and checks the actual account dashboard limits directly.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s "platforms considered" appendix.

---

### DEC-023 — Benchmark Methodology Established; Live Numeric Results Not Yet Captured
**Status:** OPEN (methodology CONFIRMED, execution PENDING)

**Decision:** A benchmark script (`aegis_inference_benchmark.py`) was built to test the three selected models against AEGIS's actual prompt shapes — a grounded SAP answer-generation prompt mirroring `reasoning_service.py`'s six-section structure, a CRAG sufficiency-check prompt mirroring `retrieval_engine.py`'s `_stage6_crag` format, and a vision field-extraction prompt mirroring `vision_integration.py`'s expected JSON output — rather than relying on generic published leaderboard benchmarks.

**Status honestly recorded:** the script has not yet been executed against real API keys (`GROQ_API_KEY`, `CEREBRAS_API_KEY` were not available in the environment where this work was performed). Directional evidence from official documentation was recorded in place of live numbers (Cerebras `gpt-oss-120b`: ~3,000+ tokens/second per official hardware claims; Groq `gpt-oss-120b`: ~500 tokens/second per typical LPU throughput).

**Required action before this entry can be marked CONFIRMED:** run the benchmark script 5-10 times per model (free-tier inference speed varies with provider load) and record actual latency and format/groundedness pass-rate figures.

**Affects:** `AEGIS_INFERENCE_MODEL_SELECTION.md` Section 6 (currently an empty template awaiting these results).

---

# PART D — INFRASTRUCTURE ADDITION DECISIONS

---

### DEC-024 — MinIO Re-Added as the 20th Service, Overriding the Final Specification's Omission
**Status:** CONFIRMED (revised — see DEC-034 for a correction to the initial account below)

**Decision:** MinIO (S3-compatible object storage) is added back into the architecture as a genuine 20th service, used for durable storage of original uploaded documents (before ingestion-pipeline chunking) and screenshots (from the primary vision pipeline).

**Historical context (see also `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md` for the full reconciliation):** MinIO was part of the project's early planning — three separate clarification-answer documents from that phase confirm "Docker service count: 20 (including aegis-minio)" as a documented, high-confidence decision at that time, and the `.env.example` template still contains unused `MINIO_*` variables from this era. Direct verification against `IMPL_18_INGESTION_PIPELINE.md`, `IMPL_03_DOCKER_INFRASTRUCTURE.md`, `AEGIS_MASTER_REFERENCE.md`, and `AEGIS_PROJECT_STRUCTURE.md` found zero references to MinIO anywhere in the main document-ingestion path — it was dropped there, likely for demo-simplicity reasons, before the final specs were written. **Correction (DEC-034): this drop was not universal — `IMPL_28`'s Quick Entry screenshot pipeline retained a complete, independent MinIO integration that survived into the final spec, discovered only during a later verification pass.**

**Decision to override the final spec's omission (for the document-ingestion path specifically):** rather than treat MinIO's absence from `IMPL_18` as settled, the developer explicitly chose to reintroduce it there, on the reasoning that it closes a real, still-present functional gap: the current (as-finalized) ingestion pipeline processes uploaded documents transiently with no persistent copy retained. MinIO is a lightweight, self-hostable, S3-compatible solution consistent with DEC-002's zero-recurring-cost, self-contained-infrastructure requirement.

**Estimated resource impact:** approximately 100-150MB RAM for basic usage — does not materially disturb the Oracle 12GB budget established in DEC-009.

**Affects:** `AMENDMENT_OBJECT_STORAGE_MINIO.md` (new); `IMPL_18` (retrofit — write-before-chunk), `IMPL_13` (retrofit — screenshot persistence); `docker-compose.yml` (new service); `.env` (activates the already-present but previously-unused `MINIO_*` variables).

---

# PART E — HISTORICAL DRIFT RECONCILIATION (SUMMARY — FULL DETAIL IN TIER5)

---

### DEC-025 — Four Confirmed Cases of Early-Planning-vs-Final-Spec Drift, and the Authority Rule That Resolves Them
**Status:** CONFIRMED

**Decision:** During a deliberate review of the full specification corpus (prompted by a need to verify completeness of understanding before continuing implementation), four concrete cases were found where early planning documents (`guides/`, the three clarification-answer documents, `.env.example` remnants) describe something that was later changed or dropped by the time the final, authoritative `IMPL_XX` specs and `tier1_foundation` documents were written. In every case, direct verification against the final specs (not the early planning documents) was used to determine current truth:

1. **Production model backend switch:** early planning described a `MODEL_BACKEND=ollama|vllm` environment switch with production models upgrading to Qwen2.5-72B (main), 14B (judge), 72B-vision. Zero mentions found in `IMPL_16_REASONING_SERVICE.md`, `AEGIS_MASTER_REFERENCE.md`, or `AEGIS_CONFIGURATION_CONSTANTS.md`. Confirmed dropped before finalization. (Now additionally moot given DEC-015's move away from self-hosted inference entirely.)
2. **MinIO as a 20th service:** confirmed dropped from the final specs (see DEC-024 for the full account) — but deliberately reintroduced as a new decision, not merely acknowledged as history.
3. **Dual embedding models (BGE-large + BGE-M3 sparse):** early planning specified two embedding models; the final specs use a single `BGE-base-en-v1.5` (768-dimensional, dense only, no sparse component) — confirmed via `AEGIS_DIRECTORY_STRUCTURE.md`'s own explicit "why no BGE-M3 service directory" explanation.
4. **PgBouncer's listening port:** one clarification-answer document incorrectly stated "5432, not 6432" as a correction. Direct inspection of `IMPL_03`'s actual `pgbouncer.ini` configuration (`listen_port = 6432`) and confirmation in `IMPL_05` and `AEGIS_MASTER_REFERENCE` established that 6432 was correct all along; the clarification document itself contained the error.

**Governing rule established by this review:** per the authority hierarchy already stated in the (now-archived) `AEGIS_TIER1_CLARIFICATION_ANSWERS.md` — `IMPL_XX` spec files, then `tier1_foundation` documents, then the `tier0` agent guide, then clarification-answer documents, then narrative/explanatory documents, in that order of authority — any future encounter with a discrepancy between an early-planning document and a final spec should be resolved by checking the final spec directly, not by assuming either document is correct without verification.

**Also resolved during this review:** `IMPL_PATCH_01`, `IMPL_PATCH_02`, and `IMPL_PATCH_03` (three early bug-fix documents) are confirmed, via `IMPL_21_FIX_SESSION.md`'s own explicit text ("This document supersedes IMPL_PATCH_01, IMPL_PATCH_02, and IMPL_PATCH_03"), to be fully historical and absorbed — their content (12 configuration constants, `admin_handler.py`, `postgres_client.py`, five critical bug fixes) matches `IMPL_21` exactly.

**Affects:** `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md` (this decision's full detail belongs there as the lookup-table entries; this log entry is the summary/rationale record of *why* the review was conducted and what governing rule resulted).

---

# PART F — SPECIFICATION STRATEGY DECISIONS (THE META-LAYER)

---

### DEC-026 — Tier Numbering Corrected: tier4 Is Frontend, Not Production
**Status:** CONFIRMED (corrects an error made during this same strategy design process)

**Decision:** New specification tiers introduced for this phase of work are numbered `tier5_historical` and `tier6_production`, not `tier4_production` as originally proposed.

**Error record:** during the design of this specification strategy, a new "tier4_production" placeholder folder was proposed without cross-checking it against the existing tier structure. Direct verification found that `tier4_frontend/` (containing `FRONTEND_01` through `FRONTEND_40`) is already an established tier, confirmed independently in both `AEGIS_DIRECTORY_STRUCTURE.md`'s directory tree and `FRONTEND_MASTER_REFERENCE.md`'s own self-declared "Tier 4" version header. The proposed `tier4_production` would have collided with this existing, real assignment. Corrected to `tier5_historical` (the archive of superseded early-planning documents) and `tier6_production` (the deferred Phase B placeholder), both of which extend the real `tier0` through `tier4` scheme without collision.

**Affects:** The entire specification folder structure; recorded here specifically as a cautionary, verifiable example of why every structural claim in this process was independently checked rather than assumed, even claims made earlier in the same process.

---

### DEC-027 — Two-Phase Implementation Strategy: Complete-and-Correct, Then Production-Harden
**Status:** CONFIRMED

**Decision:** Remaining implementation work is split into two phases. **Phase A** ("Complete & Correct") builds every remaining backend session, Quick Entry session, and frontend session exactly once, incorporating every already-decided adaptation (generalization, inference architecture, MinIO) from the start — not built against the original Sona-specific/Ollama-specific assumptions and patched afterward. **Phase B** ("Production Hardening") — covering real Vault production mode, TLS automation, backup/disaster-recovery procedures, load testing, and final security audit — is deliberately deferred and left undesigned until Phase A exists and has been tested end-to-end, since designing Phase B prematurely means designing against assumptions Phase A might still change.

**Alternative considered and rejected:** building every remaining session exactly as originally specified (including Sona-specific content and Ollama-based inference) and only afterward creating a consolidated "cleanup pass" covering every needed change. Rejected because it requires implementing things already known to be wrong (e.g., a unit test asserting `"Sona Comstar" in prompt`, found in `IMPL_16`'s existing spec text) and then redoing that same work — strictly more effort than incorporating known adaptations from the first pass, with added risk of an overlooked stale reference surviving the cleanup pass.

**Affects:** The entire session-ordering plan; `tier6_production/README.md`'s deliberately minimal placeholder content.

---

### DEC-028 — Specification Amendment Documents: Decomposed by Concern, Not by File or Session
**Status:** CONFIRMED

**Decision:** New specification content required for Phase A is organized into a small number of documents, each representing exactly one distinct, coherent *concern* — not one document per affected file or per implementation session.

**Reasoning, arrived at after explicitly testing the alternative:** an earlier draft of this structure proposed one overlay document per affected session (approximately 16 documents), fragmenting what were actually only two or three distinct concerns (generalization, inference architecture) across many files that happened to be touched by different sessions. This was recognized as fragmenting by the wrong axis — a single concern (e.g., "make the system company-agnostic") benefits from being documented once, comprehensively, with clear internal organization by affected file, rather than duplicated in pieces across many small documents that then risk drifting out of sync with each other (the same failure mode already observed directly in the existing `AGENT_SESSION_GUIDE.md`, which incorrectly states IMPL_21 adds "9 constants" when the verified true figure is 12 — a real, live example of exactly this drift risk).

**Final decomposition, each tested individually against "does merging this with a neighbor lose something, or does splitting it further create duplication":**
- `AMENDMENT_GENERALIZATION_BACKEND.md` and `AMENDMENT_GENERALIZATION_FRONTEND.md`: kept as two documents (not one) because they serve genuinely different audiences (Python/config vs. TypeScript/JSX), with near-zero content overlap.
- `AMENDMENT_INFERENCE_ARCHITECTURE.md`: kept as one document (not split into main/judge/vision sub-documents) because all three roles share the same underlying dual-homing circuit-breaker pattern; splitting risked the three copies drifting into inconsistent conventions.
- `AMENDMENT_OBJECT_STORAGE_MINIO.md`: kept as its own standalone document because it is a distinct infrastructure decision (DEC-024) with its own rationale and change cadence, not a natural fit inside either generalization or inference-architecture documents.

**Affects:** The full `tier1_amendments/` folder contents.

---

### DEC-029 — Decisions Log and Historical Evolution Map Kept as Two Separate Documents
**Status:** CONFIRMED (reverses a merge proposed then reconsidered within the same design process)

**Decision:** `DECISIONS_LOG.md` (this document) and `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md` remain two physically separate files, not merged into one.

**Reasoning:** the two documents serve different query patterns. This log is consulted chronologically, when trying to understand *why* a decision was made and what alternatives were considered — an append-as-you-go diary. The historical evolution map is consulted as a *lookup table*, at the specific moment someone encounters an old document in `tier5_historical/` and needs to know whether its claims are still true. A merge was briefly proposed during this design process on efficiency grounds, then reconsidered and reversed once it was clear that forcing both query patterns into one document's structure would make whichever pattern isn't currently being used harder to find.

**Placement note:** this document (`DECISIONS_LOG.md`) honors a placement already anticipated in the original `AEGIS_PROJECT_STRUCTURE.md`, which references a `DECISIONS_LOG.md` living in `specs/tier3_verification/` — planned at that time but never actually created until now.

**Affects:** File locations only; no content implication beyond what's already stated.

---

### DEC-030 — Verification Embedded Per-Amendment, Not Centralized in a Separate File
**Status:** CONFIRMED

**Decision:** Each `tier1_amendments/` document ends with its own "how to verify this was implemented correctly" section, rather than a parallel, separate verification document per amendment.

**Alternative considered and rejected:** a companion verification-only file for each amendment. Rejected because a specification and the means of verifying it living in separate files is exactly the kind of drift risk (spec changes, verification file doesn't get updated to match, or vice versa) that this entire specification-strategy redesign exists to eliminate.

**Separately, a genuine, wider verification-document redundancy was found and requires consolidation (not a new document) going forward:** three overlapping verification systems currently exist — `ALL_VERIFICATION_DOCUMENTS.md` (containing the originally-planned `VERIFY_01-04` architectural-compliance/health-check level documents), `VERIFICATION_IMPL08_TO_22.md` (a separate, granular per-session "zero tolerance" checklist), and a runbook produced during this same broader process (`VERIFICATION_RUNBOOK_IMPL15_22.md`), built without initial awareness that the first two already existed. These three should be consolidated into one coherent `tier3_verification/` set rather than left as three parallel, partially-overlapping systems.

**Affects:** `tier1_amendments/*.md` (each gains a verification section); `tier3_verification/` (consolidation task, tracked as an open action item, not a document to author from scratch).

---

### DEC-031 — Testing Philosophy Documented Separately from the Checklists Themselves
**Status:** CONFIRMED

**Decision:** `tier3_verification/TESTING_STRATEGY.md` is added as a short standalone document capturing the *philosophy* of how testing is approached for this project (automated test suite as the primary gate, run after every session; the full detailed manual checklist reserved for three milestone checkpoints — after ingestion-pipeline completion, after backend completion, and after full-system completion — rather than after every single session), distinct from the consolidated checklists themselves.

**Reasoning:** this reasoning was established once during this process but was, before this decision, only recorded in conversation rather than in any repository file — meaning it would have been lost or required re-deriving by any future reader (including a future instance of the developer or an implementing agent) encountering the checklists without the surrounding rationale for why they're structured the way they are.

**Affects:** New file in `tier3_verification/`.

---

### DEC-032 — Operational Documents Join the Existing Project-Root `docs/` Folder
**Status:** CONFIRMED (corrects a location conflict identified during final review)

**Decision:** Four new operational documents — `DEV_ENVIRONMENT_SETUP.md`, `CLOUD_DEPLOYMENT_GUIDE.md`, `TROUBLESHOOTING_RUNBOOK.md`, `DEMO_CONTENT_GUIDE.md` — are placed in the project-root `docs/` folder that `AEGIS_DIRECTORY_STRUCTURE.md` already establishes (containing `ARCHITECTURE.md` and `ONBOARDING.md`, created by the setup script), rather than a newly-invented second `docs/` location.

**Error record:** during the design of this specification strategy, a new, separate `docs/` folder was proposed for these four files without checking whether a `docs/` folder already existed elsewhere in the planned structure. Direct verification found one already does. Corrected during final review before any documents were generated.

**Relationship note required in the actual files:** `DEV_ENVIRONMENT_SETUP.md` must explicitly state it is the alternative development-setup path to use instead of the already-planned `ONBOARDING.md`'s WSL2/Docker Desktop instructions, given the local-hardware constraints recorded in DEC-008 — otherwise a future reader encounters two onboarding-style documents with no stated relationship between them.

**Affects:** File placement for all four `docs/` documents.

---

### DEC-033 — Troubleshooting Runbook Added as a New Document Type
**Status:** CONFIRMED

**Decision:** `docs/TROUBLESHOOTING_RUNBOOK.md` is added to capture "if X happens, do Y" operational response guidance for risks already identified during this process but not previously written down anywhere durable — Oracle's idle-instance reclamation policy, Cerebras's 5 RPM ceiling being hit, Groq's daily token caps being exhausted, and (given vision's status as a primary, non-optional feature per DEC-006) the specific risk of Groq's Preview-status Llama 4 Scout being deprecated or materially rate-limited with little notice.

**Reasoning:** these are real, already-identified operational risks, not speculative ones — writing the response plan before something breaks, rather than after, was judged the more mature default.

**Affects:** New file in project-root `docs/`.

---

### DEC-034 — Quick Entry Verification Completed: One MinIO Correction, One New Model-Unification Decision
**Status:** CONFIRMED — resolves OPEN-04

**Decision:** A systematic check of all 7 Quick Entry backend sessions (`IMPL_23-29`) against all four `tier1_amendments/` documents was performed, rather than continuing to defer it. Two real, substantive findings resulted, both corrected in place rather than left as caveats:

1. **`IMPL_28`'s own original spec already contains a complete, independent MinIO integration** — its own upload sequence (`classify_sap()` confidence gate → `put_object()` → DB insert → `extract_sap_content()` → DB update) and its own nightly cleanup job (`cleanup_eligible_screenshots`, version/age-based eligibility rules, a `knowledge_form_screenshots` table) — none of which were known when DEC-024/DEC-025 characterized MinIO as uniformly dropped from the final specs. `AMENDMENT_OBJECT_STORAGE_MINIO.md`'s original `IMPL_28` touchpoint (which assumed no existing integration and specified one from scratch) was corrected to instead reconcile two small naming inconsistencies (a redundant local `SCREENSHOT_MINIO_BUCKET` constant, a redundant bucket-name prefix inside the object key) rather than duplicate logic that already exists correctly.

2. **`IMPL_28`'s `classify_sap()` and `extract_sap_content()` functions hardcode `VISION_SERVICE_URL`/`VISION_MODEL = "llava:13b"`** — a third instance of the direct-Ollama-call pattern (alongside `vision_task.py` and `retrieval_engine.py`, both already covered in `AMENDMENT_INFERENCE_ARCHITECTURE.md`), and, more significantly, **a genuinely different vision model than Qwen2.5-VL-7B, used with no documented rationale found anywhere in the corpus.** Decided to unify both call sites onto the same Groq Llama-4-Scout/Cerebras Gemma-4-31b pair used everywhere else (DEC-021), rather than preserve an unexplained fourth model path. Treated as undocumented drift, consistent with the four cases already reconciled in DEC-025 — not as a deliberate design choice being overridden, since no rationale for the difference exists anywhere to override.

**Other 6 Quick Entry files checked and cleared:** no direct-Ollama-call patterns found in `IMPL_23`, `IMPL_24`, `IMPL_25`, `IMPL_26`, `IMPL_27`, `IMPL_29`. Their "Sona Comstar" references are exclusively document-footer attribution lines (`"IMPL_XX — [title] | AEGIS v1.0 | Sona Comstar"`) — cosmetic spec metadata, not code or instructions, requiring no functional fix.

**Affects:** `AMENDMENT_OBJECT_STORAGE_MINIO.md` (FILE 9 rewritten), `AMENDMENT_INFERENCE_ARCHITECTURE.md` (new FILE 8 added), this log's OPEN-04 (now resolved).

---

### DEC-035 — Expanded Frontend Sweep: Six Additional Touchpoints Found, Including a Genuine Timezone/Locale Category
**Status:** CONFIRMED

**Decision:** A broader sweep of all frontend specification files (beyond the two originally checked when `AMENDMENT_GENERALIZATION_FRONTEND.md` was first written) found "Sona Comstar" referenced in 14 files, not 2. Six additional real, functional touchpoints were identified and added to the amendment: `FRONTEND_01`'s page metadata description, `FRONTEND_05`'s `LoadingScreen.tsx`, `FRONTEND_08`'s `ChatEmptyState.tsx`, `FRONTEND_09`'s `EmployeeTopbar.tsx` (the persistent app header — the most visible touchpoint found), `FRONTEND_SUPPLEMENT_01`'s `formatDateIST`/`formatISTDate` utilities, and `FRONTEND_SUPPLEMENT_02`'s `SessionDocument` PDF component.

**A genuinely different category of generalization issue was found, not just more instances of the company-name issue:** `formatDateIST` hardcodes `timeZone: 'Asia/Kolkata'` and locale `'en-IN'` — a timezone/locale assumption, not a company name. For a deployment outside India, every timestamp in the UI would display in Indian time regardless of where the company actually operates. Resolved by introducing `NEXT_PUBLIC_DEPLOY_LOCALE`/`NEXT_PUBLIC_DEPLOY_TIMEZONE` environment variables (defaulting to the original `en-IN`/`Asia/Kolkata` values, preserving current behavior unchanged), with `formatDateIST` kept as a deprecated alias so existing call sites are not broken.

**Also checked and cleared as cosmetic, not functional:** `FRONTEND_25_DARK_MODE.md`'s "Sona Comstar logo" section is a documentation header only — the actual code beneath it is already generic (a `brightness-0 invert` CSS technique with no hardcoded text). `FRONTEND_MASTER_REFERENCE.md` retains its own company references as a frozen tier4 document (consistent with the tier1_foundation freezing rule) — a note was added to the amendment instead, warning that this document's branding text must not be copied literally into generated code when the document is attached to a session.

**Reasoning this matters beyond just completeness:** the most significant find (`EmployeeTopbar.tsx`) is the persistent header shown on every single page of the employee application — had this been missed, the single most visible piece of UI in the entire product would have continued showing the wrong company's name regardless of every other fix in this amendment.

**Affects:** `AMENDMENT_GENERALIZATION_FRONTEND.md` (FILE 6-11 added), `.env.local` (two new variables).

---

### DEC-036 — A Frozen Tier1 Document That Is Also a Human-Facing Template Gets a Generalized Copy, Not an Exception to the Freeze Rule
**Status:** CONFIRMED

**Decision:** `AEGIS_DOCUMENT_TEMPLATES.md` stays frozen, unedited, per the standing tier1_foundation rule — but a new, generalized, actually-used copy (`docs/DOCUMENT_AUTHORING_TEMPLATE.md`) is created for IT admins to reference when authoring new documents, with `CURRENT_VALUES_AT_SONA_COMSTAR` renamed to `CURRENT_PRODUCTION_VALUES` throughout.

**The tension this resolves:** `AEGIS_DOCUMENT_TEMPLATES.md` is not purely a specification an AI agent implements against — it is also, practically, a template a human IT admin copies verbatim when writing a new SAP document. Freezing it unconditionally (as every other tier1_foundation document is frozen) would mean an admin at any company other than Sona Comstar literally types `CURRENT_VALUES_AT_SONA_COMSTAR:` into their own document, since that's what the frozen reference shows.

**Why this isn't treated as an exception to the freeze rule, but as its correct application:** the freeze rule protects the document's role as a historical record of the original design decision (why the field-detection regex is shaped the way it is). It was never meant to also serve as the live, user-facing artifact people copy from — that role is better served by a separate, actively-maintained document. Creating `docs/DOCUMENT_AUTHORING_TEMPLATE.md` doesn't violate the freeze; it recognizes that one physical document was quietly serving two different jobs, and gives each job its own file.

**Affects:** `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 7; `IMPL_18`'s field-detection logic (must match the new template's field name, not the frozen original's).

---

### DEC-037 — Session 16's Retrofit Must Be Applied Before Session 15's, Despite the Reverse Numeric Order
**Status:** CONFIRMED

**Decision:** When retrofitting already-built code per `AMENDMENT_INFERENCE_ARCHITECTURE.md`, Session 16's `FILE 3` (the `model_gateway.py` full replacement) must be applied before Session 15's `FILE 7` (the `retrieval_engine.py` CRAG retrofit), reversing the sessions' natural numeric order.

**Why this is a hard requirement, not a preference:** the new `call_judge()` signature (`FILE 3`) is `call_judge(self, prompt: str, max_tokens: int = None, temperature: float = None)`. `FILE 7`'s retrofit calls it as `model_gateway.call_judge(crag_prompt, max_tokens=CRAG_MAX_TOKENS, temperature=JUDGE_TEMPERATURE)` — passing keyword arguments the *original* signature (`call_judge(self, prompt: str) -> str`, confirmed directly in `IMPL_16`'s spec text) does not accept. Applying `FILE 7` while the original signature is still in place raises `TypeError` immediately, not a subtle bug — a hard crash on the first CRAG call.

**How this was found:** during a dedicated final verification pass across all delivered specification documents, explicitly checking cross-document dependencies rather than assuming session-numeric order implied a safe application order. This is exactly the kind of ordering constraint that numeric sequencing quietly hides, since Session 15 was originally built before Session 16 in the *original* demo-era implementation — but the *retrofit* order for these two specific amendments is the reverse.

**Affects:** `BACKEND_AGENT_SESSION_GUIDE_v4.md`'s `RETROFIT STATUS` table and the Session 15/16 prompt text — both updated with an explicit warning.

---

### DEC-038 — Vision Retrofit Target Corrected: `clients/ollama_vision.py` (Session 13), Not `tasks/vision_task.py` (Session 11)
**Status:** SUPERSEDED BY DEC-040 — the claim below that `vision_task.py` requires no changes was itself wrong; see DEC-040 for the full correction.

**Decision:** The real Ollama vision calls live in `backend/app/clients/ollama_vision.py`, built by `IMPL_13` (Vision Service), not inline in `backend/app/tasks/vision_task.py` (`IMPL_11`, Zone B Orchestration) as this project's amendments originally assumed.

**How this was found:** the original trace was based on `IMPL_11`'s spec text describing `process_vision_task()`'s Step 3 as a direct Ollama call — reasonable given what was visible at the time, but never verified against the real repository. A full project root-tree paste later revealed `backend/app/clients/ollama_vision.py` as a real, existing file never once referenced in any amendment. Requesting and reading its actual content confirmed: two functions, `classify_sap()` and `extract_sap_content()`, both calling `{OLLAMA_VISION_URL}/api/generate` directly with model `qwen2.5vl:7b` (imported as `MODEL_VISION` from `app.config`) — not `/api/chat` as originally assumed, and with per-function hardcoded timeouts (15s / 30s) rather than one shared timeout constant.

**~~A better outcome than the original design, not just a correction: `vision_task.py` calls into this client rather than making its own request, meaning the actual retrofit surface is smaller than originally built — one file fix (`ollama_vision.py`) covers the entire main employee vision pipeline, and `vision_task.py` itself requires zero changes.~~ This paragraph was wrong — see DEC-040. `vision_task.py`'s real content, obtained afterward, shows it makes its own entirely separate direct call and requires its own retrofit.**

**This also resolves the DEC-034 "LLaVA-13B discrepancy" more cleanly than originally proposed.** `IMPL_28`'s spec text describes building a *separate* vision client hardcoding `VISION_MODEL = "llava:13b"`. Now that the real, generic, reusable `classify_sap()`/`extract_sap_content()` functions are confirmed to already exist and already return exactly the structured data (`ExtractedSAPData`) Quick Entry needs, the correct fix is not a second parallel retrofit — it's having `IMPL_28` **import and call the existing functions** rather than duplicate them. This means Quick Entry inherits Cerebras/Groq routing automatically, the same "already correctly delegates" pattern established for `IMPL_17` (DEC-034), just for a session that hasn't been built yet rather than one being retrofitted.

**A secondary function in the real file, `store_diagnostic_object()`, requires no changes** — pure Redis storage (key format `diagnostic:{session_id}:{screenshot_id}`, 600s TTL) unrelated to inference routing. Quick Entry must not call this function — its own storage (the `knowledge_form_screenshots` table, per `AMENDMENT_OBJECT_STORAGE_MINIO.md`) is separate and already correctly specified.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md` FILE 4 (fully rewritten), FILE 4b (new — explicitly records `vision_task.py` needs no changes), FILE 8 (substantially simplified), the `AGENT INSTRUCTIONS` diagnostic block, and the closing test-suite reference; `BACKEND_AGENT_SESSION_GUIDE_v4.md`'s Session 11 and Session 13 entries (retrofit moved from 11 to 13) and `RETROFIT STATUS` table.

---

### DEC-039 — Three Real Filesystem Paths Corrected After Reviewing the Actual Project Root Tree
**Status:** PARTIALLY SUPERSEDED BY DEC-040's continuation — points 1 and 2 below were later reverted once `docker-compose.yml`'s real content was obtained; see the update at the end of this entry.

**Decision:** A full project root-tree paste (not just `specs/`) revealed three real path/artifact discrepancies between what this project's documents described and the actual repository layout:

1. **TLS certificate location — initially corrected to `secrets-share/infrastructure/nginx/ssl/`, later reverted.** A directory listing showed real cert files at this gitignored path, so `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5 and `docs/CLOUD_DEPLOYMENT_GUIDE.md` were updated accordingly. **Update:** once `docker-compose.yml`'s real content was obtained (not just a directory listing), it showed the actual working mount as `./infrastructure/nginx/ssl:/etc/nginx/ssl:ro` — the bare path. Reverted back to the bare path to match the real, executing configuration, with a note that `infrastructure/nginx/ssl/` may be a symlink into `secrets-share/`, unconfirmed either way — this is the one path question this project's real-file verification has not fully closed.
2. **`.env` location — initially corrected to `secrets-share/.env`, later reverted for the same reason.** `docker-compose.yml`'s real `env_file: - .env` directive (for both `aegis-fastapi` and `aegis-arq`) confirms the project root as the actual resolved path. Reverted `docs/DEV_ENVIRONMENT_SETUP.md` and `docs/CLOUD_DEPLOYMENT_GUIDE.md` accordingly, with the same symlink caveat as above.
3. **`docker-compose.prod.yml` was never addressed anywhere — this finding stands, unaffected by the above.** This file exists in the real project as an unpopulated placeholder, its header comment describing the same superseded `MODEL_BACKEND=vllm` plan already documented in DEC-025 — confirming, independently, the same historical drift finding from a completely different source document. Rather than leave it unused, `docs/CLOUD_DEPLOYMENT_GUIDE.md` now repurposes it for its legitimate use: the production TLS volume mount, deployed via `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.

**Why this matters beyond the individual fixes, including the reversal itself:** a directory listing and a file's actual, real, executing content are different classes of evidence with different authority — the listing told us *a* file existed at a path, but only the real `docker-compose.yml` could confirm *which* path the running system actually uses. Getting this wrong once, then correcting it with better evidence, is recorded here rather than silently overwritten, consistent with this log's own append-only principle.

**Affects:** `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5, `docs/CLOUD_DEPLOYMENT_GUIDE.md` Part 2 and Part 5, `docs/DEV_ENVIRONMENT_SETUP.md` Section 4.5 — all now reflect the reverted, `docker-compose.yml`-confirmed paths.

---

### DEC-040 — Three Further Real Bugs Found From Complete Real File Content: Wrong Function Signature, Missing `depends_on` Fix, and `vision_task.py`/`ollama_vision.py` Confirmed Independent
**Status:** CONFIRMED

**Decision:** Requesting and reviewing the complete, real content of `model_gateway.py`, `docker-compose.yml`, `ollama_vision.py`, `vision_task.py`, and `reasoning_service.py` (rather than partial pastes or spec-text inference) found three further real defects, all corrected:

1. **`select_model_tier()`'s signature was wrong in `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s `FILE 3`.** Written as `select_model_tier(classification: str, mode: str, has_diagnostic_object: bool)`, while the real function is `select_model_tier(enriched_query, retrieval_result, has_diagnostic_object: bool)`, extracting `classification`/`mode` internally from `enriched_query`. This was claimed "preserved verbatim" while actually being rewritten incorrectly — confirmed as a real, breaking bug since `reasoning_service.py`'s actual call site (`select_model_tier(enriched_query, retrieval_result, bool(diagnostic_obj))`) would have raised a `TypeError` against the incorrect signature. Fixed to match the real signature exactly, including the confirmed-real detail that `retrieval_result` is accepted but genuinely unused internally.

2. **`FILE 6`'s Ollama profile-gating was incomplete in a way that would have broken startup entirely.** The real `docker-compose.yml` has `aegis-fastapi` and `aegis-arq` both depending on the three Ollama services via `condition: service_healthy`. Adding `profiles: - local-inference` to the Ollama services (as `FILE 6` already specified) without also removing these four `depends_on` entries would leave FastAPI and ARQ waiting indefinitely for a healthcheck from a container that never starts under the default `INFERENCE_MODE=external` — the single most severe defect found across this entire verification process, since it would have prevented the stack from starting at all. Fixed: `FILE 6` now explicitly instructs removing all four `depends_on` entries.

3. **`vision_task.py` and `ollama_vision.py` are confirmed genuinely independent, not one calling the other.** This reverses the specific conclusion in DEC-038 that `vision_task.py` calls into `ollama_vision.py` — direct inspection of both real files shows `vision_task.py` makes its own separate call to `/api/chat` with its own prompt and parsing, while `ollama_vision.py`'s `classify_sap`/`extract_sap_content` use `/api/generate` with a different prompt strategy. These appear to be two parallel implementations built at different points in the project's history (`IMPL_11` then `IMPL_13`) that were never consolidated — a real pre-existing inconsistency in the original project, not something introduced by this amendment process. Both files now have their own separate, correctly-scoped retrofits (`FILE 4` for `ollama_vision.py`, `FILE 4b` for `vision_task.py`), each preserving its own real local-mode call shape.

**Reasoning this matters beyond the three individual fixes:** every one of these was invisible from spec text alone, and two were invisible even from the *partial* code excerpts reviewed earlier in this process — they only surfaced once complete, real file content was requested and read in full. This confirms, a second time in this project's history (the first being the original vision file mistake), that partial verification creates false confidence look-alikes to real verification. The severity of finding #2 in particular — a defect that would have silently prevented the entire stack from starting — is the clearest evidence yet that requesting complete real files before implementation, not just spec text or excerpts, is not excessive caution but a necessary step for a system of this complexity.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md` FILE 3 (signature fix), FILE 4 and FILE 4b (both now real, separate retrofits), FILE 6 (depends_on fix), the `AGENT INSTRUCTIONS` diagnostic and file list; `BACKEND_AGENT_SESSION_GUIDE_v4.md` Sessions 11 and 13 (both now carry retrofits).

---

### DEC-041 — TLS Certificate Path Question Fully Closed: `infrastructure/nginx/ssl/` Does Not Exist, Fixed With a Symlink
**Status:** CONFIRMED — resolves the last open item from DEC-039

**Decision:** `ls -la infrastructure/nginx/ssl/` returned "No such file or directory" — direct, unambiguous confirmation. Not a symlink, not a populated directory, not present at all. The real certificate files exist only at `secrets-share/infrastructure/nginx/ssl/`. `docker-compose.yml`'s mount (`./infrastructure/nginx/ssl:/etc/nginx/ssl:ro`) was therefore mounting an empty, Docker-auto-created directory — Nginx would have started with no certificate.

**Fix:** create `infrastructure/nginx/ssl` as a symlink into `secrets-share/infrastructure/nginx/ssl`, once. This requires zero changes to `docker-compose.yml` itself — the mount reads through the symlink transparently — and keeps the actual secret material physically inside the gitignored `secrets-share/` folder, never touching git. Applied to `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5 (the symlink creation step, plus the certificate regeneration command now writing to the real physical path) and `docs/CLOUD_DEPLOYMENT_GUIDE.md`.

**`.env` was independently checked and confirmed to follow the identical pattern.** `ls -la .env` also returned "No such file or directory" — exactly matching the TLS certificate case, not merely predicted by analogy. The `infrastructure/nginx/ssl` symlink was created successfully (`ln -s "$(pwd)/secrets-share/infrastructure/nginx/ssl" infrastructure/nginx/ssl`, no errors), and the same fix applied to `.env` per `docs/DEV_ENVIRONMENT_SETUP.md` Section 4.5. Both real-secrets paths in this project now confirmed to follow one consistent, deliberate pattern — a symlinked `secrets-share/` folder for everything git must never see — rather than two independent coincidences.

**Affects:** `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5, `docs/DEV_ENVIRONMENT_SETUP.md` Section 4.5, `docs/CLOUD_DEPLOYMENT_GUIDE.md` Part 2 and Part 5.

---

### DEC-042 — First Real Findings From Claude Code Actually Running the Session 16 Retrofit: One Stale-Local-Copy Issue, One Genuine Spec Bug
**Status:** CONFIRMED

**Decision:** During the first real Claude Code session (the Session 16 retrofit), two discrepancies were found between the amendment documents and either the real code or each other. Both were correctly stopped-and-reported rather than silently worked around — this is the first time this project's `/aegis-retrofit-check` and blocker-reporting discipline was exercised by a real, independent implementation session rather than by this specification-writing process itself, and it worked exactly as designed.

**Finding 1 (not a spec bug — a stale local file).** Claude Code reported `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s `FILE 3` still showing `select_model_tier(classification: str, mode: str, has_diagnostic_object: bool)` — the wrong, pre-correction signature — contradicting this log's own DEC-040, which states the signature was already corrected. Direct verification against the actual current delivered file confirmed the real text already has the correct signature (`enriched_query, retrieval_result, has_diagnostic_object`), with an explicit "CORRECTED against real code" comment. **The file Claude Code read was an older local copy, downloaded before that correction was made, never replaced with the corrected version.** This is a real, practical risk worth naming plainly: a corrected spec document only helps if the corrected copy actually replaces the old one on the machine doing the implementation — a fix delivered here does nothing for a session reading a stale local file. No further correction to the amendment itself was needed; the fix was already there.

**Finding 2 (a genuine, real bug, now fixed).** `AMENDMENT_GENERALIZATION_BACKEND.md`'s `FILE 1` gated both `COMPANY_NAME`/`COMPANY_INDUSTRY` and `ALLOWED_MODULES` behind "apply when building IMPL_18" — but `FILE 3`, applied during the Session 16 retrofit itself (per `BACKEND_AGENT_SESSION_GUIDE_v4.md`'s own instructions), imports `COMPANY_NAME`/`COMPANY_INDUSTRY` immediately. This was a real gap, not a misreading — confirmed directly against the live file. Fixed by splitting `FILE 1`'s gating: `COMPANY_NAME`/`COMPANY_INDUSTRY` now correctly apply during Session 16 (when `FILE 3` actually needs them); `ALLOWED_MODULES` remains genuinely gated to `IMPL_18`, since nothing before that session references it. The overall verification block was split the same way, so running it right after Session 16 (before `IMPL_18` exists) no longer produces a false failure on `ALLOWED_MODULES`.

**Resolution applied, in practice, before this log entry was written:** Claude Code applied `FILE 3`'s retrofit with the already-correct signature (Finding 1), and added only `COMPANY_NAME`/`COMPANY_INDUSTRY` to `config.py` per explicit user confirmation, correctly deferring `ALLOWED_MODULES` (Finding 2) — both decisions now match what the corrected specification documents say, retroactively validating the in-session judgment calls.

**Why this matters beyond these two fixes:** this is real, independent confirmation that the stop-and-report discipline built into `CLAUDE.md` and the slash commands works under actual use, not just in the specification-writing process that originally motivated it. It also surfaces a durable practical lesson: **always confirm you're working from the latest version of any spec file, especially one that's been through visible revision in this log** — a correction recorded here has no effect until the corrected file actually reaches the machine doing the work.

**Affects:** `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 1 (gating split) and its closing verification block.

---

### DEC-043 — Two More Real Findings From Session 10 and Session 13: A Resolved False Lead, and a Genuine Test-Mock Gap
**Status:** CONFIRMED

**Finding 1 — `KEYCLOAK_REALM` resolved to `aegis-realm`, not `nexus-realm`.** During Session 10's retrofit, a suspicion was raised (based on an earlier, unsubstantiated claim in this same conversation) that the real realm name was `nexus-realm`, matching this project's Docker network naming (`nexus-public`, `nexus-app`, etc. — a genuine leftover from an earlier project-naming stage, the same phenomenon as Qdrant's `meridian_errors` collection names). Direct, full-file inspection of `scripts/setup_keycloak.py` found `REALM_NAME = "aegis-realm"` hardcoded once, used consistently across every Keycloak API call including login verification — no environment override, no second constant, no branch. **`aegis-realm` is confirmed correct.** The "nexus" naming pattern is real elsewhere in this project, but was never applied to the realm name specifically — a plausible but incorrect inference from a real pattern, not a genuine spec-vs-code discrepancy.

**Finding 2 — a genuine, real gap in `AMENDMENT_INFERENCE_ARCHITECTURE.md`, found via an actual `pytest` run during Session 13.** `FILE 4`'s retrofit of `ollama_vision.py` is correct, but the amendment never updated `tests/unit/test_ollama_vision.py` to match — two tests (`test_classifies_error_dialog`, `test_extracts_json_data`) mocked the old raw-Ollama response shape, which no longer matches what the retrofitted code actually receives from `inference_providers.call_vision_completion()` under `INFERENCE_MODE=external`. This is the same category of gap as DEC-042's Finding 2 (a spec correctly changing code but not accounting for downstream test impact), just undiscovered until a real test run surfaced it — confirming, again, that this specific failure mode (production code correct, spec's own accompanying test guidance incomplete) recurs across different amendments and is worth watching for deliberately, not assuming solved after one fix.

**Fixed:** `AMENDMENT_INFERENCE_ARCHITECTURE.md` now has a new `FILE 4c` section with the exact test-mock fix, and an explicit proactive warning that `FILE 7` (Session 15's CRAG retrofit) is very likely to have the identical gap in `tests/unit/test_retrieval_stages_6_to_8.py` — flagged now, before that session is attempted, rather than found the same way a second time.

**Affects:** `AMENDMENT_INFERENCE_ARCHITECTURE.md` (new `FILE 4c`, proactive `FILE 7` warning).

---

### DEC-044 — `/health` Never Actually Reported "healthy" Since the Original Build: Two Distinct Bugs, Found by Refusing to Accept "Expected Until Session 18"
**Status:** CONFIRMED

**Decision:** After Session 15's retrofit, `/health` reported `"degraded"` with Qdrant unhealthy. The initial explanation — "Qdrant's 4 collections don't exist because ingestion (`IMPL_18`) hasn't been built yet" — was plausible but wrong, and was directly challenged rather than accepted at face value. Two distinct, real issues were found instead:

**Issue 1 — a runtime gap, not a code bug.** `curl http://localhost:6333/collections` confirmed zero collections existed on this specific container's volume. `scripts/init_qdrant.py` — a `Session 06` deliverable, already built and already passing this project's file-existence audit — was simply never run against this particular fresh Docker volume. Running it created all 4 collections (`meridian_errors`, `meridian_procedures`, `meridian_configs`, `cache_queries`), confirmed 768-dim on every vector, and passed a live insert/search round-trip test. **This is the correct, important distinction to hold onto: creating collection schemas is Session 06's job, done once per environment; populating them with real documents is `IMPL_18`'s job, not yet built.** The earlier explanation conflated the two.

**Issue 2 — a genuine, real code bug, present since the original build, independent of anything retrofitted in this project.** `AEGIS_DATA_CONTRACTS.md` (Section 12, `/health` response schema) specifies every service reports `"healthy" | "unhealthy"` — confirmed directly, line 881: `"opensearch": "healthy | unhealthy"`. But `opensearch_client.py`'s `health_check()` instead passed through OpenSearch's own native cluster-health API value verbatim — `"green"/"yellow"/"red"`, never `"healthy"`. Since `/health`'s aggregator (`main.py`) requires every service to equal the literal string `"healthy"`, **this system could never have reported fully healthy, on any environment, since this file was originally written** — not a regression introduced by any retrofit in this project, a latent bug that simply had never been checked closely enough to notice, because Qdrant's separate, unrelated issue (above) always failed first and masked it.

**The fix, confirmed correct against real domain knowledge, not just a plausible guess:** `"green"` and `"yellow"` now both map to `"healthy"`; `"red"` maps to `"unhealthy"`; the original color is preserved in a new `cluster_color` field, so no diagnostic information is lost. Mapping `"yellow"` to healthy is deliberately correct, not a shortcut — a single-node OpenSearch cluster (`discovery.type: single-node`, confirmed in the real `docker-compose.yml`) can structurally never reach `"green"`, since that status requires replica shards allocated on a second node that doesn't exist in this deployment. Treating `"yellow"` as unhealthy would have permanently blocked a correctly-functioning single-node deployment from ever reporting healthy — exactly the failure this system had been silently living with.

**Why this is worth recording prominently, not just as a routine bug fix:** this is the first time in this project that `/health` has ever genuinely returned `"status": "healthy"` with all services green — confirmed by direct `curl`, not assumed. It was found only because an initial, reasonable-sounding explanation ("this is expected, wait for a later session") was treated as a hypothesis to verify, not a conclusion to accept — the same discipline this whole project has run on, this time applied successfully by the implementation agent itself, unprompted for the second finding, after being prompted only for the first.

**Affects:** `backend/app/infrastructure/opensearch_client.py` (fixed, committed as `e4b8730`). No specification document requires a correction — the original code was simply non-conformant with an already-correct, already-written data contract.

---

### DEC-045 — Session 17 Confirmed Genuinely Complete; Two Real Pre-Existing Gaps Found and Correctly Left Out of Scope; One Real Bug Fixed in `CLAUDE.md` Itself
**Status:** CONFIRMED

**Decision:** Session 17 (Validation Engine) is genuinely complete and correctly implemented — `validation_engine.py` matches `IMPL_17` exactly, 169/169 tests pass, `/health` remains fully healthy, and real (not mocked) DeBERTa calls were confirmed working from inside the Docker network. Two independent checks reported real failures; both were independently verified here and confirmed genuine — but both are pre-existing gaps outside Session 17's own scope, not defects in this session's work.

**Finding 1 — a real regex gap in `output_governance.py` (Session 09, not Session 17).** `postgresql://aegis_user:password@localhost:5432` is not blocked by the existing credential-leak patterns, because they require `PASSWORD`/`PASSWD` followed by `:` or `=`, while in a connection URI the colon precedes the word "password," not follows it. Correctly identified as belonging to a different session's file and left unfixed rather than silently patched outside the stated scope of this session.

**Finding 2 — a real gap between two foundation documents, confirmed directly.** `AEGIS_DATA_CONTRACTS.md` (line 748) explicitly documents a `"correction"` WebSocket message type with a full field structure. `IMPL_17_VALIDATION_ENGINE.md` was checked directly and contains zero mentions of "correction" anywhere — it never implements sending this message type the data contract promises. This is a genuine spec-to-spec inconsistency, present since the original build, not introduced by this session or any retrofit. Session 17 was correctly built to match `IMPL_17` exactly (per `CLAUDE.md` Rule 4 — build what's specified, nothing extra) rather than inventing an implementation for a message type its own governing session document never describes.

**Finding 3 — a real, confirmed bug in `CLAUDE.md` itself, now fixed.** Drift-pattern rule #2 stated "always `from app.config import settings`" — describing a `Settings` class/object that does not exist anywhere in this codebase. The real, verified pattern is flat, module-level constants in `config.py`, imported by name directly (`from app.config import INFERENCE_MODE, ...`). This was found because a real Claude Code session, attempting the rule's literal check, hit an import failure and correctly flagged the contradiction rather than silently working around it. `CLAUDE.md` is corrected to describe the actual pattern.

**A fourth item, flagged but not yet resolved — worth real attention soon, not urgent today:** Postgres authentication for `aegis_user` fails *inside* the container (confirmed during a live pipeline test), meaning Tier 1's transaction-code policy check currently no-ops silently against an empty/unreachable permission table rather than genuinely enforcing anything. This does not block Session 17's own completion, but it is a real gap in a security-relevant check and should be investigated before it matters in a real deployment.

**Affects:** `CLAUDE.md` (drift-pattern rule #2, corrected). `output_governance.py`'s credential regex and the `IMPL_17`/`AEGIS_DATA_CONTRACTS.md` correction-message gap are both tracked here as real, open, future work — not fixed as part of this entry, since neither belongs to Session 17's scope.

---

### DEC-046 — Grafana Provisioning Silently Broken Since Session 03; Two Smaller Real Gaps Found the Same Way

**Status:** CONFIRMED

**Decision:** Session 21's Part C asked for a working Grafana dashboard. Building the dashboard JSON alone would have looked complete on a file listing while remaining entirely non-functional — this was caught only by actually querying Grafana's live API, not by confirming the file existed or that `docker compose up` didn't error.

**Finding 1 — Grafana's dashboard and datasource provisioning has never worked, since Session 03.** `infrastructure/grafana/provisioning/dashboards.yml` and `datasources.yml` existed as flat files directly under `provisioning/`. Grafana 11.3.1 requires `provisioning/dashboards/` and `provisioning/datasources/` as **subdirectories**, each containing a provider-config YAML — not files with those names sitting in the parent directory. `docker compose up` never surfaced this: the container reports healthy regardless, and the only trace is a line in Grafana's own container log (`can't read dashboard provisioning files from directory ... no such file or directory`) that nothing was watching. Confirmed via `curl -u admin:<pw> localhost:3000/api/datasources` returning `[]` before the fix. Fixed by moving both files into the correctly-named subdirectories; confirmed after the fix via the same endpoint returning the `Prometheus` datasource, `GET /api/dashboards/uid/aegis-main` returning all 8 real panels, and — the strongest check, not just "provisioning ran without erroring" — querying live data **through Grafana's own datasource proxy** (`/api/datasources/proxy/uid/prometheus/api/v1/query`), which returned the exact real `aegis_requests_total{status="error"}` value generated by an earlier live end-to-end test in this same session.

**Finding 2 — `audit_log` was granted `INSERT` only, never `SELECT`, since Session 09's original migration.** The append-only rule (`CLAUDE.md`: "no UPDATE or DELETE, ever") was implemented as "no read either," which the rule never actually required — append-only describes write behavior, not readability. This made the new `/admin/audit-trail` endpoint (Session 21) 500 with `asyncpg.exceptions.InsufficientPrivilegeError` on first live test. Fixed with `database/migrations/006_audit_log_select_grant.sql` (`GRANT SELECT` only); confirmed live via `has_table_privilege()` showing `SELECT=true, INSERT=true, UPDATE=false, DELETE=false` — the append-only guarantee is provably still intact, nothing was over-granted.

**Finding 3 — `KEYCLOAK_CLIENT_ID=aegis-backend` has been wrong since the very first scaffold commit, and Session 10's own verification never had a chance to catch it.** No Keycloak client named `aegis-backend` has ever existed — real users authenticate through `aegis-chat` (confirmed identically by `config.py`'s own fallback default, `scripts/setup_keycloak.py`'s actual client list, and the realm's live client list via the admin API). `IMPL_10`'s spec text itself always uses `aegis-chat` correctly, including in its own verification commands — but that verification only ever decodes and prints a token's `sub`, `roles`, and TTL. It never checks `aud` or `azp` against the configured `KEYCLOAK_CLIENT_ID`, so nothing in Session 10's original pass could have surfaced this. It surfaced now only because Session 21's live WebSocket test decoded a real token and got `azp: "aegis-chat"` against a running config of `KEYCLOAK_CLIENT_ID=aegis-backend`, rejecting every login with "Token not issued for this client." Fixed by correcting `secrets-share/.env`; the same mismatch likely still exists in `.env.example`, which was not touched (`secrets-share/.env` is gitignored and takes precedence, but `.env.example` is what any fresh clone copies from — worth a follow-up).

**Affects:** `infrastructure/grafana/provisioning/{dashboards,datasources}/` (restructured), `database/migrations/006_audit_log_select_grant.sql` (new), `secrets-share/.env` (`KEYCLOAK_CLIENT_ID` corrected, not committed). `.env.example`'s stale `KEYCLOAK_CLIENT_ID=aegis-backend` is tracked as OPEN-10 below, left uncorrected pending a decision on whether the scaffold's other placeholder values need the same audit.

---

### DEC-047 — Frontend Has Zero Pre-Existing Component Files: `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s Own "Already Built" Claims Are Directly False for This Checkout

**Status:** CONFIRMED — blocks all frontend F-sessions (F01-F18) from starting as currently written, not resolved here

**Correction to this entry's own first draft:** initially miscited as blocking "Session 22" — that name belongs to a *backend* session (`IMPL_22_FINAL_POLISH.md`, `SPEC_INDEX_AND_CURRENT_STATUS.md` STEP 7), unrelated to the frontend admin pages in question. The actual affected sessions are `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s own **F01-F18** (F19 is already correctly marked fresh-build), specifically **F11-F14** for the admin portal (Admin Shell & Dashboard / Documents & Registry / Gaps, Audit, Review & Tickets / Health & Analytics — the ~7 admin page types, matching the 7 `/admin/*` endpoints `admin_handler.py` now implements). Caught and corrected before being acted on, not after.

**Decision:** Session 21's Part B assumed two files could be *updated*: `frontend/src/hooks/useWebSocket.ts` (FILE B7) and a pre-existing admin shell for `frontend/src/app/admin/page.tsx` (FILE B8) to render into. Neither exists. Checked directly rather than assumed from the spec's phrasing:

```
$ find frontend/src -type f
(nothing — frontend/src/ did not exist before this session)

$ git log --oneline --all -- frontend/
07cb029 Session 21: IMPL_21 Fix and Integration ...     <- this session, created frontend/src/ for the first time
6e047ee Checkpoint: WSL2 migration ...                   <- config files only (tailwind.config.js, tsconfig.json, etc.)
5382913 Session 1: IMPL_01 — Dependencies manifest
e3ca021 Initial AEGIS project structure
```

No commit, ever, in this repository's full history, has added a single `.tsx` or pre-Session-21 `.ts` file under `frontend/src/`. `package.json`, `next.config.js`, `tailwind.config.js`, `tsconfig.json`, `.env.local.example` — scaffolding only.

**This is not a stale-framing inference — the guide makes a direct, checkable, false claim.** `FRONTEND_AGENT_SESSION_GUIDE_v2.md` line 22 states: *"All 18 original sessions are already fully built... every session below except F19 is therefore a RETROFIT... Apply the diffs shown; do not recreate any file from scratch unless a diff block explicitly says to replace the whole file."* Its own `RETROFIT STATUS` table (lines 30-47) marks **F01 through F18 as "Already built,"** including F01 — "PROJECT SCAFFOLD," whose own verification step (`npm run dev` must compile, `npx tsc --noEmit`) cannot pass against an empty `frontend/src/`. Every one of those 18 "Already built" rows is false for this checkout.

**Affects:** `specs/tier0_agent_guide/FRONTEND_AGENT_SESSION_GUIDE_v2.md` — needs the same retrofit-status audit `BACKEND_AGENT_SESSION_GUIDE_v4.md` already received (OPEN-02), starting from F01, not from wherever admin pages happen to be. Tracked as OPEN-11 below.

---

### DEC-048 — Session 23 Quick Entry Prerequisites: 5 of 6 Confirmed Live, 1 Genuinely Blocked, Plus a Real Bug in an Already-Shipped Feature Found Along the Way

**Status:** CONFIRMED

**Decision:** `IMPL_23_QUICK_ENTRY_OVERVIEW.md` Section 7 lists 6 infrastructure prerequisites that must be verified before any Quick Entry code is written. All 6 were checked directly against the real running stack, not assumed. One spec-internal inconsistency was also noted in passing: Section 6.1 describes Quick Entry chunks going into "the existing `aegis_knowledge` Qdrant collection" at "BGE output dimension: 1024" — the real architecture (confirmed throughout this project, and CLAUDE.md's own hard rule) uses four separate collections (`meridian_errors`/`meridian_procedures`/`meridian_configs`/`cache_queries`) at 768 dimensions, and the real OpenSearch index is `sap_documents`, not `aegis_knowledge`. Not itself one of the 6 prerequisites — noted for whoever writes `IMPL_24`'s actual field-addition SQL/mapping, so they don't copy the wrong collection/index name from this document.

**Prerequisite 1 — FAILS, for a more specific reason than the spec's literal check would find.** The spec's literal instruction (`curl http://aegis-ollama-vision:11434/api/health`) would fail simply because that container doesn't exist — correctly, since `INFERENCE_MODE=external` is the live default and Ollama services are profile-gated (`profiles: [local-inference]`, confirmed in `docker-compose.yml`). But the real gate Quick Entry actually depends on is different: `app/clients/ollama_vision.py` (`classify_sap`/`extract_sap_content`) already exists and already branches correctly on `INFERENCE_MODE`, routing external-mode calls through `call_vision_completion()` (Groq primary, Cerebras fallback, circuit-breaker gated) rather than raw Ollama. That path was exercised live: `circuit_registry.get('groq_vision').allows_call` is `True` (circuit closed), but the actual API call returns a real `401 Unauthorized` from `https://api.groq.com/openai/v1/chat/completions` — `GROQ_API_KEY` and `CEREBRAS_API_KEY` are both still the literal placeholder strings from `.env.example` (`<your-real-groq-key>`, `<your-real-cerebras-key>`). The architecture is sound; there is simply no working credential behind it in this environment. This is not a new gap — it's the same condition `OPEN-05` already tracks at the "missing benchmark numbers" level — but this is the first time it's been confirmed as a **hard failure of the actual call path**, not just "we don't have performance numbers yet."

**A more severe finding surfaced while investigating Prerequisite 1: the already-shipped chat screenshot feature (`vision_task.py`) is currently broken under the real default config, and the reason is a stale, self-contradicting amendment document.** `backend/app/tasks/vision_task.py` — the ARQ task behind the *existing* employee chat screenshot upload flow, not anything Quick Entry adds — makes a direct, unconditional `httpx` call to `{OLLAMA_VISION_URL}/api/chat` with zero `INFERENCE_MODE` branching (confirmed via `grep`: no import of `INFERENCE_MODE`, `ollama_vision`, `classify_sap`, or `call_vision_completion` anywhere in the file). Under the live default `INFERENCE_MODE=external`, `aegis-ollama-vision` doesn't exist, so every real employee screenshot upload fails at the connection level.

Tracing why: `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s `FILE 4b` section (`backend/app/tasks/vision_task.py`) still reads *"NO CHANGE REQUIRED... Do not modify this file — the earlier version of this amendment incorrectly targeted it"* — this is `DEC-038`'s conclusion, word for word. But `DEC-038` was itself superseded by `DEC-040` (point 3), which found `vision_task.py` makes its own entirely separate call and **does** need its own retrofit, and stated `FILE 4b` had been rewritten into "a real, separate retrofit... preserving its own real local-mode call shape." That rewrite was apparently never actually carried out — the amendment document's `FILE 4b` text is still the old, DEC-038-era placeholder, and no session in this project's history has ever applied a real fix to `vision_task.py`. `SPEC_INDEX_AND_CURRENT_STATUS.md`'s own STEP 2 line had the same problem — still citing `DEC-038`'s superseded claim — corrected as part of this entry.

**Why this wasn't caught earlier:** nothing in this project's prior sessions ever ran a live vision call against the real default `INFERENCE_MODE=external` configuration — Session 21's live verification exercised WebSocket auth, admin endpoints, and metrics, but not a screenshot upload; Sessions 11/13's own verification predates the external-inference pivot entirely. This is the first live test of this specific path.

**Prerequisites 2 through 6 — all confirmed live, real evidence for each:**
- **Prerequisite 2 (MinIO bucket) — already satisfied**, as a side effect of Session 18/21's MinIO work: `config.py`'s `MINIO_BUCKET_SCREENSHOTS` default is already `"knowledge-screenshots"`, the exact name `IMPL_23`'s own constants section (`SCREENSHOT_MINIO_BUCKET`) specifies. Confirmed live: bucket exists, no public policy set (private by default), a real put/get/delete round-trip succeeded, and the pre-existing `aegis-documents` bucket plus overall MinIO health are both untouched.
- **Prerequisite 3 (Postgres migration not yet run) — confirmed, as expected.** None of the 4 planned tables (`knowledge_form_entries`, `knowledge_form_entry_versions`, `knowledge_form_entry_chunks`, `knowledge_form_screenshots`) exist in the live database; no migration file for them exists on disk either (`database/migrations/` tops out at `006_`). Applies to Session 24, not this one.
- **Prerequisite 4 (OpenSearch mapping unchanged) — confirmed, as expected.** Queried the real `sap_documents` mapping directly: none of the 7 planned fields (`source_type`, `form_entry_id`, `version`, `has_screenshots`, `screenshot_ids`, `is_stale`, `original_quality_score`) are present.
- **Prerequisite 5 (ARQ graceful reload) — confirmed.** Queue depths are readable (`redis_queue.get_queue_depths()`, all 0, AOF enabled). Graceful SIGTERM handling is ARQ's own library-level default, not something AEGIS code implements — confirmed `arq_worker.py`'s `WorkerSettings` (read in full during Session 21) has no signal-handling override, and Docker's default 10s stop grace period is ample headroom for this worker's `job_timeout=180` bound. Not synthetically tested with a live in-flight job (queue was empty at check time), since that would mean enqueueing a throwaway job purely to interrupt it — noted as a real limitation of this check, not a claim of having exercised the actual drain path.
- **Prerequisite 6 (Redis `qe_rate:` namespace) — confirmed.** `KEYS qe_rate:*` returns empty (no collision with anything in current use — the only prefix presently in Redis Instance 1 is `session:`). A live write/read/delete round-trip using `ZADD`/`ZRANGE` (the sorted-set structure the spec itself specifies for the sliding-window counter) succeeded.

**Affects:** `specs/SPEC_INDEX_AND_CURRENT_STATUS.md` (STEP 2 citation corrected). `AMENDMENT_INFERENCE_ARCHITECTURE.md` `FILE 4b` and `backend/app/tasks/vision_task.py` both still need the real fix `DEC-040` announced but never delivered — tracked as `OPEN-12`, not applied here (Session 23 is read/verify-only, no application code). `OPEN-05`'s existing scope is narrower than what's now confirmed for Prerequisite 1 — tracked separately as `OPEN-13` rather than overloading `OPEN-05`'s original "benchmarks missing" framing with "the call path returns a hard 401."

---

### DEC-049 — OPEN-12 Resolved: `vision_task.py` Retrofitted for Real; This Entry Also Corrects `DEC-048`'s Own Root-Cause Theory

**Status:** CONFIRMED

**Decision:** `DEC-048` (this same day) framed `OPEN-12` as "the fix `DEC-040` announced but never delivered" without a settled theory of *why*. The user's first hypothesis — the same class of issue as `DEC-039`'s "stale local copy" finding, where a corrected file existed somewhere and simply hadn't been synced into this repo — was checked directly rather than assumed either way, since it changes what the right first step is (sync a file vs. write one from scratch).

**The stale-copy theory does not hold, checked exhaustively:** a full filesystem search (not just this repo's git history) found two more copies of `AMENDMENT_INFERENCE_ARCHITECTURE.md` beyond the one already known:
1. A separate project clone on the Windows D: drive (`/mnt/d/Program Files/aegis-project`) — same stale "NO CHANGE REQUIRED" `FILE 4b` text. This clone is confirmed **older**, not a source of truth: its `git log` stops around `IMPL-16` (Reasoning Service), and a live `diff` against the real `vision_task.py` shows it's even missing Session 21's edits (keyword-only args, `VISION_TASKS` metric calls). Its `origin` remote is `ittrainee26/aegis-sap-helpdesk.git` — almost certainly the original internship repo, abandoned since roughly Session 16.
2. A file in the user's Windows Downloads folder — older still, confirmed by its own structure: it targets `vision_task.py` directly as `FILE 4` with no separate `ollama_vision.py` entry at all, which is exactly the *pre*-`DEC-038` assumption (before `ollama_vision.py` was discovered as the real client location). This file predates the bug it was meant to fix even existing as a known bug.

**The real root cause: `DEC-040`'s own text overstated what was actually done.** `DEC-040` (point 3) asserted `vision_task.py` and `ollama_vision.py` were "confirmed genuinely independent" and that "both files now have their own separate, correctly-scoped retrofits... each preserving its own real local-mode call shape." The independence finding was correct and real. The claim that `vision_task.py`'s retrofit had actually been *written* was not — no copy of that retrofit exists anywhere checked (this repo, the D: drive clone, or the Downloads folder). The session that produced `DEC-040` described, in prose, a fix it intended to make or believed it had made, but the corresponding file edit never happened. This is a distinct failure mode from `DEC-039`'s — not "a good copy went unsynced," but "a decisions-log entry recorded an intention as if it were a completed action."

**Resolution — the real retrofit, written and applied for the first time:** Added a real `FILE 4b` to `AMENDMENT_INFERENCE_ARCHITECTURE.md`, mirroring `ollama_vision.py`'s already-correct pattern (`INFERENCE_MODE` branch; external mode routes through `call_vision_completion()` with circuit-breaker gating) while preserving `vision_task.py`'s own real call shape (`/api/chat` with a `messages` array, not `ollama_vision.py`'s `/api/generate`). New module-level `_run_vision_extraction()` deliberately shares the `"groq_vision"`/`"cerebras_vision"` circuit breaker keys with `ollama_vision.py`, since both call the same underlying provider models — confirmed live: after `ollama_vision.py` had already tripped the Groq circuit during `DEC-048`'s testing, this function's own live test correctly fell through straight to Cerebras, proof the shared state genuinely works rather than two independent, uncoordinated circuits. Also corrected two more instances of the same stale "`vision_task.py` needs no changes" claim (the `FILE 4` intro section and the amendment's own files-changed list).

**Verified live:** `grep -n "INFERENCE_MODE\|call_vision_completion" backend/app/tasks/vision_task.py` now shows both; a direct call to the new `_run_vision_extraction()` against a real 1x1 test PNG returns a genuine `401 Unauthorized` from Cerebras's real API (not a connection failure to a nonexistent host) — architecturally correct, blocked only by `OPEN-13`'s placeholder keys, exactly matching `ollama_vision.py`'s already-confirmed behavior. All 188 existing unit tests still pass. `/health` and all 17 containers remain healthy after rebuild.

**OPEN-12 is now RESOLVED** — see the registry entry below, not deleted, per this log's append-only principle.

**Affects:** `backend/app/tasks/vision_task.py` (real fix applied), `AMENDMENT_INFERENCE_ARCHITECTURE.md` (`FILE 4b` rewritten, two other stale references corrected). `OPEN-13` (placeholder Cerebras/Groq keys) remains open and is the one remaining blocker before Session 24.

---

### DEC-050 — Session 24 (Quick Entry Data Model): "SQLAlchemy" Doesn't Match This Codebase, `aegis_knowledge` Corrected in 4 Documents, `users` Table Doesn't Exist

**Status:** CONFIRMED

**Decision:** Session 24's kickoff text named "SQLAlchemy data models" as this session's deliverable, twice. Checked directly before writing anything: `sqlalchemy[asyncio]==2.0.36` is in `requirements.txt` but `grep -rln sqlalchemy backend/app/` returns nothing — a declared, never-used dependency. Every service/task/handler in this 23-session codebase uses raw `asyncpg`/`postgres_client.py` directly; the established convention for structured data types is plain `@dataclass` (`app/models/session.py`, `app/models/retrieval.py`), not an ORM. `alembic` (which `IMPL_24`'s own text names as the migration location, `alembic/versions/`) isn't installed anywhere. Asked directly rather than silently picking either interpretation — built with dataclasses (`backend/app/models/quick_entry.py`) and a numbered `.sql` migration (`database/migrations/007_quick_entry_tables.sql`, applied the same way as migrations 001-006), not SQLAlchemy/Alembic.

**`aegis_knowledge` corrected in 4 documents, not just noted.** `IMPL_24` Sections 5/6, and the Quick-Entry sections already appended to `IMPL_05`/`IMPL_06`/`IMPL_07` (by some earlier, unlogged process — these additions existed before this session touched them), all reference a single `aegis_knowledge` Qdrant collection and OpenSearch index. Neither has ever existed in this architecture (first flagged as an aside in `DEC-048`, resolved for real here): the real setup is 4 separate Qdrant collections (`meridian_errors`/`meridian_procedures`/`meridian_configs`, plus the unrelated `cache_queries`) and a single OpenSearch index, `sap_documents`. All 4 documents corrected in place. The OpenSearch mapping update was applied to the real `sap_documents` index directly — `curl -X PUT ".../sap_documents/_mapping"` — not the nonexistent name.

**The migration's own seed-data block is unrunnable against this real schema.** `IMPL_24` Section 8's `INSERT INTO knowledge_form_entries` fixture references `(SELECT id FROM users WHERE role = 'it-admin' LIMIT 1)` — this schema has no `users` table (confirmed: `SELECT tablename FROM pg_tables` lists 13 tables, none of them `users`). Real user identity lives entirely in Keycloak; every other UUID "owner" column in this codebase (`audit_log.user_id_hash`, etc.) is an opaque reference, never a local FK. Excluded from migration 007 — onboarding-fixture content is a later, UI-facing session's job, not Phase 1.1's.

**A grant the spec's migration text omits, added anyway.** None of `IMPL_24`'s DDL includes a `GRANT` for `aegis_app_role` on the 4 new tables — an omission that would have reproduced the exact `audit_log` INSERT-only-no-SELECT bug found and fixed in migration 006 (`DEC-046`). Added `GRANT SELECT, INSERT, UPDATE, DELETE` matching migration 004's pattern for every other operational table; confirmed live via `has_table_privilege()` on all 4 tables.

**Verified live, not assumed:** table count 13 → 17 after migration, diff shows only additions; `documents_registry`'s column count and full `\d` output unchanged; all 4 new tables carry full CRUD grants; OpenSearch mapping gained 6 genuinely new fields (`chunk_type` already existed from the original Session 07 build, despite `IMPL_24` calling it one of "7 new fields") with document count and existing mappings untouched (0 documents before and after); a real `ErrorGuideFormData` dataclass was inserted as JSONB, read back, and reconstructed into a dataclass identical to the original; all 188 existing unit tests pass.

**Affects:** `database/migrations/007_quick_entry_tables.sql` (new), `backend/app/models/quick_entry.py` (new), `specs/tier2_implementation/IMPL_24_QUICK_ENTRY_DATA_MODEL.md` / `IMPL_05` / `IMPL_06` / `IMPL_07` (all corrected in place, not left stale for the next reader).

---

### DEC-051 — PgBouncer Bypass Fixed: `aegis_pooled_role` Replaces `postgres` as PgBouncer's Backend Identity; `vault_client.py` Now Dead Code

**Status:** CONFIRMED

**Decision:** `POSTGRES_HOST`/`POSTGRES_PORT` in `secrets-share/.env` pointed directly at `aegis-postgres-primary:5432`, not `aegis-pgbouncer:6432` — PgBouncer's entire purpose (pooling, `DATABASES_POOL_SIZE=20`, `PGBOUNCER_MAX_CLIENT_CONN=100`) was being completely bypassed. Before correcting this, investigated directly rather than just flipping the env var: connected through PgBouncer with a real Vault-issued dynamic credential and ran `SELECT current_user` — it reported `postgres`, not the credential actually presented. Root cause: PgBouncer's `auth_type=any` only governs how it authenticates the *client* connecting to it; it always connects to the real backend using its own static `DATABASES_USER`/`DATABASES_PASSWORD` (previously `postgres`, the superuser), regardless of what the client presented. This means PgBouncer structurally cannot pool connections while passing through Vault's uniquely-named, ~hourly-rotating dynamic credentials (`OPEN-09`/`DEC-046`'s design) — every pooled query was silently running with full superuser privileges.

Presented 3 resolution options directly rather than picking one silently: (1) fixed least-privilege role as PgBouncer's backend identity, (2) reconfigure PgBouncer into `auth_query` pass-through mode, (3) leave PgBouncer bypassed. Chose (1): migration 008 creates `aegis_pooled_role` (`LOGIN IN ROLE aegis_app_role`, no privileges beyond that — the same ceiling every Vault-issued dynamic role already has), with its password generated separately and never committed. `docker-compose.yml`'s `aegis-pgbouncer.DATABASES_USER`/`DATABASES_PASSWORD` point at this role instead of `postgres`. `postgres_client.py` was rewritten to a simple static-credential pool (Vault's per-request rebuild logic removed), and 10 other call sites (`ingestion_pipeline.py`, `retrieval_engine.py`, `query_intelligence.py`, `validation_engine.py`, 4 task files, 2 handlers) switched from `vault_client.get_postgres_credentials()` to the same static `POSTGRES_USER`/`POSTGRES_PASSWORD` constants.

**This is a deliberate trade-off, not an oversight:** connections routed through PgBouncer lose Vault's per-request unique/auto-expiring/individually-revocable credential properties in exchange for genuine connection pooling. `vault_client.py` itself is now unused by any Postgres call site in this codebase — left in place rather than deleted, since removing infrastructure wasn't explicitly requested. See `OPEN-14`.

**A second, previously-latent bug surfaced by this fix, not introduced by it:** with connections now genuinely routing through PgBouncer's `transaction` pool_mode, asyncpg's default prepared-statement cache broke immediately — `asyncpg.exceptions.DuplicatePreparedStatementError`, confirmed live, with asyncpg's own error message correctly diagnosing the pool_mode incompatibility. This was never triggered before because every connection bypassed PgBouncer entirely. Fixed by adding `statement_cache_size=0` to all 16 `asyncpg.connect()`/`asyncpg.create_pool()` call sites in the codebase (every one of them, not just the new Quick Entry code).

**Verified live:** `SELECT current_user` through PgBouncer reports `aegis_pooled_role`; `SELECT rolsuper` for that role is `false`; the role is confirmed a member of `aegis_app_role` only; `/health` reports `postgres: healthy` through the application's own pool; a full Quick Entry create → process → active run succeeded end-to-end through the pooled connection.

**Affects:** `database/migrations/008_pgbouncer_pooled_role.sql` (new), `docker-compose.yml` (`aegis-pgbouncer` env), `backend/app/infrastructure/postgres_client.py` (rewritten), `backend/app/infrastructure/vault_client.py` (now dead code, see `OPEN-14`), and the 16 `asyncpg` call sites listed in this session's commit.

---

### DEC-052 — `aegis_vision_tasks_total` Was a Fixable Multiprocess-Directory Gap, Not an Architectural Limit

**Status:** CONFIRMED

**Decision:** An earlier report characterized `aegis_vision_tasks_total`'s absence from `/metrics` as a "genuine architectural limit." Challenged directly rather than accepted: the correct question was whether `aegis-arq` was configured to write into the same Prometheus multiprocess directory `aegis-fastapi`'s workers use. It was not — `aegis-arq` had no `PROMETHEUS_MULTIPROC_DIR` set at all, and `aegis-fastapi`'s existing directory was a container-local path, not a shared volume, so even setting the env var alone would not have aggregated the two processes' metrics. This is the same multiprocess-mode gap already fixed once for the uvicorn workers, simply never extended to the ARQ worker process — a real, small, fixable bug, not a hard limit.

Fixed with a new named volume, `aegis-prometheus-multiproc`, mounted at the same path in both `aegis-fastapi` and `aegis-arq`, with `PROMETHEUS_MULTIPROC_DIR` set identically in both. `aegis-fastapi`'s startup command no longer wipes this directory on boot (`rm -rf` removed) — now that the directory is shared, wiping it on one container's independent restart would destroy the other's live per-PID metric files. Trade-off, disclosed directly: stale per-PID files from long-dead processes now accumulate across restarts instead of resetting cleanly, acceptable for this project's scale.

**Verified live, not just configured:** ran a real vision task through the ARQ worker (Cerebras returned a real `401` — a separate, already-open issue, `OPEN-13` — not a connectivity failure) and confirmed `aegis_vision_tasks_total{status="failed"} 1.0` genuinely appears in `aegis-fastapi`'s `/metrics` output, written by the separate ARQ worker process.

**Affects:** `docker-compose.yml` (`aegis-prometheus-multiproc` volume, `aegis-fastapi`/`aegis-arq` commands and mounts).

---

### DEC-053 — Session 26/27 Built: Quick Entry Processing Pipeline + Chunking Engine; `IMPL_26`'s Reused Quality Scorer Doesn't Exist

**Status:** CONFIRMED

**Decision:** Session 25 shipped Quick Entry's create/update endpoints with `process_form_entry` enqueued via a deliberate, disclosed stub (`TODO(IMPL_26/Session 26)`) — real, currently-broken user-facing behavior (entries with `publish=true` queued a job for a function that didn't exist). Built for real: `backend/app/services/form_chunker.py` (structure-aware chunking per `IMPL_27` — error_guide/procedure/config, branch-aware step batching), `backend/app/tasks/process_form_entry.py` (the 13-stage processing task per `IMPL_26`), `backend/app/tasks/retry_partial_indexing.py`, both registered in `arq_worker.py`.

**`IMPL_26`/`IMPL_23` both describe Quick Entry's quality-scoring stage as reusing an existing service from the document ingestion pipeline's "Stage 8."** Checked directly before building anything: the real `ingestion_pipeline.py` has no quality-scoring stage at all (its actual 11 stages are format validation, extraction, field detection, schema validation, content validation, chunking, embedding, Qdrant, OpenSearch, KG, registry — confirmed by reading the file, not the spec's stage-numbering claim), and no scoring formula exists anywhere in `specs/`. Asked directly rather than inventing a formula silently or silently dropping the quality gate: built a new, small heuristic scorer (`backend/app/services/quick_entry_quality.py`) — average of length adequacy, specificity (reusing the existing `query_intelligence_service.extract_sap_entities()`), and placeholder-text absence — scoped only to Quick Entry, calibrated against the existing `QUICK_ENTRY_QUALITY_THRESHOLD = 0.65`.

**Other real spec-vs-reality gaps found and corrected while building, not left stale:**
- Qdrant routing: `IMPL_26` assumes a single `aegis_knowledge` collection (the same stale assumption `DEC-050` already corrected in 4 other documents); real code routes by `content_type` to `meridian_errors`/`meridian_procedures`/`meridian_configs`, and every point needs both `content`/`identity` named vectors, not the single vector `IMPL_26`'s pseudocode uses.
- `knowledge_gap_events` (real table name; `IMPL_26` calls it `gap_events`) had no `addressed_by_entry_id`/`addressed_at` columns for the reverse link `IMPL_26` Stage A13 needs — migration 007 already added the forward link (`knowledge_form_entries.gap_id`) but the reverse side was never added anywhere. Migration 009 completes it.
- `CURRENT VALUES AT SONA COMSTAR:` (`IMPL_27`'s own literal chunk-text label) generalized to `CURRENT PRODUCTION VALUES:`, matching the precedent already set for the document pipeline's equivalent label (`AMENDMENT_GENERALIZATION_BACKEND.md`, `CURRENT_VALUES_AT_SONA_COMSTAR` → `CURRENT_PRODUCTION_VALUES`).

**Two real bugs caught by live verification, not left for a future session to find:** (1) `retry_partial_indexing.py`'s payload-rebuild helper referenced an undefined `entry_id` name — caught when a live retry run logged `name 'entry_id' is not defined` instead of actually failing over to Qdrant/OpenSearch. (2) `arq_worker.py`'s `startup()` connected `redis_session`/`redis_queue` but never the `arq_client` singleton — process_form_entry's own partial-index/screenshot follow-up enqueues, and retry_partial_indexing's backoff re-enqueue, all call `arq_client` from *within the ARQ worker process*, which is a separate Python process from FastAPI (whose `main.py` startup connects its own copy). A live retry run crashed with `AttributeError: 'NoneType' object has no attribute 'enqueue_job'` before this was fixed. Both fixed and re-verified live.

**Verified live, not just unit-tested:** a real error_guide entry processed end-to-end to `active` with 2 real chunks confirmed present in `meridian_errors` (Qdrant) and `sap_documents` (OpenSearch) with correct payloads; a simulated `partial_index` entry recovered via `retry_partial_indexing` (`qdrant_fixed: 1, os_fixed: 1`); the `knowledge_gap_events` reverse link confirmed written (`addressed_by_entry_id`/`addressed_at` set) for a gap-originated entry. 24 new unit tests added (`test_form_chunker.py`, `test_quick_entry_quality.py`); full suite (237 tests) passes.

**A follow-up pass re-verified this end-to-end through the real HTTP API (not a direct DB insert)** — a genuine, additional check, since the first verification pass used direct DB inserts to isolate the processing pipeline from the auth/handler layer. Cross-checked `backend/app/services/form_chunker.py`'s field access against `AEGIS_DATA_CONTRACTS.md`'s canonical `CauseBlock`/`ProcedureStep`/`CommonError`/`RelatedError`/`CurrentValuesGroup` interfaces and `process_form_entry.py`'s `ProcessingLogBuilder` output against the same document's `ProcessingLog` interface — both match exactly, no corrections needed. Confirmed `AEGIS_CONFIGURATION_CONSTANTS.md` is a frozen, pre-Quick-Entry document with no Quick Entry section at all (not even Session 25's constants) — consistent with this project's frozen-document policy, so `IMPL_23` Section 9's instruction to add constants there was not followed, matching the same precedent as `DEC-036`.

**A real, separate doc-vs-reality gap found while obtaining a test JWT for this API-level check:** `docs/ONBOARDING.md` documented login credentials (`employee@sonacomstar.com`/`admin@sonacomstar.com`, password `aegis2024`) that don't exist in Keycloak — confirmed live via a real ROPC token request (`invalid_grant: Invalid user credentials`). The actual seeded users, per `scripts/setup_keycloak.py`, are `employee1`/`Employee@123` and `itadmin1`/`ITAdmin@123`. Corrected in place. **A second, more serious drift found in the same request attempt, not yet corrected:** `secrets-share/.env`'s `KEYCLOAK_CLIENT_SECRET` does not match the value `setup_keycloak.py` actually configures in Keycloak (`aegis_chat_client_secret_dev`) — confirmed live, the real env value produced `unauthorized_client`/`Invalid client or Invalid client credentials`, and only the script's hardcoded literal succeeded. `frontend/src/app/api/auth/login/route.ts` uses this exact same env var for its own ROPC exchange, so **this would break real employee/admin login the moment the frontend is deployed and used** — it is not a live outage today only because no frontend container is currently running in this stack (confirmed: `docker compose ps` shows no frontend service). Not fixed in this pass since it's outside Session 26/27's scope and which value should be considered authoritative (rotate Keycloak to match `.env`, or correct `.env` to match the script) wasn't decided — flagged as a new open item, see `OPEN-15`.

**Affects:** `backend/app/services/form_chunker.py` (new), `backend/app/services/quick_entry_quality.py` (new), `backend/app/tasks/process_form_entry.py` (new), `backend/app/tasks/retry_partial_indexing.py` (new), `backend/app/workers/arq_worker.py`, `database/migrations/009_gap_events_entry_link.sql` (new), `backend/app/config.py` (`QUICK_ENTRY_QUALITY_THRESHOLD`, `QUICK_ENTRY_DEDUP_THRESHOLD`, `CHUNK_STEPS_PER_BATCH`, `CHUNK_BRANCH_MAX_TOKENS`).

---

### DEC-054 — Session 27 Built: Version/Restore + Feedback-Summary Endpoints (Phases 1.8, 1.10); Real Versioning Bug Found in Already-Shipped Session 25 Code

**Status:** CONFIRMED

**Decision:** Closes out `IMPL_25` entirely: `GET /{id}/versions`, `POST /{id}/restore/{version}`, `GET /{id}/feedback-summary`, plus wiring the real feedback batch join into `list_entries` (previously a disclosed zero-value placeholder, per Session 25's own comment, pending this session).

**Same class of table-name/column-name gap as every prior Quick Entry session, found before building, not after:** `IMPL_25`/`IMPL_29` both assume a `feedback` table with `rating`/`source_form_entry_id` columns. The real table (from the original 22-session build) is `feedback_events`, with a `feedback_signal` column (not `rating`) and, until this session, no way to link a row back to the Quick Entry that sourced the answer at all. `IMPL_29` Section 3.1 itself notes this column depends on a migration from `IMPL_28` (screenshot vision, not yet built) — added it now via migration 010 (`feedback_events.source_form_entry_id UUID NULL`) so the endpoint is genuinely queryable; it correctly reports zero counts until `IMPL_28`'s WebSocket handler starts populating the column on feedback submission.

**A real, pre-existing bug in Session 25's `update_entry()`, found while building `restore_version()` against the same pattern, not introduced by this session:** both functions tried to `INSERT` a `knowledge_form_entry_versions` snapshot row for the CURRENT (about-to-be-superseded) version at the moment of update/restore. But `create_entry()` already eagerly writes a row for version 1 at creation time — so the very first publish-triggering update or restore of ANY entry hit `asyncpg.exceptions.UniqueViolationError` on `uq_kfev_entry_version`, confirmed live (`restore_version` returned a real `500` on first attempt, not a hypothetical). This bug was live in already-merged, already-"verified" Session 25 code the whole time — Session 25's own live verification exercised create/list/get/update/archive individually but apparently never a real create→publish→update-with-publish=true cycle, so it never actually collided during that pass. Fixed both functions to snapshot the NEW version being created instead (matching `create_entry()`'s existing eager-insert pattern) — every version number now gets exactly one row, written once, at the moment it becomes current, in all three code paths (create/update/restore) consistently.

**Deliberately not built this session, disclosed rather than silently skipped:** negative-feedback notifications and the `admin_notifications` table (`IMPL_29` Section 3.2). `IMPL_23` Section 10 tags Phase 1.10 as sourced from both `IMPL_25` and `IMPL_29`, but Section 3.2 is a separate, larger feature (new table, alerting/cooldown logic, notification-bell UI) that belongs with the rest of `IMPL_29`'s Phase 3.x content (rate limiting, bulk import, pipeline health, gap write-back) — the same "Session 29" scope the kickoff prompt itself defers to, not this session's endpoint work.

**Verified live through the real HTTP API with a real Keycloak JWT** (same `itadmin1`/`ITAdmin@123` credentials `DEC-053`'s addendum established): created a real entry, confirmed version 1 in history, restored it (version 2, genuinely re-processed to `active` via a real ARQ run), confirmed 2 versions in history with correct `change_summary` text; inserted real `feedback_events` rows and confirmed both the single-entry endpoint and `list_entries`' batch join return matching, correct aggregates; all 404 paths (nonexistent entry on all 3 endpoints) and the 409 path (restoring an archived entry) confirmed live. Full existing suite (237 tests) passes, no regressions.

**Affects:** `backend/app/handlers/knowledge_entries_handler.py` (`list_entries`, `update_entry` bug fix, 3 new endpoints), `database/migrations/010_feedback_events_form_entry_link.sql` (new).

---

### DEC-055 — Session 28 Built: Screenshot Pipeline (Phase 2 Complete); `classify_sap()` Has No Confidence Signal, Rejection Derived From Extraction Instead

**Status:** CONFIRMED

**Decision:** All 5 sub-parts of Phase 2 built: upload endpoint (2.2), `enrich_entry_screenshots` ARQ task (2.3), lifecycle cleanup job (2.4), the internal screenshot-serving route (2.5), reusing the existing, already Cerebras/Groq-routed vision client (`app/clients/ollama_vision.py`) per `AMENDMENT_INFERENCE_ARCHITECTURE.md` FILE 8 — no separate vision client built, no self-hosted model hardcoded. Confirmed via grep (both case-insensitive, both zero results, not just "only in explanatory comments" — reworded two docstring mentions that would otherwise have technically matched): `llava` and `VISION_SERVICE_URL` do not appear anywhere in this session's files.

**The single largest real gap this session, resolved by direct confirmation before writing any upload code:** `IMPL_28`'s upload flow rejects screenshots below `VISION_SAP_CONFIDENCE_THRESHOLD` using `classify_sap()`'s claimed `{is_sap, confidence, reason}` response. The real, reused `classify_sap()` (built by `IMPL_13`, already retrofitted to Cerebras/Groq per `DEC-038`/`DEC-040`/`AMENDMENT_INFERENCE_ARCHITECTURE.md` FILE 4) returns a `SAPScreenshotType` enum instead — which of 5 SAP screen categories an image is — and always succeeds (falls back to `TRANSACTION_SCREEN` on any failure, never signals "this isn't SAP at all"). Building the confidence gate as spec'd was structurally impossible without either modifying the shared client (against the session's own explicit "reuse, don't duplicate" constraint) or writing a second, separate vision call (exactly what that constraint forbids). Presented 3 resolution options directly; chosen: derive the rejection signal from `extract_sap_content()`'s own output instead — a completely empty extraction (no error codes, t-codes, field names/values, screen title, or message text) sets `vision_status='not_sap'`, a real DB enum value from `IMPL_24`'s original schema that was otherwise permanently dead. `vision_confidence` is stored as `NULL` — no real confidence number exists to report, and none is fabricated.

**A second, internal inconsistency found within `IMPL_28` itself, not a reality-mismatch this time:** Section 3 has the upload endpoint run vision extraction *synchronously*, reaching `vision_status='complete'` immediately — before any chunk exists, since chunks are only created at publish time. Section 4's `enrich_entry_screenshots` bulk-mode query (`WHERE vision_status='pending'`) would therefore find nothing to process in the normal case; the two sections' assumptions don't reconcile as written. Resolved by redesigning the task's actual job: bulk mode merges each screenshot's *already-extracted* text (from the synchronous upload step) into the chunk that now exists for its section, rather than re-running vision — vision only genuinely re-runs in retry mode (a specific `target_screenshot_id`, the case where extraction previously failed and there is no usable prior text to merge).

**A real bug avoided by using the correct Qdrant primitive, not found via a live failure this time:** the enrichment merge needed to update a chunk's `text` field and its content vector after re-embedding, while leaving the rest of the point's payload (`document_id`, `module`, `quality_score`, `source_type`, etc. — none of which are mirrored in Postgres, only in Qdrant) untouched. A raw `upsert()` (IMPL_28's own pseudocode) would have silently replaced the entire payload with just the two updated fields, wiping everything else — confirmed by reading Qdrant's real API semantics before writing the call, not discovered by breaking it live. Added `AegisQdrantClient.update_vectors()` (new wrapper method, partial vector update only) and used it together with the already-existing `set_payload()` (partial payload update only) instead of a single `upsert()`.

**A third, unrelated-but-adjacent real bug found and fixed while wiring up scheduling for the new cleanup job:** `nightly_cleanup` (the pre-existing cache-cleanup ARQ task, present since the original build) was never actually scheduled anywhere in this codebase — no APScheduler dependency, no ARQ `cron_jobs` entry, confirmed by grep. It was only ever callable on-demand via manual enqueue, despite `AEGIS_MASTER_REFERENCE.md` describing it as a running nightly job. Fixed alongside adding real scheduling for the new `cleanup_eligible_screenshots` job, using ARQ's own native `cron()` support (not `IMPL_28`'s assumed APScheduler, which isn't installed) — both now genuinely scheduled (19:00 UTC / 00:30 IST for cache, 19:30 UTC / 01:00 IST for screenshots, matching `IMPL_28` Section 7.2's stated time).

**Verified live through the real HTTP API:** upload correctly returned a `422` rejection for a genuinely non-SAP synthetic test image; confirmed via container logs that this exercised real HTTP calls to both `api.groq.com` and `api.cerebras.ai` (both `401 Unauthorized` — `OPEN-13`'s already-known, deliberately-left-open placeholder-key blocker, not a defect introduced here; the same failure-handling pattern already validated for `aegis_vision_tasks_total` in `DEC-052`). Verified the MinIO/proxy portion of the round trip independently of the blocked vision calls: `put_object`→proxy `GET` returned the byte-identical image (confirmed via `cmp`), `401` without auth, `200` with; `DELETE` removed both the MinIO object and the DB row, and the proxy correctly `404`s afterward. 8 new unit tests for the pure formatting/rejection-heuristic functions; full suite (245 tests) passes; `docker compose config` valid; all containers healthy.

**Affects:** `backend/app/handlers/knowledge_screenshots_handler.py` (new), `backend/app/tasks/enrich_entry_screenshots.py` (new), `backend/app/tasks/cleanup_eligible_screenshots.py` (new), `backend/app/infrastructure/minio_client.py` (`remove_object`), `backend/app/infrastructure/qdrant_client.py` (`update_vectors`), `backend/app/infrastructure/redis_client.py` (`enqueue_screenshot_enrichment` gains `target_screenshot_id`), `backend/app/workers/arq_worker.py` (2 new tasks + `cron_jobs`), `backend/app/main.py`, `backend/app/config.py` (screenshot constants).

---

# PART G — OPEN ITEMS REGISTER
## Items explicitly identified as unresolved; must be closed before the affected work can be considered complete

---

**OPEN-01 — RESOLVED.** ~~`model_gateway.py`'s middle section has never been directly inspected.~~ The complete, real file was directly reviewed (not spec text, not a partial paste) as part of the final pre-implementation verification pass. It confirmed one real discrepancy — `select_model_tier()`'s signature, fixed in DEC-040 — and confirmed everything else in `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s `FILE 3` matches the real file exactly. The diagnostic command in that amendment's `AGENT INSTRUCTIONS` remains in place as a standing safety check for future sessions, but the specific uncertainty this item tracked is closed.

**OPEN-02 — RESOLVED.** ~~`BACKEND_AGENT_SESSION_GUIDE.md` v4 must explicitly flag which affected sessions are retrofits.~~ Done — see that document's `RETROFIT STATUS` table and the explicit `(RETROFIT)`/`(FRESH BUILD)` tag in every affected session's header.

**OPEN-03 — RESOLVED.** ~~Per-session prompt text, not just an appendix table, must be edited for every affected session.~~ Done — every retrofit session in `BACKEND_AGENT_SESSION_GUIDE.md` v4 has its actual prompt text rewritten with the specific amendment instructions woven in, not merely referenced from the supersession table.

**OPEN-04 — RESOLVED by DEC-034.** ~~Quick Entry's exact per-session touchpoints against the four `tier1_amendments/` documents have not been individually verified.~~ All 7 Quick Entry backend sessions checked individually; findings and corrections recorded in DEC-034.

**OPEN-05 — Live benchmark numbers for the three selected inference models remain uncaptured.** See DEC-023.

**OPEN-06 — SambaNova's actual free-tier numeric rate limits remain unverified.** See DEC-022. Not currently load-bearing (excluded from the architecture), but left open for future reconsideration.

**OPEN-07 — RESOLVED.** ~~`output_governance.py`'s credential-leak regex misses a real, common connection-string shape.~~ Fixed with a dedicated `PATTERN_URI_CREDENTIALS` regex, distinct from the existing `PASSWORD`/`PASSWD` patterns, added to `ALL_PATTERNS`. Commit `9e8d59f`.

**OPEN-08 — `AEGIS_DATA_CONTRACTS.md` documents a `"correction"` WebSocket message type that `IMPL_17` never actually implements sending.** Confirmed directly (DEC-045) — a genuine gap between two foundation documents, present since the original build. Needs a decision: either add the missing implementation to `IMPL_17` (or a later session), or correct the data contract if this message type is no longer intended. Not yet decided which.

**OPEN-09 — RESOLVED.** ~~Postgres authentication for `aegis_user` fails from inside the container, meaning Tier 1's transaction-code policy check no-ops silently.~~ The real, intended architecture was never a static `aegis_user` login role at all — `migration 004`'s own comment says "Vault will create actual users dynamically." Built the full `vault_client.py` (AppRole-authenticated, dynamic 1h-TTL Postgres credentials via Vault's Database Secrets Engine) and rewired every Postgres call site to use it. Commit `9e8d59f`, later extended to `postgres_client.py`/`admin_handler.py` in Session 21 (DEC-046).

**OPEN-10 — `.env.example`'s `KEYCLOAK_CLIENT_ID=aegis-backend` is the same stale value corrected in `secrets-share/.env` by DEC-046, left uncorrected here.** Present since the very first scaffold commit (`e3ca021`). `.env.example` is what any fresh clone copies from, so a new environment set up from it would reproduce this exact bug. Worth a broader audit of `.env.example`'s other values while this is being looked at — this one was only found because it happened to break something Session 21 tested live; others may not have been exercised yet.

**OPEN-11 — `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s own `RETROFIT STATUS` table is directly false for this checkout.** Confirmed directly (DEC-047): zero `.tsx`/frontend-component files exist anywhere in this repository's history before Session 21, yet the guide marks F01 (project scaffold) through F18 as "Already built." All 18 need their retrofit/fresh-build status individually re-audited from F01 onward, the same way `BACKEND_AGENT_SESSION_GUIDE_v4.md` already was (OPEN-02) — not just the admin sessions (F11-F14). **Blocks every frontend F-session (F01-F18) from starting as currently written.**

**OPEN-14 — `vault_client.py` is now dead code, disposal not yet decided.** `DEC-051`'s PgBouncer fix moved every Postgres call site to static `POSTGRES_USER`/`POSTGRES_PASSWORD` credentials, so nothing in the codebase calls `vault_client.get_postgres_credentials()` (or anything else on that client) anymore. Left in place rather than deleted — removing infrastructure wasn't explicitly requested — but this reverses `OPEN-09`'s resolution (which built `vault_client.py` specifically to fix Postgres auth) for the pooled-connection path. Needs a decision: delete it, or keep it for a future non-pooled/direct-to-Postgres use case (e.g. a maintenance task that deliberately bypasses PgBouncer for a true per-request dynamic credential).

**OPEN-15 — `secrets-share/.env`'s `KEYCLOAK_CLIENT_SECRET` does not match Keycloak's actual configured client secret.** Found live (`DEC-053` addendum) while obtaining a real JWT for API-level Quick Entry verification: the env value produces `unauthorized_client` against Keycloak's real `aegis-chat` client; only `scripts/setup_keycloak.py`'s hardcoded literal (`aegis_chat_client_secret_dev`) succeeds. `frontend/src/app/api/auth/login/route.ts` depends on this same env var for its own ROPC exchange — **this will break real employee/admin login the moment the frontend is deployed**, though it isn't a live outage today since no frontend container currently runs in this stack. Needs a decision: rotate Keycloak's client secret to match `.env` (`kcadm.sh update`), or correct `.env` to the script's actual value — whichever is treated as authoritative going forward.

**OPEN-12 — RESOLVED.** ~~`vision_task.py` never received the retrofit `DEC-040` announced; the already-shipped chat screenshot feature is currently broken under the live default `INFERENCE_MODE=external`.~~ Root cause corrected in `DEC-049`: not a stale-local-copy issue (checked exhaustively, including a separate D: drive clone and a Downloads-folder file — neither had it either) — `DEC-040`'s claim that the fix had been written was itself never true. Real `FILE 4b` retrofit written and applied to `backend/app/tasks/vision_task.py`: `INFERENCE_MODE` branch added, external mode routes through `call_vision_completion()` sharing `ollama_vision.py`'s circuit breaker keys. Verified live: real `401` from Cerebras (not a connection failure), 188 tests pass.

**OPEN-13 — Cerebras/Groq API keys are not just "missing benchmark data" (OPEN-05) — the actual call path returns a hard `401 Unauthorized`, confirmed live.** Found during Session 23 (DEC-048) testing Quick Entry's Prerequisite 1. Every external-inference call — main reasoning, judge, and vision, across the entire application, not just vision — is currently non-functional in this environment until real values replace the placeholder `CEREBRAS_API_KEY`/`GROQ_API_KEY` in `secrets-share/.env`. `OPEN-05` remains open for the separate, narrower question of live throughput benchmarks once real keys exist. **Deliberately left open, not an oversight:** asked directly whether to supply real keys now, proceed to Session 24 with this still open, or pause — explicitly chose to proceed. Session 24 (Postgres/OpenSearch schema work) has no dependency on working inference, so this is safe to carry forward, but any session after that which needs a real model response is blocked on this until resolved.

---

# CROSS-REFERENCE INDEX — WHICH DECISION AFFECTS WHICH FILE

| File / Session | Relevant Decisions |
|---|---|
| `model_gateway.py` | DEC-015, DEC-017, DEC-019, DEC-020, OPEN-01 |
| `vision_task.py` (retrofit — corrected from an earlier "vision_integration.py" error, see DEC-034's history) | DEC-006, DEC-021 |
| `retrieval_engine.py` (retrofit — `_stage6_crag`) | DEC-015, DEC-019, DEC-020 |
| `IMPL_13` (retrofit) | DEC-006, DEC-021, DEC-024, OPEN-02 |
| `IMPL_16` (retrofit, partial) | DEC-015, DEC-019, DEC-020, OPEN-01, OPEN-02 |
| `IMPL_17` | DEC-015 — direct, load-bearing dependency via `call_judge()`, already correctly delegated (not a retrofit target, unlike `vision_task.py`/`retrieval_engine.py`) |
| `IMPL_18` | DEC-004, DEC-024, DEC-036 |
| `IMPL_21`, `IMPL_22` | DEC-025 (historical patch resolution) |
| `IMPL_23-29` (Quick Entry) | DEC-005, DEC-007, DEC-034, DEC-050, DEC-053, DEC-054 |
| `IMPL_25` (Quick Entry API endpoints) | DEC-054 |
| `IMPL_26`, `IMPL_27` (Quick Entry processing pipeline + chunking) | DEC-053 |
| `IMPL_28` specifically (vision + storage) | DEC-034, DEC-055 |
| `app/clients/ollama_vision.py` (reused, not duplicated, by Quick Entry) | DEC-038, DEC-040, DEC-055 |
| `IMPL_29` Section 3.2 (negative-feedback notifications) | not yet built, deferred by DEC-054 to a future "Session 29" |
| `FRONTEND_36-40` (Quick Entry UI) | DEC-005 |
| `postgres_client.py`, `vault_client.py` (now dead code) | DEC-046, DEC-051, OPEN-09, OPEN-14 |
| `docker-compose.yml` | DEC-014, DEC-024, DEC-051, DEC-052 |
| `.env` / `.env.example` | DEC-024, DEC-025, DEC-035, DEC-051 |
| `src/components/shared/EmployeeTopbar.tsx`, `LoadingScreen.tsx`; `src/components/chat/ChatEmptyState.tsx`; `src/app/layout.tsx`; `src/lib/utils.ts` (formatDateIST/formatISTDate) | DEC-035 |
| `AEGIS_DOCUMENT_TEMPLATES.md` (frozen) / `docs/DOCUMENT_AUTHORING_TEMPLATE.md` (new, generalized) | DEC-036 |
| `docs/DEMO_CONTENT_GUIDE.md` | DEC-016, DEC-036 |
| `docs/DEV_ENVIRONMENT_SETUP.md` | DEC-008, DEC-013, DEC-032 |
| `docs/CLOUD_DEPLOYMENT_GUIDE.md` | DEC-009, DEC-014 |
| `docs/TROUBLESHOOTING_RUNBOOK.md` | DEC-006, DEC-018 through DEC-021, DEC-024, DEC-033 |
| `BACKEND_AGENT_SESSION_GUIDE_v4.md` | DEC-026 through DEC-034 (all sessions it reorders/annotates), OPEN-02, OPEN-03 |
| `FRONTEND_AGENT_SESSION_GUIDE_v2.md` | DEC-028, DEC-035, OPEN-04 |
| `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md` | DEC-025, DEC-026, DEC-034 (all three drift/reconciliation findings it indexes) |
| Specification folder structure overall | DEC-026, DEC-028, DEC-029, DEC-032 |

---

## NOTE ON THIS DOCUMENT'S OWN DRAFTING PROCESS

This log went through two genuine completeness passes, not one.

**First pass**, before any other document referenced this one: found four missing decisions (DEC-002, DEC-016, DEC-017, and the AWS-status note within DEC-009), inserted in correct chronological/thematic position, with all subsequent entries renumbered. This was done while renumbering was still safe — nothing else had cited these IDs yet.

**Second pass**, after `AMENDMENT_OBJECT_STORAGE_MINIO.md`, `AMENDMENT_INFERENCE_ARCHITECTURE.md`, and `AMENDMENT_GENERALIZATION_FRONTEND.md` had already been drafted and were being verified against real spec content: found three more decisions that existed only as reasoning embedded in an amendment document, never logged here (DEC-034, the Quick Entry MinIO/vision-model findings; DEC-035, the expanded frontend touchpoint sweep; DEC-036, the frozen-template-vs-human-facing-template resolution). These were appended at the end of the numbering (034-036) rather than inserted retroactively into earlier positions, since by this point other documents did already reference specific `DEC-XXX` IDs — this is the append-only behavior the "permanent once assigned" rule describes.

**A further gap was found and fixed during a dedicated final verification pass** (prompted by a direct request to re-verify all 13 delivered documents, not assume they were already correct): the Cross-Reference Index table above had not been updated to include `DEC-034`/`035`/`036`'s affected files, still referenced the pre-correction `vision_integration.py` filename instead of the actual retrofit target `vision_task.py`, was missing `retrieval_engine.py` entirely, and referenced the agent guides by their pre-delivery working names rather than their actual final filenames. All fixed in place, in this same pass.

*This document is append-only in spirit: new decisions are added as new entries at the end of the relevant Part, never inserted retroactively into the numbering. If a CONFIRMED decision is later reversed, the original entry's status is changed to `SUPERSEDED BY DEC-XXX` and a new entry is added — the historical entry itself is never deleted.*