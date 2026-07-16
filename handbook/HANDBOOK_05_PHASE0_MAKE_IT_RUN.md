# AEGIS Implementation Handbook — Document 05
# Phase 0 — Make the Existing Code Actually Run

**Prerequisite:** Document 04 complete (code, secrets, symlinks, audit clean).
**Outcome:** Real API keys in `.env`, all dependencies installed, the full existing test suite passing, and the entire Docker stack running healthy. This is the gate before you touch any code.
**Time:** 1–3 hours (Docker's first startup pulls many images; the ARM build of some services is slow).

---

## WHY THIS DOCUMENT IS NON-NEGOTIABLE

Everything so far confirmed the code *exists*. This document confirms it *works*. That's a completely different claim. You will spend the next many sessions modifying this code — if the foundation is subtly broken *now*, every modification stacks on top of that break, and when something finally fails it'll look like your new work's fault when it was actually broken from the start. Proving the base works first means every future failure is genuinely about the change you just made. Do not skip any part of this.

---

## STEP 1 — GET YOUR CEREBRAS AND GROQ API KEYS

AEGIS's default `INFERENCE_MODE=external` sends all AI work to Cerebras (primary) and Groq (fallback) over the network. You need free API keys from both.

- **Cerebras:** Go to `https://cloud.cerebras.ai/`, sign up, and create an API key in the dashboard.
- **Groq:** Go to `https://console.groq.com/`, sign up, and create an API key.

**Why both:** The architecture uses Cerebras as primary and Groq as fallback (and vice-versa for vision). Both keys are needed for the failover design to function. Both have free tiers sufficient for development and a low-traffic demo.

**Expect:** Each gives you a key string (Cerebras keys and Groq keys look different but both are long strings). Copy them somewhere temporary — you'll paste them into `.env` next.

---

## STEP 2 — FILL IN THE REAL VALUES IN `.env`

Open the real env file for editing. Remember `.env` is a symlink, so edit the real file it points to:

```bash
cd ~/projects/aegis-project
nano secrets-share/.env
```

**Why edit `secrets-share/.env` and not `.env`:** They're the same file (via the symlink), but editing the real path avoids any editor confusion with symlinks. `nano` is the simple editor you installed in Document 02.

Inside, find and set at minimum these values (use the arrow keys to navigate; type to replace the placeholder after each `=`):
- `CEREBRAS_API_KEY=` → paste your Cerebras key
- `GROQ_API_KEY=` → paste your Groq key
- Confirm `INFERENCE_MODE=external` (should already be the default)

For the database/Redis/Keycloak passwords already present as dev defaults (like `aegis_admin_dev_2024`): **leave them as-is for now.** They're fine for development. You'll harden them only at production go-live (Document 10).

**Save and exit nano:** Press `Ctrl+O` then `Enter` (writes the file), then `Ctrl+X` (exits).

**Why leave dev passwords alone:** Changing them now means also changing them in `docker-compose.yml`'s references, creating room for mismatches. Development uses the known dev defaults consistently; production hardening is a deliberate, separate step later.

**Confirm your keys landed:**
```bash
grep -E "CEREBRAS_API_KEY|GROQ_API_KEY|INFERENCE_MODE" secrets-share/.env
```
**Expect:** Three lines showing your real keys (not the placeholder text) and `INFERENCE_MODE=external`.

---

## STEP 3 — INSTALL DOCKER (if Document 02 found it missing)

Most likely Docker was absent on the fresh VM. Install it via the official convenience script:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

**Why:** This is Docker's official one-line installer. It detects Ubuntu and installs the current Docker Engine plus the Compose plugin. `sudo` because installing system software needs admin rights.

**Expect:** A few minutes of output ending with Docker version info.

Now let your `ubuntu` user run Docker without `sudo` every time:
```bash
sudo usermod -aG docker ubuntu
newgrp docker
```

**Why:** By default Docker requires `sudo`. Adding your user to the `docker` group lets you run `docker` commands directly. `newgrp docker` applies the group change to your current session without a full logout.

**Confirm:**
```bash
docker --version
docker compose version
docker run hello-world
```
**Expect:** Version lines for both, then `hello-world` downloads a tiny test image and prints "Hello from Docker!" — proof Docker works end to end.

**If wrong:** If `docker run hello-world` gives a permission error, the group change didn't take — run `newgrp docker` again, or fully log out (`exit`) and SSH back in.

---

## STEP 4 — INSTALL THE BACKEND PYTHON DEPENDENCIES

```bash
cd ~/projects/aegis-project
pip3 install -r backend/requirements-dev.txt --break-system-packages
```

**Why:** `requirements-dev.txt` lists everything the backend and its tests need (including `pytest`). `-r` means "read this requirements file." `--break-system-packages` is required on Ubuntu 22.04+ because it protects system Python by default; this flag permits installing into it (acceptable here since this VM is dedicated to this one project).

**Expect:** pip downloads and installs many packages; ends returning to the prompt. Some ARM builds compile from source and take a while — patience is normal.

**Confirm:**
```bash
pytest --version
```
**Expect:** A pytest version line — proof the dev dependencies installed.

**If wrong:** If a package fails to build on ARM, note the exact package and error — some Python packages need a system library first (e.g., `sudo apt install -y build-essential python3-dev`). Install that, then re-run the pip command.

---

## STEP 5 — RUN THE EXISTING TEST SUITE

```bash
cd ~/projects/aegis-project
pytest tests/unit/ backend/tests/unit/ -v
```

**Why:** These are the tests Sessions 01–16 already wrote. Passing them proves the existing code is not just present but *behaviorally correct* — the strongest evidence that your foundation is solid before you modify anything. `-v` (verbose) shows each test by name.

**Expect:** A long list of test names each ending in `PASSED`, then a green summary like `141 passed in X.XXs`. The exact count will be in the low hundreds across all the session test files.

**If wrong:** Any `FAILED` test is a real problem to resolve *here*, before proceeding. Read the failure — pytest shows exactly which assertion failed and why. Common causes: a missing dependency (install it), or a test needing a running service that isn't up yet (a few integration-style tests may need Docker running — if so, come back to them after Step 6). If a genuine logic failure exists in the existing code, that's a stop-and-report: bring the exact test name and failure output.

---

## STEP 6 — START THE FULL DOCKER STACK

This is the big one — bringing all ~19 services up together.

```bash
cd ~/projects/aegis-project
docker compose up -d
```

**Why:** `up` creates and starts every service defined in `docker-compose.yml`. `-d` (detached) runs them in the background so you get your prompt back. On first run, Docker must *pull* every base image (Postgres, Redis, Qdrant, OpenSearch, Keycloak, Vault, Nginx, etc.) and *build* the custom ones (the BGE and DeBERTa services, the backend). This is the slow step — potentially 30+ minutes on first run, especially building ARM images.

**Expect:** A long stream of "Pulling", "Building", and "Creating" / "Started" lines, one per service, ending back at your prompt.

**If wrong:**
- **"env file .env not found":** the symlink broke — revisit Document 04 Step 4.
- **A build failure for `aegis-bge` or `aegis-deberta`:** read the error; ARM builds of ML libraries occasionally need a base-image tweak. Note the exact service and error for stop-and-report.
- **Out of disk space:** `df -h` — if the boot volume is full, you under-sized it (should be 100GB per Document 01).

---

## STEP 7 — CONFIRM EVERY SERVICE IS HEALTHY

Starting is not the same as healthy. Check real health:

```bash
docker compose ps
```

**Why:** This lists every service with its status. "running" means the container started; "healthy" means its healthcheck actually passed (the service is truly ready). You want healthy, not just running.

**Expect:** Every service listed with State `running` and, for those with healthchecks, `(healthy)`. Some services (OpenSearch, Keycloak, the DeBERTa model service) take minutes to reach healthy after starting — their healthchecks have long start periods. Re-run `docker compose ps` every minute until they settle.

**If a service is stuck "unhealthy" or "restarting" after ~5 minutes**, inspect its logs:
```bash
docker compose logs <service-name> --tail=50
```
For example `docker compose logs aegis-fastapi --tail=50`. The logs almost always name the real problem (a missing env value, a failed connection to another service, etc.).

**Confirm the whole system responds:**
```bash
curl -sf http://localhost:8000/health | python3 -m json.tool
```
**Why:** Hits the backend's health endpoint through the running stack. This is the single best "is AEGIS alive" check.
**Expect:** A JSON response reporting health status for the subsystems (Redis, Qdrant, OpenSearch, Postgres, etc.).

---

## GATE — DO NOT PROCEED TO DOCUMENT 06 UNTIL ALL OF THESE ARE TRUE

- [ ] Your real Cerebras and Groq keys are in `.env` (confirmed via `grep`).
- [ ] `docker run hello-world` worked (Docker functional).
- [ ] `pytest` shows all existing tests **passing**.
- [ ] `docker compose ps` shows every service **running**, and the ones with healthchecks **healthy**.
- [ ] `curl http://localhost:8000/health` returns JSON.

This gate is the most important one in the entire handbook. Everything after here assumes a working, healthy base. If any box is unchecked, you are not ready for implementation — resolve it first, even if it takes another session.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

Real code runs, real tests pass, the real stack is healthy, and the health endpoint responds. The foundation is proven. You are now ready to implement. Move to Document 06.

---

## BATCH NOTE

This is the end of the one-time setup documents (00–05). Documents 06–10 are the implementation core — the repeating session pattern for retrofits, backend builds, Quick Entry, frontend, and finally production. They are delivered as the next batch.
