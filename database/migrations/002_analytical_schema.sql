-- AEGIS Analytical Schema
-- Migration 002: Reporting and quality analysis tables
-- These tables are populated by ARQ background tasks and nightly jobs

-- ============================================================
-- Knowledge Gap Events
-- Records every INSUFFICIENT CRAG assessment with entity details
-- Powers the Knowledge Gap Dashboard in the Admin Portal
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_gap_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    query_text TEXT NOT NULL,
    extracted_entities JSONB NOT NULL DEFAULT '[]',  -- List of EntityObject dicts
    gap_description TEXT NOT NULL,                    -- From CRAG self-reflection model
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_events_time ON knowledge_gap_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gap_events_entities
    ON knowledge_gap_events USING GIN(extracted_entities);

-- ============================================================
-- Confidence History
-- Aggregated ValidationScore statistics per period and query type
-- Used for answer quality trend monitoring in Grafana
-- ============================================================
CREATE TABLE IF NOT EXISTS confidence_history (
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    query_type TEXT NOT NULL,
    avg_validation_score FLOAT NOT NULL,
    p50_score FLOAT NOT NULL,
    p95_score FLOAT NOT NULL,
    total_queries INTEGER NOT NULL,
    escalation_count INTEGER NOT NULL,
    PRIMARY KEY (period_start, query_type)
);

-- ============================================================
-- Session Quality Daily
-- Daily summary statistics for overall system performance
-- ============================================================
CREATE TABLE IF NOT EXISTS session_quality_daily (
    date DATE PRIMARY KEY,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_queries INTEGER NOT NULL DEFAULT 0,
    cache_hit_rate FLOAT NOT NULL DEFAULT 0.0,
    avg_validation_score FLOAT NOT NULL DEFAULT 0.0,
    green_badge_pct FLOAT NOT NULL DEFAULT 0.0,
    amber_badge_pct FLOAT NOT NULL DEFAULT 0.0,
    insufficient_pct FLOAT NOT NULL DEFAULT 0.0,
    mode_a_pct FLOAT NOT NULL DEFAULT 0.0,
    mode_b_pct FLOAT NOT NULL DEFAULT 0.0,
    mode_c_pct FLOAT NOT NULL DEFAULT 0.0
);
