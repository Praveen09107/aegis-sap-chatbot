-- AEGIS Operational Schema
-- Migration 001: Core operational tables
-- Run by: scripts/init_database.py

-- ============================================================
-- Known Patterns Registry
-- Stores entity-to-document mappings for Mode A fast-path retrieval
-- ============================================================
CREATE TABLE IF NOT EXISTS known_patterns_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_string TEXT NOT NULL,
    pattern_type TEXT NOT NULL CHECK (
        pattern_type IN ('error_code', 'order_type', 'plant_code', 'tax_code',
                        'pricing_procedure', 'transaction')
    ),
    linked_document_id TEXT NOT NULL,
    linked_chunk_type TEXT NOT NULL,
    registry_notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
    approved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ
);

-- Index for fast exact-match lookup by QIL
CREATE INDEX IF NOT EXISTS idx_registry_pattern_approved
    ON known_patterns_registry(pattern_string)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_registry_status
    ON known_patterns_registry(status);

-- ============================================================
-- Documents Registry
-- Metadata for every ingested document chunk set
-- ============================================================
CREATE TABLE IF NOT EXISTS documents_registry (
    document_id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL CHECK (content_type IN ('error_guide', 'procedure', 'config')),
    module TEXT NOT NULL CHECK (module IN ('FI', 'MM', 'SD', 'HR', 'PP', 'CO', 'BASIS')),
    transactions TEXT[] NOT NULL DEFAULT '{}',
    last_verified_date DATE NOT NULL,
    verified_by TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('active', 'processing', 'failed', 'deprecated')),
    parent_content BYTEA  -- Vault Transit encrypted JSON of all template field values
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents_registry(status);
CREATE INDEX IF NOT EXISTS idx_documents_module ON documents_registry(module);
CREATE INDEX IF NOT EXISTS idx_documents_content_type ON documents_registry(content_type);

-- ============================================================
-- Document Relationships
-- Knowledge Graph edges between documents
-- Created during ingestion from RELATED_ERRORS and COMMON_ERRORS fields
-- ============================================================
CREATE TABLE IF NOT EXISTS document_relationships (
    from_document_id TEXT NOT NULL REFERENCES documents_registry(document_id) ON DELETE CASCADE,
    to_document_id TEXT NOT NULL,  -- No FK constraint: target may not be ingested yet
    relationship_type TEXT NOT NULL CHECK (
        relationship_type IN ('causes_error', 'common_in_procedure', 'related_to')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (from_document_id, to_document_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_rel_from ON document_relationships(from_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_rel_to ON document_relationships(to_document_id);

-- ============================================================
-- Transaction Code Permissions
-- Controls which T-codes employees can execute vs. IT admin only
-- Used by Tier 1 Validation T-code policy check
-- ============================================================
CREATE TABLE IF NOT EXISTS transaction_code_permissions (
    tcode TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('employee', 'it-admin', 'consultant')),
    module TEXT NOT NULL
);

-- ============================================================
-- Audit Log (APPEND-ONLY — no UPDATE or DELETE)
-- Complete tamper-evident record of all system activity
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL,
    user_id_hash TEXT NOT NULL,     -- SHA-256 hash of JWT sub claim
    session_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('chat', 'upload', 'admin')),
    governance_trigger_flags JSONB NOT NULL DEFAULT '{}',
    validation_score FLOAT,
    model_tier INTEGER CHECK (model_tier IN (1, 2, 3)),
    retrieved_document_ids TEXT[],
    confidence_badge TEXT CHECK (confidence_badge IN ('green', 'amber', 'none')),
    feedback_signal TEXT NOT NULL DEFAULT 'none'
        CHECK (feedback_signal IN ('positive', 'negative', 'none'))
);

CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id_hash);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_confidence ON audit_log(confidence_badge);

-- ============================================================
-- Mock Tickets
-- Escalation tickets created when AEGIS cannot answer
-- ============================================================
CREATE TABLE IF NOT EXISTS mock_tickets (
    ticket_id TEXT PRIMARY KEY,     -- Format: TKT-YYYYMMDD-uuid8chars
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id TEXT NOT NULL,
    user_id_hash TEXT NOT NULL,
    query_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved')),
    resolution_notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON mock_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON mock_tickets(created_at DESC);

-- ============================================================
-- Feedback Events
-- Employee thumbs-up/down feedback and diagnosis results
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    feedback_signal TEXT NOT NULL CHECK (feedback_signal IN ('positive', 'negative')),
    retrieved_document_ids TEXT[],
    validation_score FLOAT,
    query_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diagnosis_result JSONB,          -- Populated by ARQ feedback_diagnosis task
    diagnosis_completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback_events(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_signal ON feedback_events(feedback_signal);
CREATE INDEX IF NOT EXISTS idx_feedback_time ON feedback_events(created_at DESC);

-- ============================================================
-- Human Review Queue
-- Generation failures needing IT admin to provide correct answer
-- ============================================================
CREATE TABLE IF NOT EXISTS human_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_feedback_id UUID NOT NULL REFERENCES feedback_events(id),
    query_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    unsupported_claims TEXT[] NOT NULL DEFAULT '{}',
    retrieved_document_ids TEXT[],
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_review', 'resolved')),
    admin_correct_answer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_status ON human_review_queue(status);

-- ============================================================
-- Synonym Map
-- Maps employee natural language to SAP technical terminology
-- Managed through Admin Portal, used by Query Intelligence Layer
-- ============================================================
CREATE TABLE IF NOT EXISTS synonym_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phrase TEXT NOT NULL UNIQUE,    -- Employee natural language phrase (lowercase)
    expansion TEXT NOT NULL,        -- SAP technical terms to append to query
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_synonym_phrase_active
    ON synonym_map(phrase)
    WHERE active = TRUE;
