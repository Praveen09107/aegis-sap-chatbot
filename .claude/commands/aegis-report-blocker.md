---
description: Structured stop-and-report for AEGIS when a session hits a real blocker
argument-hint: [brief description of what happened]
---

## Blocker: $ARGUMENTS

Stop here — do not continue attempting fixes beyond what's already been tried. Report, in this structure:

1. **What was attempted** — the exact commands or edits tried, in order
2. **The exact error** — full output, not a paraphrase
3. **What was already ruled out** — so the next attempt doesn't repeat the same dead end
4. **Best guess at cause**, clearly labeled as a guess, not a conclusion

This matches the project's standing rule: a spec verification failing after two diagnostic attempts, a spec requiring a file that already exists with different content, a Docker container not reaching healthy after 5 minutes, or a database migration failing to apply are all conditions to stop and report, not to keep pushing through.
