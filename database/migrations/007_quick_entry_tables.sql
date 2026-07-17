-- Migration 007: Quick Entry data model (IMPL_24 Phase 1.1)
-- Adds 4 new tables. No existing table is modified.
--
-- Deliberately excludes IMPL_24 Section 8's seed-data INSERT block: it
-- references `(SELECT id FROM users WHERE role = 'it-admin' LIMIT 1)`, but
-- this schema has no `users` table — real user identity lives in Keycloak,
-- referenced everywhere else in this codebase by an opaque UUID/sub claim,
-- never a local FK. Onboarding fixture content is UI/frontend scope, not
-- Phase 1.1 data-model scope — deferred to whichever session actually
-- builds the Quick Entry onboarding flow.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Table 1: Main entries table
CREATE TABLE knowledge_form_entries (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           TEXT          NOT NULL,
  content_type          TEXT          NOT NULL,
  module                TEXT          NOT NULL,
  transactions          TEXT[]        NOT NULL DEFAULT '{}',
  status                TEXT          NOT NULL DEFAULT 'draft',
  version               INTEGER       NOT NULL DEFAULT 1,
  form_data             JSONB         NOT NULL,
  verified_by_name      TEXT          NOT NULL,
  verified_date         DATE          NOT NULL,
  review_frequency      TEXT          NULL,
  next_review_date      DATE          NULL,
  last_notified_at      TIMESTAMPTZ   NULL,
  gap_id                UUID          NULL,
  submitted_by          UUID          NOT NULL,
  processing_log        JSONB         NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kfe_document_id UNIQUE (document_id),
  CONSTRAINT chk_kfe_content_type CHECK (content_type IN ('error_guide','procedure','config')),
  CONSTRAINT chk_kfe_module CHECK (module IN ('FI','MM','SD','HR','PP','CO','BASIS')),
  CONSTRAINT chk_kfe_status CHECK (status IN ('draft','processing','active','archived','low_quality','failed','partial_index','review_required')),
  CONSTRAINT chk_kfe_review_frequency CHECK (review_frequency IS NULL OR review_frequency IN ('monthly','quarterly','semi_annual','annual','as_needed')),
  CONSTRAINT chk_kfe_version CHECK (version >= 1),
  CONSTRAINT chk_kfe_config_fields CHECK (content_type != 'config' OR review_frequency IS NOT NULL)
);

CREATE OR REPLACE FUNCTION kfe_update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER kfe_updated_at_trigger
  BEFORE UPDATE ON knowledge_form_entries
  FOR EACH ROW EXECUTE FUNCTION kfe_update_updated_at();

CREATE INDEX idx_kfe_status ON knowledge_form_entries (status);
CREATE INDEX idx_kfe_module_type ON knowledge_form_entries (module, content_type);
CREATE INDEX idx_kfe_review_date ON knowledge_form_entries (next_review_date) WHERE next_review_date IS NOT NULL AND status = 'active';
CREATE INDEX idx_kfe_gap_id ON knowledge_form_entries (gap_id) WHERE gap_id IS NOT NULL;
CREATE INDEX idx_kfe_document_id_trgm ON knowledge_form_entries USING gin (document_id gin_trgm_ops);

-- Table 2: Version history
CREATE TABLE knowledge_form_entry_versions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id         UUID          NOT NULL,
  version          INTEGER       NOT NULL,
  form_data        JSONB         NOT NULL,
  verified_by_name TEXT          NOT NULL,
  verified_date    DATE          NOT NULL,
  changed_by       UUID          NOT NULL,
  changed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  change_summary   TEXT          NULL,
  CONSTRAINT fk_kfev_entry FOREIGN KEY (entry_id) REFERENCES knowledge_form_entries (id) ON DELETE CASCADE,
  CONSTRAINT uq_kfev_entry_version UNIQUE (entry_id, version),
  CONSTRAINT chk_kfev_version CHECK (version >= 1)
);

CREATE INDEX idx_kfev_entry_id ON knowledge_form_entry_versions (entry_id);
CREATE INDEX idx_kfev_changed_at ON knowledge_form_entry_versions (entry_id, changed_at DESC);

