# AEGIS Implementation Handbook — Document 00
# How To Use This Handbook

---

## WHAT THIS HANDBOOK IS

This is a set of 10 documents that walk you through implementing AEGIS from your current state (Sessions 01–16 built but unverified, no working environment yet) all the way to a live production deployment on Oracle Cloud. It is written to be followed literally, top to bottom, one step at a time. You should never have to guess what to do next, why you are doing it, or whether it worked.

This handbook does not replace the specification documents. It is the *companion* that tells you how to actually use them. When a step says "now read `IMPL_16_REASONING_SERVICE.md`," the spec document is still the source of truth for *what to build* — this handbook is the source of truth for *the process around building it*.

---

## THE 10 DOCUMENTS AND THE ORDER TO USE THEM

You follow these in order. You do not skip ahead. Each one has a clear "you are done with this document when…" marker at the end.

| Doc | Title | When you use it |
|---|---|---|
| 00 | How To Use This Handbook | Right now. Once. |
| 01 | Oracle VM Provisioning | Once, at the very start. Creates your cloud server. |
| 02 | Environment Checks | Once, right after the VM exists. Confirms what's installed. |
| 03 | Claude Code Setup | Once. Installs your implementation tool. |
| 04 | Repo and Secrets | Once. Gets the code and secrets onto the VM. |
| 05 | Phase 0 — Make It Run | Once. Proves the existing code actually works before you touch it. |
| 06 | Retrofit Sessions | Repeatedly. Sessions 16, 10, 13, 15. |
| 07 | Backend Build Sessions | Repeatedly. Sessions 17, 18, 21, 22. |
| 08 | Quick Entry Sessions | Repeatedly. Sessions 23–29. |
| 09 | Frontend Sessions | Repeatedly. Sessions F01–F19. |
| 10 | Production Go-Live | Once, at the very end. Makes it public. |

Documents 00–05 are one-time setup. You do them once and never again. Documents 06–09 are the repeating core — you will come back to these for every single session. Document 10 is the finale.

---

## THE SINGLE MOST IMPORTANT RULE FOR USING THIS HANDBOOK

**When a command's real output does not match what this handbook says to expect, STOP. Do not continue to the next step.**

This is the one rule that prevents every serious mistake. A step that produces unexpected output is telling you something is wrong *now* — continuing forward builds the next step on a broken foundation, and the eventual failure will appear somewhere far away from the actual cause, making it very hard to debug.

Every command in this handbook shows you what its output should look like. If yours looks different:
1. Re-read the step to confirm you ran exactly the command shown.
2. Check the "if this goes wrong" note that accompanies most commands.
3. If still stuck, that is a genuine stop-and-report moment — bring the exact command, the exact output you got, and the output this handbook said to expect.

You will never be worse off for stopping at a mismatch. You can be much worse off for pushing through one.

---

## CONVENTIONS USED IN EVERY DOCUMENT

**Command blocks** look like this, and are meant to be run exactly as written:
```bash
some-command --with-flags
```

**After most commands, you will see three things:**
- **Why:** the reason this step exists — never skipped, because understanding why is what lets you recover when something is slightly different on your machine.
- **Expect:** what the output should look like. This is how you know it worked.
- **If wrong:** what a common failure looks like and what to do about it.

**Placeholders** appear in angle brackets like `<your-vm-ip>`. You replace the entire thing including the brackets with your real value. If you see `<your-vm-ip>` and your IP is `140.238.1.2`, you type `140.238.1.2`, not `<140.238.1.2>`.

**A "GATE" box** appears at the end of each phase. A gate is a checklist of things that must ALL be true before you move to the next document. If any gate item is not met, you are not done with the current document, regardless of how many steps you have completed.

---

## A NOTE ON WHY THIS IS ORACLE-FIRST

You may have started setting up a local WSL environment on your Windows machine. This handbook does not use it. Everything — development and production both — happens on a single Oracle Cloud VM.

The reason is simple and worth understanding: the number one source of deployment disasters is "it worked on my machine but broke on the server." If your development machine and your production machine are the *same machine*, that entire class of problem cannot happen. Your half-finished WSL setup was not wasted — it taught you the shape of what's coming (Ubuntu, Docker, symlinks, the repo layout), which makes the real Oracle setup faster. But the real work happens on Oracle, starting from Document 01.

---

## WHAT YOU NEED BEFORE YOU START

- A computer with a web browser (to create the Oracle account and use its console)
- VS Code installed on that computer (Document 03 uses it to connect to the VM)
- A credit or debit card (Oracle requires it for identity verification — you will not be charged for staying within the free tier; this is covered in detail in Document 01)
- Your existing `aegis-project` code and its `secrets-share` folder somewhere accessible (Document 04 transfers these)
- Your Cerebras and Groq API keys (Document 05 needs them; if you don't have them yet, Document 05 tells you where to get them)

You do not need to know Linux, Docker, or cloud computing in advance. Every command is spelled out.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

You understand: that you follow the 10 documents in order, that you stop when output doesn't match, and that everything happens on Oracle. That's it. Move to Document 01.
