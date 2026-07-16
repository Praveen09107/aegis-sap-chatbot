# AEGIS — Claude Code Spec Usage Guide
## How This Specification System Actually Works With Claude Code
## Place at project root, alongside `CLAUDE.md`

---

## THE CORE SHIFT FROM HOW THIS WORKED BEFORE

The original methodology (`guides/COPILOT_01-05`, `guides/COPILOT_INITIATION_PROMPT.md`) was built for GitHub Copilot Chat — a tool with no persistent memory, requiring you to manually paste a 5-document context bundle at the start of every single session and wait for an explicit confirmation it had "absorbed" everything. That ceremony is now largely unnecessary, not because the underlying discipline was wrong, but because the tool changed.

**Claude Code reads `CLAUDE.md` automatically, at the start of every session, from disk — no pasting required.** It also survives `/compact` (context compaction on long sessions): Claude Code re-reads the project-root `CLAUDE.md` from disk afterward, so instructions don't silently vanish partway through a long session the way they could in the old chat-paste model.

**This does not mean the old discipline is gone — it means where each piece of it lives has changed:**

| Old mechanism | New mechanism | What changed |
|---|---|---|
| Paste `COPILOT_01` (personal/skill context) every session | `CLAUDE.md`, read automatically | No longer re-pasted; always present |
| Paste `COPILOT_02` (Five Absolute Rules, drift patterns) every session | `CLAUDE.md`, read automatically | Same — condensed, some content corrected (see below) |
| Paste `COPILOT_03` (full system architecture) every session | Referenced, not duplicated | Too large and too stale to keep pasting — see the correction note below |
| Paste `COPILOT_04` (workflow traces) every session | Read on demand, not automatic | Still excellent detail; loaded only when actually relevant to the session at hand |
| Paste `COPILOT_05` (session protocol) every session | Custom slash commands (`.claude/commands/`) | The *ritual* is now executable, not just descriptive |
| "Wait for Copilot to confirm it read everything" | Not needed | Claude Code's tool-use is visible and verifiable directly — you see it read the file |

**A real correction made during this redesign, not a cosmetic one:** `COPILOT_03`'s system summary claimed "approximately 50 concurrent users maximum," a "CPU-only server," and "no data ever leaves the company network." All three are now false — the real, current numbers and architecture live in `DECISIONS_LOG.md` (DEC-018 for traffic patterns, DEC-015 for the inference architecture pivot, DEC-017 for the external-API decision). `COPILOT_03` is not deleted — it moves to `tier5_historical/` alongside the rest of the superseded planning material, exactly like every other document that's been through this same reconciliation process in this project.

---

## WHAT'S ALWAYS LOADED VS. WHAT'S LOADED PER-SESSION

**Always loaded, every session, no action needed:**
- `CLAUDE.md` — the rules, architecture facts, and pointers that don't change often

**Loaded on demand, when Claude Code actually reads the file (because you referenced it, or because it needs to for the task):**
- Everything in `specs/tier1_foundation/`, `specs/tier1_amendments/`, `specs/tier2_implementation/`, `specs/tier4_frontend/`
- `DECISIONS_LOG.md`, `HISTORICAL_ARCHITECTURE_EVOLUTION.md`
- The two agent session guides

**This means the old "Attach: AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_XX" pattern in the existing guides still tells you exactly what to reference — it just means "tell Claude Code to read these files" instead of "paste their content into the chat."** The guides don't need rewriting for this; the instruction translates directly:

> Old: *Attach: AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_16_REASONING_SERVICE*
>
> New: *"Read `specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md`, `specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md`, `specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md`, and `specs/tier2_implementation/IMPL_16_REASONING_SERVICE.md` completely before writing anything."*

---

## HOW THE TIER SYSTEM MAPS TO REAL CLAUDE CODE BEHAVIOR

