# AEGIS — Project Context and History
## The Complete Picture — Read Once, at Onboarding, Not Every Session
## Place at project root: ~/projects/aegis-project/PROJECT_CONTEXT_AND_HISTORY.md

---

## HOW THIS DOCUMENT IS DIFFERENT FROM `CLAUDE.md`

`CLAUDE.md` is short and loaded automatically, every session — it holds the stable rules and facts you need constantly. This document is the opposite: long, narrative, read **once**, at the start of a genuinely new working relationship with an agent (a fresh Claude Code onboarding, or your own re-orientation after time away). It explains *why* things are the way they are, not just *what* they are. Once read, `CLAUDE.md` carries the load session to session — this document doesn't need re-reading every time.

---

## 1. WHO IS BUILDING THIS, AND WHY

Praveen — a third-year B.E./CSE student, working solo, no team, no fixed external deadline. This is a portfolio project aimed at AI/ML Engineer roles, and a potential product template for future independent client work. There is no company sponsoring this anymore (see Section 2). Praveen has basic Python from coursework and has not built a system at this scale before — code should be written and explained accordingly: clearly, with reasoning made visible, not just terse output assuming deep prior context.

---

## 2. THE ORIGIN STORY — WHY THIS PROJECT EXISTS IN ITS CURRENT FORM

AEGIS began as an internship project at Sona Comstar, an automotive manufacturer, built as an internal SAP ERP helpdesk chatbot for their employees. Substantial work was completed during that internship — specifications through roughly `IMPL_16`, all foundation and implementation-tier documents, all frontend specifications.

**The internship concluded with an instruction to discontinue the project within the company.** Praveen had already pulled the complete repository, as an authorized collaborator, before departure. Rather than abandon the substantial completed work, the decision was made to **continue building independently, decoupled entirely from Sona Comstar** — as a personal portfolio piece and potential product template, not as work performed for or owned by that company.

**One thing worth being precise about, honestly:** no claim is made anywhere in this project about intellectual property rights, NDAs, or employment terms governing this continuation — that's a separate legal question Praveen has been advised to review with a qualified advisor before any public distribution or commercialization, and it remains genuinely unresolved. What *is* settled is the technical decision to continue building, which is what everything else in this project assumes.

---

## 3. WHAT AEGIS ACTUALLY IS

A general-purpose SAP ERP helpdesk AI. An employee asks a question about a SAP error, procedure, or configuration; AEGIS retrieves grounded answers from a real documentation corpus, with source attribution, confidence scoring, and escalation to a human ticket when it doesn't know. Not a generic chatbot wrapped around an LLM — a retrieval-grounded system with real infrastructure behind it: hybrid vector + keyword search, a multi-stage reranking and validation pipeline, a full admin portal for managing the knowledge base, and an alternative "Quick Entry" path for admins to author knowledge directly with screenshot analysis.

**Success criteria, stated explicitly and not negotiable:** fully working, immersive, production-grade quality throughout — no feature or quality reduction accepted anywhere in the build, even though this is a solo, unpaid, portfolio-motivated project. The ambition is deliberately not scaled down to match the "just a student project" framing; it's built to the standard of something genuinely deployable.

---

## 4. THE MAJOR ARCHITECTURAL PIVOTS SINCE THE INTERNSHIP — READ THIS CAREFULLY

The specs from the internship phase (`IMPL_01` through roughly `IMPL_16`, all `tier1_foundation`, all `tier4_frontend`) are **not being rewritten** — they remain the real, valid record of what was built and how. But several major decisions were made *after* that phase concluded, changing what "correctly continuing this project" now means. These live as formal amendment documents in `specs/tier1_amendments/`, and the full reasoning for every one of them is in `specs/tier3_verification/DECISIONS_LOG.md` — this section is the summary, not the full story.

