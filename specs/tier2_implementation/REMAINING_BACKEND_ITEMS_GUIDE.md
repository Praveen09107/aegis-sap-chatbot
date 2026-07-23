# AEGIS — Remaining Backend Items Guide
## OPEN-06, OPEN-08, Vault KV v2, key rotation, and production deployment
## Kept fully separate from frontend work — none of this blocks or depends on F01-F19

---

## HOW TO USE THIS DOCUMENT

None of the five items below block frontend work, and frontend work doesn't block any of these. Pick them up whenever convenient — in parallel with frontend sessions, between them, or after F19. Each is scoped as its own independent session.

---

## ITEM 1 — OPEN-06: SambaNova's Real Rate Limit

**Status:** genuinely unconfirmed, deliberately left open rather than guessed at (`DEC-060` explicitly declined to assert a number when SambaNova returned no rate-limit headers on a real call).

**Priority: low.** SambaNova is only a fallback tier (4th in Main/Judge, not primary anywhere) — this doesn't block anything currently working.

### Session Prompt
```
Attempt to confirm SambaNova's real free-tier rate limit through means other
than response headers, since a real call already confirmed none are present:
1. Check SambaNova's own developer dashboard directly (requires login —
   provide the real, current numbers shown there, not a cached memory of
   the pricing page).
2. If the dashboard doesn't show it either, deliberately trigger a 429 by
   sending rapid real requests and reading the error response body — some
   providers include limit info there even without headers.
3. If genuinely unconfirmable through any live method, leave OPEN-06 open
   permanently and say so explicitly — do not close it on an estimate.

Update circuit_breaker.py's SambaNova override comment to reflect whatever
was actually found, with a note on how it was obtained (dashboard/error body/
still unconfirmed).
```

---

## ITEM 2 — OPEN-08: The Undocumented `"correction"` WebSocket Message Type

**Status:** confirmed real gap — `AEGIS_DATA_CONTRACTS.md` documents this message type in full (line 748+); `IMPL_17_VALIDATION_ENGINE.md` never implements sending it. Present since the original build.

**Decision needed first, before any code:** does `validate_with_regeneration()`'s real behavior (confirmed in `DEC-059` — it can produce a genuinely different final answer when the first attempt scores below amber) actually need a distinct `"correction"` message type sent to the client, or does the existing `validation_result` message (now confirmed to include `answer_text`, per `DEC-059`'s fix) already fully cover this case?

### Session Prompt
```
Before writing any code: determine whether validate_with_regeneration()'s
existing behavior already fully covers what the "correction" message type
was meant to signal, now that validation_result includes answer_text
(DEC-059). If the regenerated answer already reaches the client correctly
through the existing message, "correction" may be genuinely redundant —
recommend correcting AEGIS_DATA_CONTRACTS.md to remove it rather than
building unused code, and say so explicitly with your reasoning.

If a real gap remains (e.g., the client has no way to distinguish "this is
a corrected answer" from "this is the original answer" in the UI), implement
sending a real "correction" message from validation_engine.py at the point
regeneration produces a different final answer, matching the data contract's
documented shape exactly. Add a test confirming it fires only when regeneration
actually changed the answer, not on every validation pass.

Log the decision and its reasoning as a new DECISIONS_LOG.md entry either way.
```

---

## ITEM 3 — Vault KV v2 Secrets Management (Scoped Follow-Up)

**Status:** direction chosen (`DEC-060`/`DEC-061`) — repurpose Vault's already-working AppRole auth into real secrets storage for the 5 provider API keys, directly solving the key-rotation toil rather than leaving Vault as orphaned infrastructure.

**This is a real, multi-file feature — treat it as its own session, not a quick fix.**

