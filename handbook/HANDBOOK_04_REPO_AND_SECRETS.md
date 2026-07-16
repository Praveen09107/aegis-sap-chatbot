# AEGIS Implementation Handbook — Document 04
# Repo and Secrets — Get the Code onto the VM

**Prerequisite:** Document 03 complete (Claude Code + VS Code remote working on the VM).
**Outcome:** The AEGIS repo cloned fresh on the VM, the gitignored secrets transferred in, symlinks correct, the handbook's Claude Code files placed, and the audit script confirming everything's present.
**Time:** 30–60 minutes.

---

## WHY A FRESH CLONE INSTEAD OF COPYING YOUR EXISTING FOLDER

You already have `aegis-project` on your Windows machine (and a partial copy in WSL). This handbook does **not** copy those to the VM. Instead you clone fresh from the company repo. Here's the reasoning, since it's a deliberate choice:

- A `git clone` either fully succeeds or visibly fails — it cannot silently produce an incomplete copy the way a manual folder-copy or a zip can.
- A fresh clone brings the real commit history, so you can verify session-by-session what was actually built.
- It avoids inheriting any mystery from your local environment's earlier state.

The **one thing a fresh clone cannot bring** is the gitignored files — secrets, real `.env`, certs — because those were never in git. Those come from your existing `secrets-share` folder, transferred separately in Step 3. That's the only thing your local copy is needed for.

---

## STEP 1 — CREATE THE PROJECTS FOLDER AND CLONE

On the VM (via a VS Code terminal or SSH):

```bash
mkdir -p ~/projects
cd ~/projects
git clone <your-company-repo-url> aegis-project
cd aegis-project
```

**Why:** `~/projects/aegis-project` is the standard location this whole handbook (and `CLAUDE.md`) assumes. `<your-company-repo-url>` is the HTTPS or SSH URL of the repo you're still a collaborator on.

**Expect:** git prints "Cloning into 'aegis-project'...", shows progress (objects counted, compressed, received), and finishes. `cd aegis-project` moves you into it.

**If wrong:**
- **Authentication prompt/failure:** the repo is private and git needs your credentials. For HTTPS, git will prompt for username and a personal access token (not your password — GitHub/GitLab require a token). Generate one in the repo host's settings if you don't have it.
- **"repository not found":** wrong URL, or your collaborator access lapsed. Confirm the URL and that you can see the repo in the host's web UI.

---

## STEP 2 — CONFIRM THE CLONE IS REAL AND COMPLETE

```bash
git log --oneline -15
```

**Why:** This proves the clone brought real history, and lets you see the actual session commits (IMPL-01 through IMPL-16, plus the WIP IMPL-17). It's your first confirmation that the code is genuinely what you expect.

**Expect:** ~15 lines of commits with messages like "IMPL-16: Reasoning Service...", "Merge IMPL-15...", ending around a recent "WIP: IMPL-17" and some "chore" commits. Roughly 31 commits total exist (see them all with `git log --oneline | wc -l`).

**If wrong:** If there's no history or very few commits, the clone didn't bring what's expected — stop and confirm you cloned the right repo/branch.

```bash
ls -la
```

**Why:** See the top-level folders. Confirms the structure matches: `backend/`, `frontend/`, `database/`, `docs/`, `guides/`, `infrastructure/`, `scripts/`, `services/`, `specs/`, `tests/`, plus files like `docker-compose.yml`.

**Expect:** All those directories present. Note: `secrets-share/` will be **absent** — it's gitignored and comes in the next step. `.env` and `infrastructure/nginx/ssl` may show as broken symlinks for the same reason — that's expected and fixed in Step 4.

---

## STEP 3 — TRANSFER THE SECRETS FROM YOUR COMPUTER TO THE VM

The `secrets-share` folder (real `.env`, TLS certs, VS Code settings) exists only on your Windows machine. Transfer it to the VM using `scp` (secure copy).

**This command runs on your own computer, not the VM.** Open a terminal on your computer where you can see your `secrets-share` folder, and run:

```bash
scp -i <path-to-your-private-key> -r "<path-to-your-local-secrets-share>" ubuntu@<your-vm-ip>:~/projects/aegis-project/
```

Concretely, if your secrets-share is at `D:\Program Files\aegis-project\secrets-share`, that middle placeholder becomes `"D:\Program Files\aegis-project\secrets-share"` (quotes matter because of the space in "Program Files").

**Why:** `scp` copies files over the same secure SSH connection. `-r` copies the whole folder recursively. The destination puts it inside the cloned project, exactly where `docker-compose.yml` expects it.

**Expect:** Progress lines for each file (`.env`, the certs, `.vscode/settings.json`), each showing 100%.

**If wrong:**
- **Permission denied:** same key issues as before; confirm `-i` points to the private key.
- **"No such file or directory" for the source:** the local path is wrong. On Windows, double-check the exact path and keep it quoted.

