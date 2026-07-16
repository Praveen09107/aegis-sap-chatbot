---
description: Pre-session environment check and spec-reading discipline before starting any AEGIS session
argument-hint: [session-number-or-name]
allowed-tools: Bash(pwd:*), Bash(git branch:*), Bash(docker ps:*), Bash(python --version:*)
---

## Environment check
!`pwd`
!`git branch --show-current`
!`docker ps --format "{{.Names}}" | wc -l`
!`python --version`

Confirm the above matches expectations before proceeding: correct project root, correct git branch for this session, Docker services running if this session is after IMPL_03, correct Python version. If anything looks wrong, stop and report it rather than proceeding on an unconfirmed environment.

## Spec-reading discipline for session: $ARGUMENTS

Before writing any file for this session:

**Pass 1 — full read, no writing.** Read the session's overview, every FILE section, and the verification section at the end, in that order. Note any IMPORTANT or CRITICAL callouts.

**Pass 2 — cross-reference check.** List every file this session's spec creates. For each: does it already exist from a previous session? If yes, does this spec modify/patch it, or does the spec assume it's new? Reconcile before writing.

**Pass 3 — dependency check.** Does this session import from something a previous session should have created? Confirm those files exist and contain the expected classes/functions. If they don't, stop — either sessions are out of order, or a previous session is incomplete. Do not proceed by guessing.

**Also check `specs/tier1_amendments/` for any amendment that attaches to this specific session** — per that amendment's own header, not by assumption. If this is a retrofit session (already-built code being modified), use `/aegis-retrofit-check` instead of proceeding directly.

Only after all three passes are genuinely complete should code writing begin.
