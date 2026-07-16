# AEGIS Implementation Handbook — Document 10
# Production Go-Live — Making AEGIS Public

**Prerequisite:** Document 09 complete (the full product works end-to-end in a browser against the real backend).
**Outcome:** AEGIS live on a real public domain, with a real TLS certificate, reachable by anyone you share the URL with.
**Time:** 2–4 hours, plus DNS propagation waiting time.

---

## WHAT CHANGES FROM DEVELOPMENT TO PRODUCTION

Until now, you've reached AEGIS at `http://localhost:8000` or the VM's raw IP — fine for building, wrong for showing anyone. Going to production means four concrete additions:
1. A real **domain name** instead of a bare IP.
2. A real, browser-trusted **TLS certificate** (the padlock) instead of the self-signed dev cert.
3. **Production-appropriate secret values** instead of dev defaults.
4. A **keep-alive** mechanism so Oracle doesn't reclaim your idle free instance.

This document walks the sequence and hands off to `docs/CLOUD_DEPLOYMENT_GUIDE.md` for the detailed commands at each step — that guide is the source of truth for the exact commands; this document is the ordering and the "why" around them, so you don't have to figure out how the pieces fit.

**Why reference that guide instead of repeating it:** duplicating those commands here would create two copies that drift apart the first time either is corrected — the same discipline used throughout this project. You'll open `CLOUD_DEPLOYMENT_GUIDE.md` at the moments this document tells you to.

---

## STEP 1 — GET A DOMAIN AND POINT IT AT THE VM

Buy a domain (any registrar). A low-cost `.dev` or `.app` (~$10–15/year) looks more credible for a portfolio than a free one — a one-time cost, not recurring infrastructure cost, so it doesn't conflict with the zero-recurring-cost design of this project.

Then create a DNS **A record** pointing your domain at your VM's public IP.

**→ Open `docs/CLOUD_DEPLOYMENT_GUIDE.md`, Part 1** for the exact A-record fields and the `dig` command to confirm propagation.

**Why first:** The TLS certificate (Step 2) is issued *for a domain* and requires the domain to already resolve to your VM. Domain must come before cert.

**Expect:** After DNS propagates (minutes to a few hours), `dig yourdomain.com +short` returns your VM's IP.

---

## STEP 2 — GET A REAL TLS CERTIFICATE

Replace the self-signed dev certificate with a free, trusted Let's Encrypt certificate via Certbot.

**→ Follow `docs/CLOUD_DEPLOYMENT_GUIDE.md`, Part 2** — it walks through installing Certbot, issuing the cert (briefly stopping Nginx so Certbot can validate on port 80), pointing Nginx at the new cert via `docker-compose.prod.yml`, and setting up auto-renewal.

**Two things that document flags and you must respect:**
- The real self-signed cert lives via symlink at `infrastructure/nginx/ssl` → `secrets-share/...`. The production cert from Let's Encrypt is mounted separately through `docker-compose.prod.yml` — you don't overwrite the dev cert, you add the production mount.
- From here on you start the stack with **both** compose files:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
  ```
  Not the plain `docker compose up -d` you've used for development. The prod file adds the real-cert mount.

**Why a real cert matters:** A self-signed cert shows a scary browser warning on a public URL — it looks broken to anyone you share it with, even though the encryption is technically fine. A Let's Encrypt cert gives the normal padlock.

**Expect:** `curl -vI https://yourdomain.com` shows "SSL certificate verify ok", and the site loads in a browser with a padlock, no warning.

---

## STEP 3 — HARDEN THE PRODUCTION SECRETS

Now, and only now, replace the dev-default passwords you deliberately left alone throughout development.

**→ Follow `docs/CLOUD_DEPLOYMENT_GUIDE.md`, Part 3** — it has the table of exactly which `.env` values to change (database, MinIO, Keycloak passwords → real random secrets via `python3 -c "import secrets; print(secrets.token_hex(32))"`), which to point at the real domain (the `NEXT_PUBLIC_API_URL`/`WS_URL` values), and which to confirm unchanged (`INFERENCE_MODE=external` — do NOT accidentally ship `local`).

**Why now and not earlier:** Changing these mid-development invites mismatches between the value in `.env` and the value some service expects, causing confusing failures while you're still building. Doing it once, deliberately, at go-live — with the whole system already proven to work on dev defaults — means any post-change failure is clearly about the secret change, nothing else. Re-run the stack after changing these and confirm health.