**Confirm on the VM:**
```bash
ls -la ~/projects/aegis-project/secrets-share/
```
**Expect:** `.env`, an `infrastructure/` folder, and a `.vscode/` folder.

---

## STEP 4 — FIX THE SYMLINKS

The repo expects `.env` and `infrastructure/nginx/ssl` at specific locations, but the real files live inside `secrets-share/`. This is bridged with symlinks (pointers). The clone may have brought broken symlinks (pointing at old paths from a different machine), so you recreate them cleanly.

```bash
cd ~/projects/aegis-project
rm -f .env infrastructure/nginx/ssl
ln -s "$(pwd)/secrets-share/.env" .env
ln -s "$(pwd)/secrets-share/infrastructure/nginx/ssl" infrastructure/nginx/ssl
```

**Why:** `rm -f` removes any stale/broken symlink without error if it's already gone. `ln -s` creates a fresh symlink pointing at the real file's absolute path on *this* VM. `$(pwd)` inserts the current directory, guaranteeing the link targets this machine's real location rather than some other machine's path.

**Expect:** No output (success).

**Confirm the symlinks actually resolve — this is critical:**
```bash
ls -la .env infrastructure/nginx/ssl
head -3 .env
```

**Why the `head` matters:** `ls -la` only shows what a symlink *claims* to point at — it doesn't prove the target is reachable. `head -3 .env` actually reads *through* the link. If it prints real file content, the link works. If it errors, the link is broken.

**Expect:** `ls` shows both as symlinks (starting with `l`, with `->` pointing into `secrets-share/`). `head -3 .env` prints the first three lines of the real env file (comment lines like `# AEGIS Environment Variables`).

**If wrong:** If `head -3 .env` says "No such file or directory," the symlink target is wrong — confirm `secrets-share/.env` actually exists (Step 3's confirm), then recreate the link.

---

## STEP 5 — PLACE THE HANDBOOK'S CLAUDE CODE FILES

Now transfer and place `CLAUDE.md` and the four slash-command files (from the earlier deliverables). Transfer them from your computer the same way as Step 3, or create them directly. Assuming you `scp` them into `~/projects/aegis-project/` first:

```bash
cd ~/projects/aegis-project
# CLAUDE.md goes at the project root:
ls -la CLAUDE.md

# The four command files go in .claude/commands/:
mkdir -p .claude/commands
# Place aegis-session-start.md, aegis-retrofit-check.md, aegis-verify.md,
# aegis-report-blocker.md into .claude/commands/
ls -la .claude/commands/
```

**Why:** Claude Code reads `CLAUDE.md` from the project root automatically at the start of every session. The `.claude/commands/` files become your `/aegis-session-start`, `/aegis-verify`, etc. slash commands. Both must be in place before your first real session in Document 05.

**Expect:** `CLAUDE.md` at the root; four `.md` files in `.claude/commands/`.

**Confirm Claude Code sees them:** Start Claude Code in the project (`cd ~/projects/aegis-project && claude`), then type `/memory`.
**Expect:** It lists `CLAUDE.md` as a loaded memory file. If it's listed, Claude Code is reading it. Type `/exit` to leave.

---

## STEP 6 — RUN THE AUDIT SCRIPT

The `audit_repo.sh` script (from earlier work) checks that all 68+ files from Sessions 01–16 actually exist and are non-trivial, plus spot-checks critical facts. Transfer it into the project if it's not already there, then:

```bash
cd ~/projects/aegis-project
chmod +x audit_repo.sh
./audit_repo.sh 2>&1 | tee audit_results.txt
```

**Why:** This is your definitive "is the code actually all here" check — the whole reason a fresh clone was worth doing. `tee` shows output on screen *and* saves it to `audit_results.txt` so you can review it later.

**Expect:** A long list of `✓ OK` lines for each file with its line count, a few critical-fact checks passing (PgBouncer 6432, 4 migrations, MinIO absent, 3 Ollama services), the git history summary, and a final `PASS: 71 FAIL: 0 WARN: 1` (the 1 warning is `userlist.txt` being a single line, which is correct).

**If wrong:** Any `✗ FAIL` line names a missing file. If files are genuinely missing, that's a real problem — you're still a repo collaborator, so you can check the source repo's web UI to see whether the file exists there (meaning a clone issue) or never existed (meaning that session was incomplete). Bring any FAIL to a stop-and-report.

---

## GATE — DO NOT PROCEED TO DOCUMENT 05 UNTIL ALL OF THESE ARE TRUE

- [ ] `git log` shows real commit history (~31 commits).
- [ ] `secrets-share/` is present with `.env` inside it.
- [ ] `head -3 .env` prints real content (symlink resolves).
- [ ] `CLAUDE.md` is at the project root and `/memory` in Claude Code lists it.
- [ ] The four slash-command files are in `.claude/commands/`.
- [ ] `./audit_repo.sh` shows **FAIL: 0**.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

The real code is on the VM, secrets are wired in via working symlinks, Claude Code sees your `CLAUDE.md`, and the audit confirms zero missing files. Move to Document 05.
