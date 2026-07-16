-- Migration 005: Add MinIO object key tracking to documents_registry
-- Depends on: 001_operational_schema.sql (documents_registry table)

ALTER TABLE documents_registry
  ADD COLUMN minio_object_key TEXT;

COMMENT ON COLUMN documents_registry.minio_object_key IS
  'Object key in the aegis-documents MinIO bucket, format: {document_id}/{original_filename}';