**Expect:** After updating and restarting, `docker compose ps` is still all-healthy with the new secrets, and `/health` still returns green.

---

## STEP 4 — SEED THE DEMO CONTENT

An empty AEGIS isn't a demo. Load the synthetic SAP knowledge corpus so there's something to ask about.

**→ Follow `docs/DEMO_CONTENT_GUIDE.md`** for what the corpus should contain (fictional-company SAP error guides, procedures, config notes across the module set) and how to load it through the real ingestion pipeline (not a direct DB insert — loading it properly exercises MinIO, chunking, and indexing end-to-end).

**Why through the real pipeline:** Loading via the actual ingestion path confirms Session 18's work handles real content, and pre-populates the semantic cache for common questions so a first-time visitor gets fast answers.

**Expect:** A handful of documents per SAP module ingested; a test employee question returns a grounded answer citing the seeded content.

---

## STEP 5 — SET UP KEEP-ALIVE

Oracle can reclaim an idle free instance. Since AEGIS is a low-traffic demo, genuine idle periods are real.

**→ Follow `docs/CLOUD_DEPLOYMENT_GUIDE.md`, Part 4** — set up a free UptimeRobot monitor hitting `https://yourdomain.com/health` every few minutes. This does double duty: keeps the instance genuinely active *and* alerts you if the site ever goes down.

**Why:** Without this, a quiet week could get your instance reclaimed, and you'd lose the running deployment (code is safe in git; the running stack and its data are not). The monitor is the cheapest insurance against that.

---

## STEP 6 — THE FINAL GO-LIVE CHECKLIST

**→ Run `docs/CLOUD_DEPLOYMENT_GUIDE.md`, Part 5** — its checklist is the authoritative final gate. It confirms: the full stack starts clean from both compose files; `/health` shows all 6 keys healthy; TLS verifies as real; the frontend loads over HTTPS with no mixed-content warnings; a real end-to-end query works through the live Cerebras/Groq routing; and the demo corpus is loaded.

**Why a dedicated final checklist:** Going live touches many moving parts at once (DNS, TLS, secrets, compose files). The checklist catches the one you might have half-finished before you announce the URL to anyone.

---

## GATE — AEGIS IS LIVE WHEN ALL OF THESE ARE TRUE

- [ ] `https://yourdomain.com` loads in a browser with a real padlock, no warning.
- [ ] A real employee question returns a grounded, sourced answer against the live inference providers.
- [ ] Admin portal works over HTTPS.
- [ ] `/health` shows all 6 subsystems healthy on the live domain.
- [ ] Demo corpus is loaded and queryable.
- [ ] UptimeRobot monitor is active.
- [ ] Production secrets are real (no dev defaults on a public deployment).

---

## AFTER GO-LIVE — WHAT'S DELIBERATELY NOT HERE

This handbook stops at a working, public, secure demo — which is the goal. Some things are intentionally deferred to a later "Phase B" (they live in `specs/tier6_production/`, currently a placeholder): production-grade Vault secret management, automated backup/disaster-recovery for the Docker volumes, load testing, and a formal security audit. None of these block a portfolio/demo go-live; all are worth doing if AEGIS ever moves toward real production use with real users. That's a separate journey for another day.

---

## YOU ARE DONE WITH THIS DOCUMENT — AND THE HANDBOOK — WHEN

AEGIS is live on your domain, secured, seeded, monitored, and answering real questions. You've taken it from "files exist but nothing runs" all the way to a public, working product. That's the whole journey. Congratulations.

---

## THE COMPLETE HANDBOOK, AT A GLANCE

| Doc | You did this |
|---|---|
| 00 | Learned how to use the handbook |
| 01 | Created the Oracle VM |
| 02 | Confirmed the environment, opened firewalls |
| 03 | Installed Claude Code + VS Code remote |
| 04 | Got the code and secrets onto the VM |
| 05 | Proved the existing code runs (Phase 0 gate) |
| 06 | Retrofitted Sessions 16, 10, 13, 15 |
| 07 | Built backend Sessions 17, 18, 21, 22 |
| 08 | Built Quick Entry (23–29) |
| 09 | Built the frontend (F01–F19) |
| 10 | Took it live on Oracle |

Keep this handbook. If you ever rebuild, onboard someone, or return after a break, it's the complete record of how AEGIS goes from nothing to live.
