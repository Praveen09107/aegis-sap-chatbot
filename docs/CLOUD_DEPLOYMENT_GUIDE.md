# AEGIS — Cloud Deployment Guide
## Taking the Oracle VM from Development to Live, Public Production
## Place in: docs/CLOUD_DEPLOYMENT_GUIDE.md (project root)

---

## SCOPE — HOW THIS DIFFERS FROM DEV_ENVIRONMENT_SETUP.md

`docs/DEV_ENVIRONMENT_SETUP.md` gets you to the point of being able to write and test code on the Oracle VM. This guide covers everything additional needed to make that same VM **publicly accessible, secure, and durable** — a real domain, a trusted TLS certificate, production-grade environment values, and a way to keep the instance alive. Ongoing operational response to things going wrong *after* go-live is `docs/TROUBLESHOOTING_RUNBOOK.md`'s job, not this guide's — this document is about the cutover itself, once.

---

## PART 1 — DOMAIN

### 1.1 Get a domain

Any registrar works. A free option (Freenom-style) is acceptable for a portfolio deployment; a low-cost `.dev` or `.app` domain (usually $10-15/year) looks more credible to a recruiter and is a one-time cost, not a recurring infrastructure cost — this does not conflict with the zero-recurring-infrastructure-cost constraint established in `DECISIONS_LOG.md` DEC-002, since a domain is a one-time purchase per DEC-002's own distinction between one-time and recurring cost.

### 1.2 Point it at your Oracle VM

Create an **A record** at your registrar:
```
Type: A
Host: @ (or a subdomain like "aegis")
Value: <your Oracle VM's public IP>
TTL: 300 (or your registrar's default)
```

Propagation typically takes minutes to a few hours. Confirm with:
```bash
dig yourdomain.com +short
# should return your Oracle VM's public IP
```

---

## PART 2 — TLS CERTIFICATE (REAL, TRUSTED — NOT THE SELF-SIGNED DEV CERT)

The self-signed certificate from `IMPL_02` (regenerated with a generic subject per `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5) is fine for local development, where browser certificate warnings are expected and ignorable. **For a public deployment, use a real, trusted certificate instead** — a self-signed cert on a live portfolio URL looks broken to a recruiter, not just technically imperfect.

### 2.1 Install Certbot

```bash
sudo apt-get update
sudo apt-get install certbot -y
```

### 2.2 Issue the certificate

Stop Nginx temporarily (Certbot needs port 80 free for domain validation):
```bash
docker compose stop aegis-nginx
sudo certbot certonly --standalone -d yourdomain.com
docker compose start aegis-nginx
```

### 2.3 Point Nginx at the real certificate

Update the Nginx config's certificate paths to Certbot's output location (`/etc/letsencrypt/live/yourdomain.com/fullchain.pem` and `privkey.pem`) instead of the self-signed cert. **Confirmed via direct check (`ls -la infrastructure/nginx/ssl/` returned "No such file or directory"):** the real cert files live only in `secrets-share/infrastructure/nginx/ssl/`, with a symlink at `infrastructure/nginx/ssl` pointing there (set up per `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5) — `docker-compose.yml`'s mount reads through this symlink, so no change to `docker-compose.yml` itself is needed.

**Use `docker-compose.prod.yml` for this, not an inline edit to `docker-compose.yml`.** This file already exists in the project but was never populated — it's a placeholder describing a now-superseded plan (`DECISIONS_LOG.md` DEC-025). Its legitimate purpose is exactly this: production-specific overrides via Docker Compose's real override mechanism. Add the Let's Encrypt volume mount here:

```yaml
# docker-compose.prod.yml
services:
  aegis-nginx:
    volumes:
      - /etc/letsencrypt/live/yourdomain.com:/etc/nginx/ssl/letsencrypt:ro
```

