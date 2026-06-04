# Alembic Migration Naming Convention

File format: YYYYMMDD_HHMMSS_short_description.py

Examples:
  20250527_000000_initial_schema.py         — IMPL_05 initial tables
  20250527_000001_quick_entry_tables.py     — IMPL_24 Quick Entry tables

Rules:
  - One migration per IMPL session that changes the schema
  - Descriptions must be lowercase with underscores
  - Never rename a migration after it has been applied to any environment
  - Run migrations with: docker compose exec aegis-fastapi alembic upgrade head