-- Table 3: Chunks
CREATE TABLE knowledge_form_entry_chunks (
  id                     UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id               UUID     NOT NULL,
  version                INTEGER  NOT NULL,
  chunk_type             TEXT     NOT NULL,
  qdrant_point_id        UUID     NOT NULL,
  chunk_text             TEXT     NOT NULL,
  qdrant_status          TEXT     NOT NULL DEFAULT 'pending',
  opensearch_status      TEXT     NOT NULL DEFAULT 'pending',
  quality_score          FLOAT    NOT NULL,
  original_quality_score FLOAT    NOT NULL,
  is_current             BOOLEAN  NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_kfec_entry FOREIGN KEY (entry_id) REFERENCES knowledge_form_entries (id) ON DELETE CASCADE,
  CONSTRAINT uq_kfec_qdrant_point UNIQUE (qdrant_point_id),
  CONSTRAINT chk_kfec_qdrant_status CHECK (qdrant_status IN ('pending','success','failed')),
  CONSTRAINT chk_kfec_opensearch_status CHECK (opensearch_status IN ('pending','success','failed')),
  CONSTRAINT chk_kfec_quality_range CHECK (quality_score >= 0.0 AND quality_score <= 1.0),
  CONSTRAINT chk_kfec_original_quality_range CHECK (original_quality_score >= 0.0 AND original_quality_score <= 1.0)
);

CREATE INDEX idx_kfec_entry_current ON knowledge_form_entry_chunks (entry_id, is_current);
CREATE INDEX idx_kfec_entry_version ON knowledge_form_entry_chunks (entry_id, version);
CREATE INDEX idx_kfec_qdrant_point_id ON knowledge_form_entry_chunks (qdrant_point_id);
CREATE INDEX idx_kfec_partial_qdrant ON knowledge_form_entry_chunks (entry_id) WHERE qdrant_status = 'failed';
CREATE INDEX idx_kfec_partial_opensearch ON knowledge_form_entry_chunks (entry_id) WHERE opensearch_status = 'failed';

-- Table 4: Screenshots
CREATE TABLE knowledge_form_screenshots (
  id                   UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id             UUID     NOT NULL,
  version              INTEGER  NOT NULL,
  associated_section   TEXT     NOT NULL,
  minio_object_key     TEXT     NOT NULL,
  admin_caption        TEXT     NOT NULL,
  extracted_text       TEXT     NULL,
  vision_status        TEXT     NOT NULL DEFAULT 'pending',
  vision_error         TEXT     NULL,
  vision_confidence    FLOAT    NULL,
  sap_confirmed        BOOLEAN  NOT NULL DEFAULT FALSE,
  file_size_bytes      INTEGER  NOT NULL,
  mime_type            TEXT     NOT NULL,
  eligible_for_cleanup BOOLEAN  NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_kfs_entry FOREIGN KEY (entry_id) REFERENCES knowledge_form_entries (id) ON DELETE CASCADE,
  CONSTRAINT uq_kfs_minio_key UNIQUE (minio_object_key),
  CONSTRAINT chk_kfs_vision_status CHECK (vision_status IN ('pending','processing','complete','failed','not_sap')),
  CONSTRAINT chk_kfs_mime_type CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  CONSTRAINT chk_kfs_caption_length CHECK (LENGTH(admin_caption) >= 10),
  CONSTRAINT chk_kfs_file_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
);

CREATE INDEX idx_kfs_entry_id ON knowledge_form_screenshots (entry_id);
CREATE INDEX idx_kfs_entry_section ON knowledge_form_screenshots (entry_id, associated_section);
CREATE INDEX idx_kfs_vision_status ON knowledge_form_screenshots (vision_status) WHERE vision_status NOT IN ('complete','not_sap');
CREATE INDEX idx_kfs_cleanup_eligible ON knowledge_form_screenshots (eligible_for_cleanup) WHERE eligible_for_cleanup = TRUE;

-- Grant CRUD to aegis_app_role, matching migration 004's pattern for every
-- other operational table. Omitting this would repeat the exact bug found
-- and fixed for audit_log in migration 006 (INSERT-only, no SELECT) —
-- these 4 tables need full CRUD from the future API layer (IMPL_25).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  knowledge_form_entries,
  knowledge_form_entry_versions,
  knowledge_form_entry_chunks,
  knowledge_form_screenshots
TO aegis_app_role;

-- Rollback instructions (manual — this project has no down-migration runner):
-- DROP TABLE IF EXISTS knowledge_form_screenshots CASCADE;
-- DROP TABLE IF EXISTS knowledge_form_entry_chunks CASCADE;
-- DROP TABLE IF EXISTS knowledge_form_entry_versions CASCADE;
-- DROP TABLE IF EXISTS knowledge_form_entries CASCADE;
-- DROP FUNCTION IF EXISTS kfe_update_updated_at CASCADE;
