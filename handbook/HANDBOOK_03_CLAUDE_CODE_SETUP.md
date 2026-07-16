# AEGIS Implementation Handbook — Document 03
# Claude Code Setup — Your Implementation Tool

**Prerequisite:** Document 02 complete (on the VM, basics installed, firewalls open).
**Outcome:** Node.js installed, Claude Code installed and logged in, VS Code connected to the VM remotely, and your `CLAUDE.md` + slash commands in place.
**Time:** 30–45 minutes.

---

## WHY THIS DOCUMENT EXISTS

Every implementation session from Document 05 onward is driven *through Claude Code*. Claude Code is the tool that reads the spec documents, writes the code, and runs the verification commands. This document gets it installed on the VM and connected to VS Code on your own computer, so you can watch and direct the work through a real editor instead of a bare terminal.

There are two ways to run Claude Code, and this handbook uses both together:
- **Claude Code itself** lives and runs *on the VM* (where the code is).
- **VS Code on your own computer** connects *to the VM* over SSH, giving you a real editor window showing the VM's files, with Claude Code available inside it.

---

## STEP 1 — INSTALL NODE.JS ON THE VM

Claude Code needs Node.js. Install the current LTS version using the official NodeSource setup:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

**Why:** The first line adds NodeSource's official package repository (more current than Ubuntu's built-in Node). The second installs Node 22 plus `npm` (Node's package manager). Claude Code is distributed as an npm package, so this is a hard prerequisite.

**Expect:** The first command prints setup progress ending around "Repository configured successfully." The second installs and returns to the prompt.

**Confirm:**
```bash
node --version && npm --version
```
**Expect:** `v22.x.x` and a npm version like `10.x.x`.

**If wrong:** If `node` still says "command not found" after this, the NodeSource step failed silently — re-run both commands and read the first command's output for any error line.

---

## STEP 2 — INSTALL CLAUDE CODE ON THE VM

```bash
npm install -g @anthropic-ai/claude-code
```

**Why:** `-g` installs it globally (available from any directory, not just one project). This is the official Claude Code package.

**Expect:** npm downloads and installs; ends with a summary line mentioning added packages. May show harmless warnings.

**Confirm:**
```bash
claude --version
```
**Expect:** A version number.

**If wrong:** "command not found" after install usually means npm's global bin directory isn't on your PATH. Run `npm config get prefix` — it prints a path (e.g., `/usr/local`); Claude Code's binary is in that path's `/bin`. On most Oracle Ubuntu setups the global install just works. If it doesn't, log out (`exit`) and SSH back in — that reloads your PATH.

---

## STEP 3 — LOG IN TO CLAUDE CODE

```bash
claude
```

**Why:** Running `claude` with no arguments starts an interactive session. The very first time, it walks you through authentication.

**Expect:** A welcome screen, then a prompt to log in — it gives you a URL to open in your browser and a code to paste back, or opens a browser flow. Follow it to sign in with your Anthropic account (the same one you use for Claude).

**Once logged in:** you'll see Claude Code's interactive prompt. For now, type `/exit` (or press Ctrl+C twice) to leave — you'll come back to it properly once the project is set up in Document 04. This step is only to confirm login works.

**If wrong:** If the browser flow won't complete (common on a headless server with no browser), Claude Code provides a copy-paste code method — read the on-screen instructions; it's designed for exactly this remote situation.

---

## STEP 4 — CONNECT VS CODE ON YOUR OWN COMPUTER TO THE VM

**This step runs on your own computer, not the VM.**

1. Open VS Code on your computer.
2. Install the extension **"Remote - SSH"** (published by Microsoft) from the Extensions panel (the square icon in the left bar; search "Remote - SSH").
3. Press `F1` (or `Ctrl/Cmd+Shift+P`) to open the command palette, type **"Remote-SSH: Connect to Host"**, and select it.
4. Choose **"Add New SSH Host"** and enter:
   ```
   ssh -i <path-to-your-private-key> ubuntu@<your-vm-public-ip>
   ```
5. It asks which SSH config file to update — pick the default (usually your user folder's `.ssh/config`).
6. Now run "Remote-SSH: Connect to Host" again and select your VM (it'll show by IP or the name you gave).

**Why:** This makes VS Code's entire window operate *on the VM*. You edit VM files, open VM terminals, and run Claude Code — all through VS Code, from the comfort of your own computer. This is far more pleasant than a bare SSH terminal for a long implementation.

**Expect:** A new VS Code window opens. Bottom-left corner shows a green box reading `SSH: <your-vm-ip>`. The first connection takes a minute while VS Code installs its server component on the VM.

**If wrong:** If it can't connect, the same key/permissions/IP causes as Document 02 Step 1 apply. Confirm plain `ssh` still works from a terminal first, then retry VS Code.

---

## STEP 5 — INSTALL CLAUDE CODE INSIDE VS CODE (ON THE REMOTE)

With the VS Code window connected to the VM (green `SSH:` box showing):

1. Open the Extensions panel again.
2. Search for **"Claude Code"** (Anthropic's extension).
3. You'll see an install button labeled for the remote context — something like **"Install in SSH: \<your-vm-ip\>"**. Click **that one specifically**.

**Why this exact button matters:** VS Code distinguishes extensions installed locally (on your computer) versus remotely (on the VM). Claude Code must run on the VM, where the code is. Clicking the plain local "Install" button installs it in the wrong place — it won't see the VM's files. This is the single most common mistake in this setup, which is why it gets its own warning.

**Expect:** After installing, a Claude Code panel/icon appears in VS Code. Because you already logged in via terminal in Step 3, it should recognize your session.

**Confirm:** Open a terminal inside VS Code (menu: Terminal → New Terminal — this terminal runs *on the VM*), and run:
```bash
pwd
```
It should show a VM path like `/home/ubuntu`, confirming the VS Code terminal is genuinely on the VM, not your computer.

---

## STEP 6 — THE HANDBOOK'S CLAUDE CODE FILES (you'll place these in Document 04)

You have four Claude-Code-specific files from earlier work: `CLAUDE.md`, and three slash-command files that belong in `.claude/commands/`. **You do not place them yet** — they go into the project folder, which doesn't exist on the VM until Document 04 clones it. This step just makes you aware they're coming, so when Document 04 says "now place `CLAUDE.md`," you know what it means.

For reference, once the project exists, these will live at:
```
~/projects/aegis-project/CLAUDE.md
~/projects/aegis-project/.claude/commands/aegis-session-start.md
~/projects/aegis-project/.claude/commands/aegis-retrofit-check.md
~/projects/aegis-project/.claude/commands/aegis-verify.md
~/projects/aegis-project/.claude/commands/aegis-report-blocker.md
```

---

## GATE — DO NOT PROCEED TO DOCUMENT 04 UNTIL ALL OF THESE ARE TRUE

- [ ] `node --version` and `npm --version` both work on the VM.
- [ ] `claude --version` works on the VM.
- [ ] You logged in to Claude Code successfully at least once.
- [ ] VS Code on your computer connects to the VM (green `SSH:` box).
- [ ] Claude Code is installed in VS Code **on the remote** (a VS Code terminal's `pwd` shows a VM path).

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

Node and Claude Code are installed on the VM, you've logged in, and VS Code connects remotely with Claude Code available on the VM side. Move to Document 04.
