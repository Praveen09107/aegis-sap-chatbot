# AEGIS — Development Environment Setup
## The Oracle Cloud + VS Code Remote-SSH + Claude Code Workflow
## Place in: docs/DEV_ENVIRONMENT_SETUP.md (project root, alongside ARCHITECTURE.md and ONBOARDING.md)

---

## IS THIS THE RIGHT GUIDE FOR YOU?

`docs/ONBOARDING.md` describes the *original* local-hardware setup path — WSL2, Docker Desktop, running the full 19-service stack directly on your own machine. **Use this guide instead of `ONBOARDING.md` if your local machine cannot comfortably run the full stack** — the original constraint that motivated this guide was a 16GB RAM / 4GB VRAM laptop, but the same approach applies to any machine where running Docker, an IDE, and 15+ containers simultaneously is impractical.

This guide sets up a single environment that serves as **both your development machine and your eventual production deployment target** — you write code, test it, and it stays running afterward, on the same Oracle Cloud VM.

---

## WHAT YOU'RE ACTUALLY SETTING UP

```
Your laptop                          Oracle Cloud VM (2 OCPU / 12GB, ARM)
┌──────────────────┐                ┌─────────────────────────────────┐
│ VS Code           │  SSH tunnel    │ VS Code Server (remote)          │
│ (thin client only)│ ─────────────► │ Claude Code (installed here)     │
│ ~200-400MB RAM     │                │ The actual git repo               │
└──────────────────┘                │ Docker + all 16 non-LLM services  │
                                     └─────────────────────────────────┘
```

Your laptop does almost nothing — it renders the VS Code window. Every file edit, every `docker compose` command, every test run happens on the Oracle VM. This eliminates "works on my machine, fails on the server" entirely, since there's only one machine.

---

## PART 1 — ORACLE CLOUD ACCOUNT AND VM PROVISIONING

### 1.1 Create the Oracle Cloud account

1. Go to `cloud.oracle.com` → **Start for free**
2. Fill in your details. **A credit/debit card is required for identity verification — you will not be charged** as long as you stay within the Always Free resource limits described below.
3. Select **India** as your country during signup, which determines your home region.
4. Complete email and phone verification.

### 1.2 Confirm your home region is ap-south-1 (Mumbai) equivalent

Oracle's Always Free resources are only available in your tenancy's **home region**, set once at signup and not changeable afterward. Confirm this is set to a Mumbai-based region before creating anything.

### 1.3 Request the Always Free compute shape (if not automatically available)

The relevant shape is **`VM.Standard.A1.Flex`** (Ampere ARM architecture) — this is what provides the free **2 OCPUs / 12GB RAM** allocation (confirmed current allocation as of this writing; Oracle has changed this figure before, so verify against Oracle's own "Always Free Resources" page if anything here looks inconsistent with what the console shows you).

If instance creation fails with an "out of host capacity" error, this is a known, common issue for this specific free shape — retry in a different availability domain within the same region, or try again after a few hours. This is not a sign anything is misconfigured on your end.

### 1.4 Create the VM

1. Console → **Compute** → **Instances** → **Create Instance**
2. Name: `aegis-dev` (this same instance is also your eventual production instance — see `docs/CLOUD_DEPLOYMENT_GUIDE.md`)
3. Image: **Canonical Ubuntu 22.04** (ARM/Ampere build)
4. Shape: **Ampere → VM.Standard.A1.Flex**, set to **2 OCPUs / 12GB memory** (the maximum Always Free allocation — do not exceed this or the instance stops being free)
5. Networking: create a new VCN if you don't have one, ensure **"Assign a public IPv4 address"** is checked
6. SSH key: either generate a new key pair here (download and save the private key immediately — it is not recoverable if lost) or upload your own existing public key
7. Boot volume: increase from the default to **100GB** (still within the 200GB Always Free block storage allowance)
8. Click **Create** and wait roughly 2-5 minutes for the instance to reach "Running" state
9. Note the **public IP address** shown on the instance's detail page — you'll need this immediately

### 1.5 Open the required ports

Oracle's default security list only allows SSH (port 22). Before anything else works, add ingress rules for the ports this project needs:

1. Console → **Networking** → **Virtual Cloud Networks** → your VCN → **Security Lists** → the default list
2. Add ingress rules for **TCP 80** and **TCP 443** (source: `0.0.0.0/0`), needed once you deploy the actual application per the cloud deployment guide — not strictly required for development-only setup, but convenient to add now
3. Additionally, on the VM itself (not just the Oracle console), Ubuntu's own firewall may block these ports even after the Oracle-level rule is added:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## PART 2 — SSH ACCESS FROM YOUR LAPTOP

### 2.1 Set up a convenient SSH config entry

On your laptop, edit (or create) `~/.ssh/config`:

```
Host aegis-dev
    HostName <your-oracle-vm-public-ip>
    User ubuntu
    IdentityFile ~/.ssh/<your-private-key-file>
```

Replace both placeholders with your actual values from Step 1.4.

### 2.2 Confirm you can connect

```bash
ssh aegis-dev
```

You should land in a shell on the Oracle VM. If this fails, the most common causes are: the private key file's permissions being too open (`chmod 600 ~/.ssh/<your-key-file>`), the security list not allowing port 22 from your current IP, or a typo in the public IP.

---

## PART 3 — VS CODE REMOTE-SSH

### 3.1 Install the extension

In VS Code, install **"Remote - SSH"** (published by Microsoft) from the Extensions panel.

### 3.2 Connect

`Cmd/Ctrl+Shift+P` → **"Remote-SSH: Connect to Host"** → select `aegis-dev` (it will read this from your `~/.ssh/config` automatically).

A new VS Code window opens. Its title bar or bottom-left corner should show `SSH: aegis-dev`, confirming you are now editing files that live on the Oracle VM, not your laptop.

### 3.3 Install Claude Code — on the remote host, not locally

**This is the step people get wrong.** While connected via Remote-SSH, open the Extensions panel again. If Claude Code isn't already installed for this remote target, you'll see an install button distinctly labeled for the remote context (something like **"Install in SSH: aegis-dev"**), separate from the normal local install button. Click that one specifically.

If you instead use the extension's normal local install button while a Remote-SSH window is focused, you may end up with Claude Code installed on your laptop with no access to the Oracle filesystem — check afterward that Claude Code's chat panel is genuinely reading files from `/home/ubuntu/...` (or wherever you clone the repo below), not asking you to open a local folder.

### 3.4 Authenticate

Sign in to Claude Code as normal (API key or subscription login) — this happens once, inside this remote session.

---

## PART 4 — PROJECT SETUP ON THE VM

### 4.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
docker --version
```

### 4.2 Install Docker Compose plugin (if not bundled)

```bash
sudo apt-get update
sudo apt-get install docker-compose-plugin -y
docker compose version
```

### 4.3 Clone the repository

```bash
cd ~
git clone <your-repository-url> aegis-project
cd aegis-project
```

### 4.4 Confirm the remote VS Code window is pointed at this folder

`File → Open Folder` (within the Remote-SSH window) → select `/home/ubuntu/aegis-project`.

### 4.5 Set up `.env`

**The TLS certificate path question (`AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5) was just resolved by direct check: `infrastructure/nginx/ssl/` doesn't exist as a bare directory at all — the real files live only in `secrets-share/`, and the fix is a one-time symlink.** The same `secrets-share/` design very likely applies to `.env` too. Check before proceeding:

