---
description: Mandatory diagnostic-first check before applying any retrofit to already-built AEGIS code
argument-hint: [file-path]
allowed-tools: Bash(grep:*), Bash(wc:*)
---

## Diagnostic for: $ARGUMENTS

This project's amendments were written by tracing spec text, then corrected against real code when the real code turned out to differ (see `DECISIONS_LOG.md` DEC-038 through DEC-040 for what happened when this check was skipped). Never assume a retrofit's `FIND` block matches the real file without checking first.

!`grep -nE "^(def |class |async def |export (default )?(async )?function |export const |function )" $ARGUMENTS 2>/dev/null || echo "File not found at this path — stop and locate the real file before proceeding"`

Compare the actual function/class signatures above against what the amendment's `FIND` block assumes. If they match: proceed with the retrofit exactly as written. If they don't match: **stop and report the discrepancy** — do not adapt the retrofit on the fly to fit what you're seeing. A silently-adapted retrofit is exactly the kind of undocumented drift this project has spent significant effort eliminating. Report it, and it becomes a new `DECISIONS_LOG.md` entry with a corrected retrofit, the same way every previous real discrepancy in this project was handled.
