# AEGIS — Troubleshooting Runbook
## Operational Response Guide: If X Happens, Do Y
## Place in: docs/TROUBLESHOOTING_RUNBOOK.md (project root)

---

## HOW TO USE THIS DOCUMENT

Find the symptom, follow the fix. Each entry also states whether it's a known, already-anticipated risk (per `DECISIONS_LOG.md`) or a genuinely new problem you should log as a new `DEC-XXX` entry once resolved, per this project's standing practice of recording every real decision, not just the ones made during specification-writing.

---

## 1. THE ORACLE VM APPEARS RECLAIMED OR UNREACHABLE

**Symptom:** SSH connection times out; the VM doesn't appear in the Oracle console, or appears "Stopped" without you having stopped it.

**Diagnosis:**
```bash
# From the Oracle Cloud console, check the instance's actual state first —
# "unreachable via SSH" and "actually reclaimed" are different problems
```

**Fix, if genuinely reclaimed:** Always Free A1 instances can be reclaimed if Oracle needs the capacity back and the instance has been idle. This is confirmed to be a real, known risk for this specific free tier (not a hypothetical) — see `docs/CLOUD_DEPLOYMENT_GUIDE.md` Part 4 for the keep-alive mitigation that should already be running. If it happened anyway:
1. Re-provision a new instance per `docs/DEV_ENVIRONMENT_SETUP.md` Part 1
2. Your code is safe (it's in git, not only on the VM) — but Docker volumes (Postgres data, Qdrant vectors, MinIO objects) are not, unless you've set up a backup. If you have not, this is exactly the gap `DECISIONS_LOG.md` DEC-027 flagged as deferred to Phase B — treat losing demo data as an acceptable, known risk for a portfolio deployment, re-seed from `docs/DEMO_CONTENT_GUIDE.md`'s synthetic corpus rather than treating this as a crisis.

**Prevention:** confirm the UptimeRobot monitor from `docs/CLOUD_DEPLOYMENT_GUIDE.md` Part 4 is actually active and hitting `/health` — a monitor that silently stopped working provides no protection.

---

## 2. CEREBRAS RETURNS 429 (RATE LIMIT EXCEEDED)

**Symptom:** Main-reasoning queries (Tier 2/3) fail or fall back unexpectedly; logs show `429` from `api.cerebras.ai`.

**Diagnosis:** Cerebras's free tier is genuinely tight at **5 requests/minute** (confirmed via official docs — see `DECISIONS_LOG.md` DEC-019). This is expected to happen occasionally, not a sign of misconfiguration, especially if two people happen to query the deployment within the same 60-second window.

**Fix:** This should already be handled automatically — `model_gateway.py`'s circuit breaker (per `AMENDMENT_INFERENCE_ARCHITECTURE.md`) fails over to Groq's `openai/gpt-oss-120b` (identical weights, zero output drift) when Cerebras's circuit opens. Confirm this is actually working:
```bash
curl -s https://yourdomain.com/health | python3 -c "import json,sys; print(json.load(sys.stdin))"
# Check application logs for "Tier 2/3 fallback: cerebras_main circuit open, using groq_main"
```
If you see this log line and the user still got an answer, **this is the system working correctly, not a bug** — no action needed.

**If failover itself isn't working:** verify `GROQ_API_KEY` is actually set and valid (`curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`), and check the circuit breaker's `allows_call` logic hasn't been broken.

---

## 3. GROQ DAILY TOKEN CAP EXHAUSTED

**Symptom:** Groq calls fail late in a heavy-usage day; `429` or a token-limit-specific error from `api.groq.com`.

**Diagnosis:** Confirm which model hit its cap — Groq's limits are **per-model**, not shared (confirmed via `DECISIONS_LOG.md` DEC-019/020/021): `gpt-oss-120b` at 200,000 TPD, `llama-3.1-8b-instant` at 500,000 TPD, `llama-4-scout` at 500,000 TPD.

**Fix, main reasoning (gpt-oss-120b) exhausted on Groq:** Cerebras should already be primary for this role, so Groq being exhausted specifically means Cerebras was *also* unavailable earlier the same day (both circuits open) — check Cerebras's status first, since this is the more informative signal.

**Fix, judge/CRAG (llama-3.1-8b-instant) exhausted:** Per `AMENDMENT_INFERENCE_ARCHITECTURE.md`, this degrades to the `gpt-oss-120b` pair automatically. Given this model's very high daily budget (14,400 requests/day, 500K tokens/day), hitting this cap on a genuinely rare/on-demand deployment (`DECISIONS_LOG.md` DEC-018) would be unusual — if it happens, check for a bug causing excessive CRAG calls (e.g., CRAG firing on every query instead of only borderline/Mode C cases) rather than assuming it's organic traffic.

**Fix, vision (llama-4-scout) exhausted:** Falls back to Cerebras's `gemma-4-31b` automatically. Given vision is a primary, non-optional feature (`DECISIONS_LOG.md` DEC-006), confirm the fallback genuinely worked and the employee still got a usable response, not a silent failure.

---

## 4. VISION FAILS ENTIRELY (BOTH PROVIDERS)

**Symptom:** Every vision-based query fails; both `groq_vision` and `cerebras_vision` circuits show open.

**This is the specific elevated risk flagged in `DECISIONS_LOG.md` DEC-033**, given vision's Preview status on both providers and its primary, non-optional feature status. This is the one failure mode in this runbook worth treating with real urgency, not routine rate-limit patience.

**Diagnosis:**
```bash
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY" | grep -i "llama-4-scout"
curl -s https://api.cerebras.ai/v1/models -H "Authorization: Bearer $CEREBRAS_API_KEY" | grep -i "gemma-4-31b"
```

**If a model is missing from either list entirely** (not just rate-limited, actually gone): this means the provider deprecated or renamed the Preview model — the exact risk anticipated. Do not silently work around this by leaving vision broken.

**Fix:**
1. Check both providers' current model catalogs for a replacement vision-capable model (repeat the verification process used originally in `AEGIS_INFERENCE_MODEL_SELECTION.md` — official docs first, not secondary sources, given that document's own history of catching a secondary-source error).
2. Update `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s vision constants (`GROQ_MODEL_VISION`/`CEREBRAS_MODEL_VISION`) to the new model.
3. **Log this as a new `DECISIONS_LOG.md` entry** — this is exactly the kind of "model catalog changed" event that entry format (see DEC-021) exists to capture, including which model was deprecated, what replaced it, and when.
4. As a last resort if no replacement vision model exists on either free tier: `INFERENCE_MODE=local` remains available as a fallback path, though this means self-hosting the original Qwen2.5-VL-7B model, with the latency tradeoffs already documented in `DECISIONS_LOG.md` DEC-015.

---

## 5. `/health` SHOWS A DEGRADED SERVICE

**Symptom:** One of the six keys (`redis_session`, `redis_queue`, `qdrant`, `opensearch`, `postgres`, `minio`) reports `unhealthy`.

**Fix — general pattern for any service:**
```bash
docker compose logs aegis-<service> --tail=50
docker compose restart aegis-<service>
# Re-check:
curl -s https://yourdomain.com/health | python3 -m json.tool
```

**If `minio` specifically is unhealthy:** check disk space first (`df -h`) — MinIO's most common failure mode on a small VM is running out of the boot volume's space, not a MinIO-specific bug. Given documents/screenshots are retained indefinitely by design (`DECISIONS_LOG.md` DEC-024 Section 11.1), monitor this over time rather than assuming it's a one-time event.

---

## 6. DOCKER RUNS OUT OF DISK SPACE

**Symptom:** Builds fail, containers won't start, `docker compose up` errors mentioning disk space.

**Fix:**
```bash
docker system df                    # see what's actually using space
docker system prune -a --volumes    # CAUTION: removes unused images/volumes — confirm nothing important is "unused" first
```

---

## 7. A CIRCUIT BREAKER APPEARS STUCK OPEN

**Symptom:** A provider is confirmed healthy (verified independently via `curl`) but AEGIS keeps routing around it as if its circuit is still open.

**Fix:** Circuit breakers should self-recover after their cooldown window — if one appears stuck, this suggests a bug in `record_success()`'s reset logic, not a provider issue. Restart the FastAPI service to reset in-memory circuit state as an immediate mitigation, then investigate the reset logic itself as a real bug, not a one-time fluke.
```bash
docker compose restart aegis-fastapi
```

---

*Related: `DECISIONS_LOG.md` DEC-006, DEC-018 through DEC-021, DEC-024, DEC-027, DEC-033.*
