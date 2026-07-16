# AEGIS — tier6_production/
## Placeholder — Phase B, Deliberately Not Yet Designed

---

This folder is intentionally empty of real content.

Per `DECISIONS_LOG.md` DEC-027, implementation work is split into two phases:

- **Phase A** ("Complete & Correct") — everything in `tier1_amendments/`, the updated agent session guides, and the remaining `IMPL_XX`/`FRONTEND_XX` sessions. This is the current, active phase.
- **Phase B** ("Production Hardening") — real HashiCorp Vault production mode (replacing the current dev-mode root token), TLS automation beyond the manual Certbot setup in `docs/CLOUD_DEPLOYMENT_GUIDE.md`, backup/disaster-recovery procedures for the Docker volumes flagged as unprotected in `docs/TROUBLESHOOTING_RUNBOOK.md` Section 1, load testing, and a final security audit.

**Phase B is deliberately left undesigned until Phase A exists and has been tested end-to-end.** Designing it now would mean designing against assumptions Phase A might still change — every prior attempt in this project's history to plan too far ahead of actual implementation (see `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md` for four concrete examples of exactly this happening) produced planning documents that quietly drifted from what was actually built.

When Phase A is complete and tested, populate this folder following the same disciplined process used for everything else in this specification set: verify the actual current state directly, don't assume; check official sources for anything external (Vault's current production-mode documentation, current TLS automation best practices); log every real decision in `DECISIONS_LOG.md`; and hold each resulting document to the same completeness bar applied throughout Phase A.

---

*Related: `DECISIONS_LOG.md` DEC-027.*