**No self-hosted LLM inference, by default.** The original design ran everything — main reasoning, judge/CRAG, vision — on local Ollama models (`qwen2.5:32b` and friends), assuming dedicated GPU-backed infrastructure. That infrastructure doesn't exist for this independent continuation. `INFERENCE_MODE=external` is now the default: Cerebras (primary) and Groq (fallback) handle all inference over the network, free-tier. Self-hosted Ollama still exists as an `INFERENCE_MODE=local` option for a genuinely air-gapped deployment scenario, but it is not what runs day to day. **This is why you won't see Ollama containers running most of the time**, and why the retrofit work (Session 16 first, then 10/13/15) exists at all — it's rewiring the original self-hosted call sites to route through Cerebras/Groq instead.

**Why this pivot was safe to make:** the realistic usage pattern for this project is 10-30 total users, on-demand and irregular (recruiters, prospective clients, the occasional friend trying it) — not sustained concurrent internal-company traffic. That reframing is what made free-tier API rate limits genuinely viable; the original internal-helpdesk framing (50-100 concurrent daily users) would have made every free-tier limit look inadequate. Once the real usage pattern was established, external inference became not just workable but the *better* choice — it also removes the GPU-hosting cost problem entirely.

**The company is generalized out of the product.** Every "Sona Comstar" reference — in system prompts, UI copy, seed data, TLS certificate subjects — is being replaced with configurable values (`AEGIS_COMPANY_NAME`, etc.), so the product works for any organization, not one specific former employer. This is what `AMENDMENT_GENERALIZATION_BACKEND.md` and `AMENDMENT_GENERALIZATION_FRONTEND.md` do.

**MinIO object storage was added as a genuinely required service.** Originally dropped from an early plan, then found to still exist (fully, independently) inside the Quick Entry feature's own specification even after being dropped elsewhere — recognized as inconsistent, and restored as a real, intentional 20th service for durable document and screenshot storage across the whole system, not just Quick Entry.

**Quick Entry was added as a new feature entirely** (`IMPL_23`-`IMPL_29`, `FRONTEND_36`-`FRONTEND_40`) — letting an admin author knowledge entries directly, with SAP screenshot analysis reusing the same vision pipeline the main employee chat uses, not a duplicate implementation.

---

## 5. THE CURRENT, REAL, VERIFIED STATE — NOT ASSUMED, ACTUALLY CHECKED

As of the most recent audit: **all 68+ expected files from Sessions 01–16 exist, are non-trivial, and pass their own test suite — 141 out of 141 tests passing.** This was confirmed by running the real test suite against the real code, not by reading specs and assuming compliance. The four architecture amendments exist and are correct against real, inspected source files — including several real discrepancies found and fixed along the way (a wrong retrofit target for the vision client, a wrong function signature, a `docker-compose.yml` dependency bug that would have hung the entire stack at startup). All of that history is recorded, decision by decision, in `DECISIONS_LOG.md` — it is not a clean, idealized record; it includes the mistakes made and corrected, deliberately, because that record has real value for anyone (including a future Claude Code session) trying to understand why something is built the way it is.

**Sessions 17 through 29 (backend) and F01 through F19 (frontend) are not yet built.** That is the actual work ahead, not a gap to be embarrassed about — it's simply where the project currently stands.

---

## 6. THE ENVIRONMENT STRATEGY — WSL NOW, ORACLE LATER, AND WHY

**Right now: local development happens on WSL2 (Ubuntu 22.04) on Praveen's own Windows laptop.** This was a deliberate mid-course change — the original plan was Oracle-first for both development and production, specifically to eliminate any "works on my machine, breaks on the server" risk. That plan is still the eventual destination, not abandoned — but Praveen wanted to start building immediately on already-available local hardware rather than wait on cloud provisioning, and was willing to accept the tradeoffs knowingly rather than not build at all in the meantime.

