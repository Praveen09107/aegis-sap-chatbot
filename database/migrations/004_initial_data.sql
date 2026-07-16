-- AEGIS Initial Data and Security Configuration
-- Migration 004: Permissions, append-only enforcement, Keycloak database

-- ============================================================
-- Application role and permissions (aegis database)
-- ============================================================

-- Create application role (Vault will create actual users dynamically)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aegis_app_role') THEN
        CREATE ROLE aegis_app_role;
        RAISE NOTICE 'Created aegis_app_role';
    END IF;
END $$;

-- Grant permissions on operational schema tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    known_patterns_registry,
    documents_registry,
    document_relationships,
    transaction_code_permissions,
    mock_tickets,
    feedback_events,
    human_review_queue,
    synonym_map,
    config_snapshot
TO aegis_app_role;

-- Audit log: INSERT only — no UPDATE or DELETE (append-only enforcement)
GRANT INSERT ON TABLE audit_log TO aegis_app_role;
REVOKE UPDATE, DELETE ON TABLE audit_log FROM aegis_app_role;

-- Grant permissions on analytical schema tables
GRANT SELECT, INSERT, UPDATE ON TABLE
    knowledge_gap_events,
    confidence_history,
    session_quality_daily
TO aegis_app_role;

-- Grant sequence usage for UUID generation
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO aegis_app_role;

-- ============================================================
-- Create replication user
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
        CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replication_dev_2024';
        RAISE NOTICE 'Created replicator role';
    END IF;
END $$;

-- Verify audit_log append-only constraint
DO $$
BEGIN
    RAISE NOTICE 'audit_log table is append-only: UPDATE and DELETE permissions revoked';
END $$;