```bash
ls -la .env
```

**If this shows "No such file or directory"** (matching the TLS finding exactly), apply the same fix:
```bash
mkdir -p secrets-share
cp .env.example secrets-share/.env
ln -s "$(pwd)/secrets-share/.env" .env
nano secrets-share/.env    # edit the real file; .env now symlinks to it
```

**If `.env` already exists as a real file** (not matching the TLS pattern), just edit it directly — `docker-compose.yml`'s `env_file: - .env` reads from the project root either way, so a direct file works exactly as well as a symlink:
```bash
cp .env.example .env
nano .env
```

Fill in real values, in particular: `CEREBRAS_API_KEY`, `GROQ_API_KEY` (see `AMENDMENT_INFERENCE_ARCHITECTURE.md` for where these come from), database/Redis/MinIO credentials, and `AEGIS_COMPANY_NAME`/`AEGIS_COMPANY_INDUSTRY` (see `AMENDMENT_GENERALIZATION_BACKEND.md`).

---

## PART 5 — VERIFYING THE WHOLE SETUP WORKS

```bash
# Confirm Docker works
docker compose config --services

# Confirm Claude Code is actually operating on the remote filesystem, not locally
pwd   # run this in Claude Code's terminal — should show /home/ubuntu/aegis-project

# Confirm the ARM64 architecture (relevant per DECISIONS_LOG.md DEC-014)
uname -m   # expect aarch64
```

If all three succeed, you have a working development environment. Proceed with whichever backend or frontend session you're currently on, per `BACKEND_AGENT_SESSION_GUIDE_v4.md` or `FRONTEND_AGENT_SESSION_GUIDE_v2.md`.

---

## RESOURCE BUDGET REMINDER WHILE DEVELOPING

You have 12GB RAM total on this VM. Per `AMENDMENT_INFERENCE_ARCHITECTURE.md`, no LLM is self-hosted by default (`INFERENCE_MODE=external`), so you are not competing with a loaded model for memory during normal development — the full remaining budget is available for the 16 non-LLM services plus MinIO. If you are specifically testing `INFERENCE_MODE=local` (the air-gapped path), be aware this loads a real model into memory and will consume several GB while active — do not run this alongside heavy concurrent Docker rebuilds.

---

## WHAT THIS GUIDE DOES NOT COVER

Making this environment publicly accessible (domain, TLS certificate, production `.env` values, monitoring/alerting) is covered in `docs/CLOUD_DEPLOYMENT_GUIDE.md`, not here — this guide only gets you to the point of being able to develop and test.

---

*Related: `DECISIONS_LOG.md` DEC-007, DEC-008, DEC-009, DEC-013, DEC-014, DEC-032.*
