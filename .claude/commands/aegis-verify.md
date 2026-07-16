---
description: Run the actual verification suite for the current AEGIS session and report pass/fail honestly
allowed-tools: Bash(find:*), Bash(python -m py_compile:*), Bash(pytest:*), Bash(docker compose:*)
---

## Running real verification — not a summary, the actual commands

!`find backend/app -name "*.py" -newer .git/HEAD -exec python -m py_compile {} \; 2>&1 || echo "syntax check: see errors above"`

!`pytest tests/unit/ backend/tests/unit/ -v 2>&1 | tail -40`

!`docker compose config --quiet && echo "docker-compose.yml: VALID" || echo "docker-compose.yml: INVALID"`

## Session close-out

If everything above is genuinely clean, produce a commit message in this exact format (per the format this project has used since its original build):

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

**If anything above failed, do not produce this commit message.** Report the specific failure, what was attempted to diagnose it, and stop for instruction rather than guessing at a fix beyond two attempts — per this project's standing rule on when to stop and report.
