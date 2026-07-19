---
description: Run the actual verification suite for the current AEGIS session and report pass/fail honestly
allowed-tools: Bash(find:*), Bash(python -m py_compile:*), Bash(pytest:*), Bash(docker compose:*), Bash(npx tsc:*), Bash(npx vitest:*), Bash(npx playwright:*), Bash(npx next lint:*)
---

## Which stack this session touched — run the matching block below, not both blindly

Check `git status --short` / `git diff --stat main` for the current session branch first: changes under `backend/` → run the **Backend verification** block; changes under `frontend/` → run the **Frontend verification** block. A session touching both (rare) runs both.

## Backend verification (IMPL_XX sessions)

!`find backend/app -name "*.py" -newer .git/HEAD -exec python -m py_compile {} \; 2>&1 || echo "syntax check: see errors above"`

!`pytest tests/unit/ backend/tests/unit/ -v 2>&1 | tail -40`

!`docker compose config --quiet && echo "docker-compose.yml: VALID" || echo "docker-compose.yml: INVALID"`

Backend commit message format (unchanged, per the format this project has used since its original build):
\`\`\`
Session N: IMPL_XX — [session name from spec]

Files created:
- [exact paths]

Files modified:
- [exact paths, with a one-line note on what changed]

Verifications passed:
- [each command actually run above, with its real result]

Notes: [any environment-specific adjustment made this session]
\`\`\`

## Frontend verification (FXX sessions — per `FRONTEND_VERIFICATION_STANDARDS.md`, run from `frontend/`)

!`cd frontend && npx tsc --noEmit 2>&1 || echo "type check: see errors above"`

!`cd frontend && npx vitest run --coverage 2>&1 | tail -40`

!`cd frontend && npx playwright test 2>&1 | tail -40`

!`cd frontend && npx next lint 2>&1 || echo "lint: see errors above"`

Frontend commit message format — the guide's own short one-liner (`FRONTEND_SESSION_GUIDE_PART1/2/3_*.md`'s "Commit" block for the exact wording per session), **not** the backend's multi-section template — e.g. `git commit -m "F01: Project scaffold — Next.js 16, React 19, shadcn/ui, test tooling"`. Do not force the `Session N: IMPL_XX` format onto a frontend session.

## Session close-out (both stacks)

**If anything above failed, do not produce a commit message.** Report the specific failure, what was attempted to diagnose it, and stop for instruction rather than guessing at a fix beyond two attempts — per this project's standing rule on when to stop and report.