### Session Prompt
```
Read scripts/setup_vault.py (confirms AppRole auth already provisioned) and
backend/app/infrastructure/vault_client.py (currently implements only the
now-superseded dynamic-Postgres-credential path) before writing anything.

Build:
1. Provision a real KV v2 secrets engine in Vault (extend setup_vault.py) for
   the 5 provider keys (Groq, Cerebras, SambaNova, Cloudflare, Gemini).
2. Rewrite vault_client.py into a generic get_secret(path) function, replacing
   its current single-purpose Postgres-credential design.
3. Update config_inference_chains.py (or wherever provider keys are currently
   read from os.getenv) to read from Vault instead of secrets-share/.env
   directly, with .env as an explicit fallback only if Vault is unreachable —
   don't make Vault a hard dependency that could take down inference if it
   has a bad day.
4. Design rotation to NOT require a container recreation (the DEC-059
   operational finding — docker compose restart doesn't pick up .env changes;
   a Vault-backed design should let a key rotate without restarting
   aegis-fastapi/aegis-arq at all, which is the actual point of this feature).

Verify live: rotate one real key through Vault, confirm the running
application picks up the new value without a restart.
```

---

## ITEM 4 — Standing Reminder: Rotate All 5 Provider API Keys

**Status:** explicit, standing, not yet actioned. The keys currently in `secrets-share/.env` are the same ones used for real testing throughout `DEC-059`–`DEC-061`.

**Do this before actual production deployment, not before continuing development** — and ideally after Item 3 (Vault) lands, so rotation becomes the zero-restart operation it's meant to be rather than a manual `.env` edit + `docker compose up -d`.

### Checklist
```
1. Generate new API keys on all 5 provider dashboards (Groq, Cerebras,
   SambaNova, Cloudflare, Gemini).
2. If Item 3 is done: rotate through Vault, confirm no restart needed.
   If Item 3 is not done: replace values in secrets-share/.env, then
   docker compose up -d aegis-fastapi aegis-arq (NOT restart — DEC-059's
   confirmed operational finding).
3. Re-run the real end-to-end chat test once against the rotated keys —
   the cheapest possible confirmation rotation itself didn't break anything
   (wrong key pasted, wrong provider account, etc.).
4. Re-run scripts/aegis_inference_benchmark.py once against the rotated
   keys — throughput can genuinely differ across API keys/accounts on some
   providers' free tiers, worth confirming, not assuming identical.
```

---

## ITEM 5 — Real Production Deployment (Oracle Cloud)

**Status:** `docs/CLOUD_DEPLOYMENT_GUIDE.md` exists as a written plan, never executed. This project has only ever run on WSL2 — no ARM64 compatibility issue has ever been hit for real, since it's never been tried on ARM64 hardware.

**Do this last — after frontend (F01-F19) and Items 1-4 above, once there's a complete, verified system worth actually deploying.**

### Session Prompt (when you're ready for this)
```
Read docs/CLOUD_DEPLOYMENT_GUIDE.md in full before provisioning anything.
Confirm Oracle Cloud's Always Free tier's real current specs directly (web
search — DEC-009 already found the plan's original 4 OCPU/24GB assumption
was wrong once; confirm the 2 OCPU/12GB correction is still accurate today,
don't assume a months-old confirmation still holds).

Confirm the one known infrastructure accommodation this project's docs
already flagged: an explicit ARM64 image tag for OpenSearch (DEC-014) — every
other image in the stack is already multi-architecture, confirmed, but this
one specific service needs the tag, untested on real ARM64 hardware until now.

Provision, deploy, and run the full real end-to-end verification pass (the
same standard as DEC-059's WSL2 pass) against the real Oracle VM before
calling this done — a deployment that starts but hasn't been end-to-end
verified on the real target hardware isn't actually finished.

Rotate the 5 provider API keys (Item 4) as part of this deployment, not
before — there's no reason to rotate into a keys file that then sits on a
dev machine for weeks before actually deploying.
```

---

## SUGGESTED ORDER, IF YOU WANT ONE

1. **Item 2** (OPEN-08 decision) — quick, mostly a judgment call plus a small code change either way.
2. **Item 1** (OPEN-06) — quick, low-stakes, closes an open item cleanly.
3. **Item 3** (Vault KV v2) — the most substantial of the five, worth doing before Item 4 so rotation becomes the zero-downtime operation it's meant to be.
4. **Frontend (F01-F19)** — can run in parallel with any of the above, doesn't depend on them.
5. **Item 4** (key rotation) — once Item 3 is done and frontend is far enough along that you're approaching a real deployment.
6. **Item 5** (production deployment) — last, once everything else is genuinely complete and verified.