Deploy with both files: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` — not just `docker compose up -d` as earlier steps in this project's other documents may imply for local development. The Ollama-services-as-opt-in-profile change (`AMENDMENT_INFERENCE_ARCHITECTURE.md` FILE 6) already handles keeping Ollama out of the default `docker compose up`, so `docker-compose.prod.yml` does not need to duplicate that — its only current job is the TLS mount above.

### 2.4 Set up auto-renewal

Let's Encrypt certificates expire every 90 days.
```bash
sudo certbot renew --dry-run   # confirm this works before relying on it
echo "0 3 * * * certbot renew --pre-hook 'docker compose stop aegis-nginx' --post-hook 'docker compose start aegis-nginx'" | sudo crontab -
```

---

## PART 3 — PRODUCTION ENVIRONMENT VALUES

Before going live, review `.env` (project root — `docker-compose.yml` specifies `env_file: - .env` for both `aegis-fastapi` and `aegis-arq`. This may be a real file or, matching the confirmed TLS-cert pattern, a symlink into `secrets-share/.env` — see `docs/DEV_ENVIRONMENT_SETUP.md` Section 4.5 for the check-and-fix steps if you haven't already run them) specifically for values that were acceptable placeholders during development but are not acceptable for a public deployment:

| Variable | Development value | Production requirement |
|---|---|---|
| `POSTGRES_PASSWORD`, `MINIO_SECRET_KEY`, `KEYCLOAK_ADMIN_PASSWORD`, etc. | Placeholder/simple | Generate real random secrets: `python3 -c "import secrets; print(secrets.token_hex(32))"` for each |
| `VAULT_DEV_ROOT_TOKEN` | `aegis-dev-root-token` | Vault dev mode is acceptable for this project's scope per `DECISIONS_LOG.md` (production Vault mode is a `tier6_production` / Phase B item, deliberately deferred) — do not treat this as a go-live blocker, but do not expose Vault's port externally either |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | `localhost` | Your real domain, `https://`/`wss://` |
| `AEGIS_COMPANY_NAME`, `AEGIS_COMPANY_INDUSTRY` | Any dev value | The actual demo company identity you want shown publicly |
| `INFERENCE_MODE` | `external` (already the default) | Confirm still `external` — do not accidentally deploy with `local` set, since that would try to start Ollama containers that aren't provisioned for production load |
| `CEREBRAS_API_KEY`, `GROQ_API_KEY` | Your personal keys, used during dev | Same keys are fine to reuse for the public demo — see rate-limit headroom notes in `AEGIS_INFERENCE_MODEL_SELECTION.md`, which already accounts for the rare/on-demand traffic pattern this deployment expects |

**CORS configuration:** confirm the Nginx/FastAPI CORS allow-list includes your real domain, not just `localhost`.

---

## PART 4 — KEEP-ALIVE (PREVENTING ORACLE IDLE RECLAMATION)

Oracle's Always Free tier can reclaim instances that appear idle for an extended period. Since this deployment is explicitly rare/on-demand traffic (per `DECISIONS_LOG.md` DEC-018), genuine idle periods are expected and real — a keep-alive mechanism is needed so the instance itself doesn't get reclaimed during a quiet week.

### 4.1 Set up UptimeRobot (free tier)

1. Sign up at `uptimerobot.com` (free tier: 50 monitors, 5-minute check interval)
2. Add a new HTTP(s) monitor pointed at `https://yourdomain.com/health`
3. This serves two purposes at once: keeps the instance genuinely active (regular real traffic, not artificial), and gives you free uptime monitoring/alerting if the deployment ever actually goes down

**If the instance is reclaimed despite this** — see `docs/TROUBLESHOOTING_RUNBOOK.md` for the recovery procedure. That is an operational response scenario, not something this setup guide covers further.

---

## PART 5 — FINAL GO-LIVE CHECKLIST

```bash
# Full stack starts cleanly from nothing
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v   # CAUTION: only run this before first go-live, it deletes all data
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps        # all services "healthy" or "running"

# Health check shows all 6 keys healthy (per AMENDMENT_OBJECT_STORAGE_MINIO.md's retrofit)
curl -s https://yourdomain.com/health | python3 -m json.tool

# TLS is real, not self-signed
curl -vI https://yourdomain.com 2>&1 | grep "SSL certificate verify"
# expect "ok", not a self-signed warning

# Frontend loads over HTTPS with no mixed-content warnings
# (open in an actual browser and check the console)

# A real end-to-end query works, through the real Cerebras/Groq routing
# (ask a test question in the deployed chat UI, confirm a grounded answer streams back)

# Confirm the demo document corpus is loaded (see docs/DEMO_CONTENT_GUIDE.md)
curl -s https://yourdomain.com/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(d)"
```

Once all of the above pass, update `DECISIONS_LOG.md` with the go-live date and the final domain.

---

## WHAT THIS GUIDE DELIBERATELY DOES NOT COVER

- **Production-grade secrets management** (Vault production mode, dynamic secrets) — deferred to `tier6_production` (Phase B), per `DECISIONS_LOG.md` DEC-027.
- **Ongoing incident response** (rate limits hit, provider outages, the instance getting reclaimed anyway) — that's `docs/TROUBLESHOOTING_RUNBOOK.md`.
- **Load testing** — also a `tier6_production` item; this project's traffic pattern (DEC-018) does not require it before go-live.

---

*Related: `DECISIONS_LOG.md` DEC-002, DEC-009, DEC-013, DEC-014, DEC-018, DEC-027, DEC-033.*