| Tier | Claude Code's relationship to it |
|---|---|
| `tier0_agent_guide/` | The two session guides — read the specific session's entry before starting that session |
| `tier1_foundation/` | Frozen. Read for ground truth on data contracts/constants. Never ask Claude Code to edit these. |
| `tier1_amendments/` | Read alongside whichever session the amendment's own header says it attaches to |
| `tier2_implementation/` | The actual build specs. One read per session, per the guide's attach-list |
| `tier3_verification/` | `DECISIONS_LOG.md` is worth a scan at the start of any session touching something non-obvious; the checklists are for milestone points, not every session |
| `tier4_frontend/` | Same pattern as tier2, for frontend sessions |
| `tier5_historical/` | Never attach these to a build session. Only relevant if Claude Code encounters an old claim and needs to check whether it's still true — `HISTORICAL_ARCHITECTURE_EVOLUTION.md` is the lookup table for exactly that. |
| `tier6_production/` | Not relevant until Phase B (post-launch hardening) — don't reference during Phase A implementation |

---

## THE CUSTOM SLASH COMMANDS (see `CLAUDE_CODE_PROMPTS.md` for the actual command files)

Rather than re-describing the old `COPILOT_05` session protocol in prose Claude Code has to re-interpret each time, the same ritual is packaged as executable commands in `.claude/commands/`:

- `/aegis-session-start` — the pre-session checklist (environment confirmation) plus the 3-pass spec-reading discipline from `COPILOT_05`, now as one command instead of a document to remember to consult
- `/aegis-verify` — runs the actual verification commands (tests, health checks) rather than just listing what they should be
- `/aegis-retrofit-check` — the diagnostic-first pattern required specifically for retrofit sessions (per `DECISIONS_LOG.md` DEC-037's ordering dependency)

These are "verbs" — the how-to-do-a-session mechanics. `CLAUDE.md` stays "nouns" — the stable facts. This split is a deliberate design choice, not arbitrary: mixing the two makes `CLAUDE.md` both longer (hurting adherence, since instruction-following degrades as the file grows) and harder to update (a change to session ritual shouldn't require touching the same file as a change to an architecture fact).

---

## A NOTE ON THE FIVE ABSOLUTE RULES' FIFTH RULE

`COPILOT_02`'s original Rule 5 ("Apply the Ubuntu Ollama patch in IMPL_03... bind mount `/home/pal/.ollama:/root/.ollama`") assumed self-hosted Ollama was the only inference path — true when it was written, no longer true. `CLAUDE.md`'s version of this rule is corrected to state the real current condition: this bind-mount only matters under `INFERENCE_MODE=local`, which is not the default. Don't let a future session apply this patch reflexively without checking `INFERENCE_MODE` first — that would be exactly the kind of unnecessary architecture-invention Rule 4 already forbids.

---

## WHAT TO DO IF CLAUDE CODE ISN'T FOLLOWING SOMETHING IN `CLAUDE.md`

Per Claude Code's own documented behavior: `CLAUDE.md` content is delivered as context, not as hard-enforced configuration — there's no guarantee of strict compliance, especially for vague instructions. If something in `CLAUDE.md` isn't being followed:

1. Run `/memory` to confirm `CLAUDE.md` is actually being loaded (it should be, since it's at project root, but confirm rather than assume)
2. Check whether the instruction was specific enough — "use exact paths" works better than "be careful with file locations"
3. If it's a hard requirement that must never be violated regardless of Claude Code's judgment in the moment, that's a signal it may belong in a hook (a `PreToolUse` check) rather than `CLAUDE.md` — this is a real Claude Code mechanism for blocking an action outright, distinct from persuasive context. Not designed here, since none of this project's rules currently need that level of enforcement, but worth knowing the option exists if one ever does.

---

*Related: `CLAUDE.md`, `CLAUDE_CODE_PROMPTS.md`, `IMPLEMENTATION_STRATEGY.md`, `DECISIONS_LOG.md`.*
