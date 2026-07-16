# AEGIS Implementation Handbook — Document 02
# Environment Checks — Connect to the VM and See What's There

**Prerequisite:** Document 01 complete (running VM, public IP, SSH key, ports 80/443 open at Oracle level).
**Outcome:** You are logged into the VM, you know exactly what is and isn't installed, and the VM's own firewall is opened.
**Time:** 20–40 minutes.

---

## STEP 1 — CONNECT TO THE VM OVER SSH

You'll connect from your own computer's terminal. On Windows, use **PowerShell** or **Windows Terminal**. On Mac/Linux, use **Terminal**.

First, fix the permissions on your private key (SSH refuses to use a key that's readable by others):

**On Mac/Linux:**
```bash
chmod 600 <path-to-your-private-key>
```

**On Windows PowerShell**, permissions work differently; if you later get a key-permissions error, you'll fix it through the file's Properties → Security dialog. For now, proceed.

Now connect. Ubuntu images on Oracle use the username `ubuntu`:
```bash
ssh -i <path-to-your-private-key> ubuntu@<your-vm-public-ip>
```

**Why:** `-i` points SSH at your private key. `ubuntu@` is the default user for Ubuntu Oracle images. The IP is where your VM lives.

**Expect:** The first time, you'll see a message about the host's authenticity being unverifiable, asking "Are you sure you want to continue connecting?" — type `yes` and press Enter. Then your prompt changes to something like `ubuntu@aegis-dev:~$`. That `ubuntu@` prompt means you are now *on the VM*, not your own computer. Everything you type from now on runs on the Oracle server.

**If wrong:**
- **"Permission denied (publickey)":** wrong key file, or key permissions too open. Confirm you're pointing `-i` at the *private* key (not the `.pub` file), and that you ran `chmod 600` on it.
- **"Connection timed out":** the VM isn't reachable. Confirm the instance is RUNNING in the console and that you typed the correct public IP.

**A note you'll use constantly:** to leave the VM and return to your own computer, type `exit`. To get back, run the `ssh` command again. When following this handbook, assume every command runs *on the VM* unless it explicitly says "on your own computer."

---

## STEP 2 — CONFIRM WHICH MACHINE AND OS YOU'RE ON

```bash
cat /etc/os-release
```

**Why:** This is the single most important sanity check. Everything in this handbook assumes Ubuntu 22.04. This confirms you're actually on it — not, for example, accidentally still in some other shell.

**Expect:** Output including a line `PRETTY_NAME="Ubuntu 22.04...LTS"`.

**If wrong:** If it says anything other than Ubuntu 22.04 (for example "Docker Desktop," which is a mistake seen earlier in this project), you are on the wrong machine. Stop — you likely SSH'd somewhere unexpected or the VM image is wrong. Do not proceed.

```bash
uname -m
```

**Why:** Confirms the CPU architecture. Oracle's free ARM instances are `aarch64`. This matters because some software needs ARM-specific builds.

**Expect:** `aarch64`.

**If wrong:** If it says `x86_64`, you created an AMD/Intel instance, not the ARM Ampere one. That's usable but not what this handbook assumes; the free tier's generous RAM is on the ARM shape. Consider recreating the VM as ARM.

---

## STEP 3 — CHECK WHAT'S INSTALLED (AND WHAT ISN'T)

You'll now run a series of "is this installed?" checks. For each, this handbook tells you how to read the answer. Some things WILL be missing — that's expected, and later documents install them. The point of this step is to *know* the real state, not to assume it.

### git
```bash
git --version
```
**Expect (installed):** `git version 2.x.x`.
**If missing** (`command not found`): note it — you'll install it in Step 5. Ubuntu 22.04 usually has git preinstalled, so it's likely present.

### Python
```bash
python3 --version
```
**Expect:** `Python 3.10.x` (Ubuntu 22.04's default) or `3.11.x`.
**Why this matters:** AEGIS's backend targets Python 3.11 in places. If you see 3.10, that's fine for now — note it; if any later step needs 3.11 specifically, Document 05 addresses it. `python3` is the command on Ubuntu, not `python`.

### pip (Python's package installer)
```bash
pip3 --version
```
**Expect:** `pip 2x.x from ...`.
**If missing:** note it — Step 5 installs it. Very common to be missing on a fresh VM.

### Node.js (needed for the frontend and for Claude Code)
```bash
node --version
```
**Expect (installed):** `v20.x` or `v22.x`.
**If missing:** almost certain on a fresh VM. Note it — Document 03 installs Node, since Claude Code needs it.

### Docker
```bash
docker --version
```
**Expect (installed):** `Docker version 2x.x`.
**If missing:** near-certain on a fresh VM. Document 04 installs it. Docker is the single most important dependency — AEGIS is ~19 Docker services — so its absence now is expected and handled later, not a problem.

**Why run all these now, before installing anything:** So you have a truthful map of the starting state. When a later document says "install Docker," you'll already know whether it was missing (install it) or somehow present (skip). Guessing here causes either wasted work or skipped essentials.

---

## STEP 4 — UPDATE THE SYSTEM PACKAGE LIST

```bash
sudo apt update
```

**Why:** `apt` is Ubuntu's software installer. Before installing anything, it needs a fresh list of what's available from Ubuntu's servers. `sudo` runs the command with administrator rights (required to change system software). You may be asked for your password the first time you use `sudo` — on Oracle Ubuntu images there's often no password prompt because the `ubuntu` user has passwordless sudo, but if asked, it's the password you set (or none).

**Expect:** Several lines of "Get:" and "Hit:" URLs, ending with a summary like "All packages are up to date" or "N packages can be upgraded."

**If wrong:** If this fails with network errors, the VM can't reach the internet — check that the instance is truly running and has a public IP. This is rare on Oracle.

---

## STEP 5 — INSTALL THE BASIC TOOLS THAT MAY BE MISSING

Install git, pip, and a couple of essentials in one command. Installing something already present does no harm — `apt` just skips it.

```bash
sudo apt install -y git python3-pip python3-venv nano curl unzip
```

**Why each:**
- `git` — version control (may already be present; harmless to include).
- `python3-pip` — installs `pip3`, needed for Python dependencies.
- `python3-venv` — lets you make isolated Python environments (good practice for the backend).
- `nano` — a simple text editor. Earlier in this project `nano` was missing and caused friction; installing it now avoids that. (You can also use `vi` if you prefer.)
- `curl` — downloads things from URLs; used by later install steps.
- `unzip` — extracts `.zip` files; Document 04 may need it for the secrets bundle.

**Expect:** apt lists what it will install, downloads, and configures. Ends returning you to the prompt with no error.

**Confirm it worked:**
```bash
git --version && pip3 --version && nano --version | head -1
```
**Expect:** three version lines, one per tool, no "command not found."

---

## STEP 6 — OPEN THE VM'S OWN FIREWALL (deferred from Document 01)

Document 01 opened ports 80 and 443 at Oracle's network level. Now open them on the VM itself, which has its own `iptables` firewall that Ubuntu Oracle images configure restrictively.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
```

**Why:** These insert "allow" rules for incoming HTTP/HTTPS. Without them, even with Oracle's rules open, the VM's own firewall silently drops web traffic. The `-I INPUT 6` inserts the rule at position 6, before the default reject rule that Oracle images place near the end.

**Expect:** No output at all. On Unix, no output from these commands means success.

Now make the rules survive reboots:
```bash
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

**Why:** By default, `iptables` rules vanish on reboot. `iptables-persistent` saves them so they survive. During install you may see two blue dialog boxes asking whether to save current IPv4/IPv6 rules — answer **Yes** to both.

**Expect:** The `save` command prints lines like "run-parts: executing /usr/share/netfilter-persistent/plugins.d/15-ip4tables save".

**If wrong:** If `iptables` commands give "permission denied," you forgot `sudo`. If the blue dialogs don't appear, that's fine — some versions skip them; the `save` command still does the job.

---

## GATE — DO NOT PROCEED TO DOCUMENT 03 UNTIL ALL OF THESE ARE TRUE

- [ ] You can SSH into the VM and see the `ubuntu@...` prompt.
- [ ] `cat /etc/os-release` confirms **Ubuntu 22.04**.
- [ ] `git --version` and `pip3 --version` both return real versions (installed in Step 5 if they weren't before).
- [ ] You have **written down** which of Node and Docker were missing (both likely were — that's expected).
- [ ] The VM firewall rules for 80/443 are added and saved.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

You're logged into a confirmed Ubuntu 22.04 ARM VM, you know exactly what's installed, the basics are in place, and both firewall layers are open. Move to Document 03.