**The known tradeoffs of this choice, understood and accepted, not overlooked:** WSL is `x86_64`; Oracle's free-tier ARM VM is `aarch64` — Docker images get rebuilt fresh on whichever host, not copied, so passing tests on WSL doesn't guarantee identical results on Oracle without re-verification there. The laptop has real, measured memory constraints (16GB total, ~11GB usable inside WSL after configuring `.wslconfig` properly) — services are brought up in deliberate, staged batches rather than all 19+ at once, and a `docker-compose.override.yml` (local-only, gitignored, never committed) reduces OpenSearch's JVM heap specifically for this constrained environment. Docker volumes (databases, vectors, files) live only on whichever machine created them — they do not travel with a `git push`; only committed code does.

**Oracle remains the confirmed production target.** When the migration happens, it follows `docs/CLOUD_DEPLOYMENT_GUIDE.md` and the handbook's Document 10 — domain, real TLS, hardened secrets, the whole go-live sequence. Whether Oracle *also* becomes the ongoing development environment at that point, or WSL stays as dev with Oracle purely for production, is a decision deliberately deferred until that migration actually begins — not decided prematurely now.

---

## 7. THE TOOLING AND METHODOLOGY

**Claude Code is the primary implementation agent for this entire remaining build** — not an assistant occasionally consulted, the actual hands doing the work, session by session, under close review. This replaces an earlier internship-era methodology built around GitHub Copilot Chat (`guides/COPILOT_01-05`), which required manually re-pasting a full context bundle at the start of every single session. Claude Code's real, persistent mechanics replace that ceremony: `CLAUDE.md` (read automatically, every session, at the project root), four custom slash commands in `.claude/commands/` (`/aegis-session-start`, `/aegis-retrofit-check`, `/aegis-verify`, `/aegis-report-blocker`) that encode the session ritual as something executable rather than something to remember, and Claude Code's own session persistence (`--continue`/`--resume`) for picking up exactly where a session left off.

**The specification system this all operates on** lives in `specs/`, organized into tiers — frozen foundation documents, the amendment documents described in Section 4, the per-session implementation specs, verification records, frontend specs, and an archive of superseded planning material. `specs/SPEC_INDEX_AND_CURRENT_STATUS.md` is the map of all of it. `specs/tier0_agent_guide/BACKEND_AGENT_SESSION_GUIDE_v4.md` and `FRONTEND_AGENT_SESSION_GUIDE_v2.md` contain the exact, real, per-session instructions — which documents to read, what to build, what to verify — reconciled against the amendments in Section 4, not left as two conflicting sources.

**A 10-document implementation handbook** (`handbook/HANDBOOK_00` through `HANDBOOK_10`) walks the entire remaining process step by step, command by command, with the reasoning for each step made explicit — from environment verification through every remaining session through final production go-live.

---

## 8. HOW TO ACTUALLY BUILD FROM HERE

In order: retrofit the four already-built sessions that need updating for the architectural pivots in Section 4 (Session 16 first — it changes a function signature Session 15's retrofit depends on, so order here is not optional), build the remaining backend sessions (17, 18, 21, 22), build Quick Entry (23–29), build the frontend (F01–F19), run the milestone testing checkpoints along the way, then go live on Oracle. `handbook/HANDBOOK_06` through `HANDBOOK_10` cover this in full, literal detail — the exact commands, what to expect from each, and what a wrong result looks like.

**The one discipline that matters more than any individual instruction:** verify against the real thing — the real file, the real test output, the real running container — rather than trust a plausible-sounding assumption. Every serious mistake caught during this project's specification and setup phase was caught exactly this way, and every one that slipped through initially was eventually caught the same way, just later and at higher cost. That's not a one-time lesson; it's the standing method for the entire remaining build.

---

*This document does not need updating every session. Update it only when something in Sections 4-7 genuinely changes — a new major architectural decision, a real environment migration, a change in tooling. For anything that changes more often than that, `SPEC_INDEX_AND_CURRENT_STATUS.md` and `DECISIONS_LOG.md` are the living record — this document points to them rather than duplicating them.*
