-- AEGIS Config Snapshot
-- Migration 003: Current SAP configuration values
-- Updated manually by IT admin after each period close

-- ============================================================
-- Config Snapshot
-- Stores current Sona Comstar SAP configuration values
-- All reads use REPEATABLE READ isolation to prevent partial reads
-- ============================================================
CREATE TABLE IF NOT EXISTS config_snapshot (
    config_category TEXT NOT NULL,
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,     -- Some values Vault Transit encrypted for sensitive data
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (config_category, config_key)
);

CREATE INDEX IF NOT EXISTS idx_config_snapshot_category
    ON config_snapshot(config_category);
CREATE INDEX IF NOT EXISTS idx_config_snapshot_updated
    ON config_snapshot(last_updated_at DESC);

-- Insert initial placeholder rows so the table has structure
-- IT admin must update these with actual values through the Admin Portal
INSERT INTO config_snapshot (config_category, config_key, config_value, updated_by, notes)
VALUES
    ('posting_periods', 'status', 'UPDATE_REQUIRED', 'system',
     'IT admin must update after each period close'),
    ('company_codes', 'status', 'UPDATE_REQUIRED', 'system',
     'IT admin must populate with active company codes'),
    ('plant_assignments', 'status', 'UPDATE_REQUIRED', 'system',
     'IT admin must populate with plant-to-company-code mappings')
ON CONFLICT DO NOTHING;
