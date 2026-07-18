-- Migration 011: Inference provider health/catalog/quota history log
-- Per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.7. Append-only,
-- written once per run by app/tasks/check_inference_provider_health.py
-- (a new ARQ cron task) — one row per (role, provider, model) checked on
-- each run, recording whether the model still appears in that provider's
-- live catalog, whether a real test call succeeded (primary tiers only),
-- and a quota-remaining snapshot for genuine historical trending (the
-- live Redis-backed quota tracker's own state resets/rotates and was
-- never meant to answer "what did this look like a week ago").
--
-- Grants follow the audit_log precedent (migration 006) directly, written
-- correctly the first time rather than patched later: SELECT + INSERT only,
-- UPDATE/DELETE explicitly revoked.

CREATE TABLE inference_provider_health_log (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID          NOT NULL,
  role              TEXT          NOT NULL,
  provider          TEXT          NOT NULL,
  model             TEXT          NOT NULL,
  tier_position     INTEGER       NOT NULL,
  in_catalog        BOOLEAN       NOT NULL,
  is_primary_tier   BOOLEAN       NOT NULL,
  live_call_ok      BOOLEAN       NULL,
  live_call_error   TEXT          NULL,
  quota_remaining   INTEGER       NULL,
  circuit_state     TEXT          NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_iphl_role CHECK (role IN ('main', 'judge', 'vision')),
  CONSTRAINT chk_iphl_circuit_state CHECK (circuit_state IS NULL OR circuit_state IN ('closed', 'open', 'half_open'))
);

CREATE INDEX idx_iphl_role_provider_model_time ON inference_provider_health_log (role, provider, model, created_at DESC);
CREATE INDEX idx_iphl_run_id ON inference_provider_health_log (run_id);
CREATE INDEX idx_iphl_catalog_drift ON inference_provider_health_log (created_at DESC) WHERE in_catalog = FALSE;

GRANT SELECT, INSERT ON TABLE inference_provider_health_log TO aegis_app_role;
REVOKE UPDATE, DELETE ON TABLE inference_provider_health_log FROM aegis_app_role;

-- Manual rollback (no down-migration runner exists in this codebase):
-- DROP TABLE inference_provider_health_log CASCADE;
