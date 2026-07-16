# =============================================================================
# AEGIS Makefile — Common Development Commands
# =============================================================================

.PHONY: up down restart logs logs-all migrate shell test lint status init seed clean

# ─── Docker ──────────────────────────────────────────────────────────────────

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose down && docker compose up -d

status:
	docker compose ps

logs:
	docker compose logs -f aegis-fastapi

logs-all:
	docker compose logs -f

logs-worker:
	docker compose logs -f aegis-arq

logs-bge:
	docker compose logs -f aegis-bge

logs-deberta:
	docker compose logs -f aegis-deberta

# ─── Database ────────────────────────────────────────────────────────────────

migrate:
	docker compose exec aegis-fastapi alembic upgrade head

migrate-history:
	docker compose exec aegis-fastapi alembic history

migrate-rollback:
	docker compose exec aegis-fastapi alembic downgrade -1

# ─── Development ─────────────────────────────────────────────────────────────

shell:
	docker compose exec aegis-fastapi bash

shell-worker:
	docker compose exec aegis-arq bash

# ─── Tests and Quality ───────────────────────────────────────────────────────

test:
	docker compose exec aegis-fastapi pytest tests/ -v

test-unit:
	docker compose exec aegis-fastapi pytest tests/unit/ -v

test-integration:
	docker compose exec aegis-fastapi pytest tests/integration/ -v

lint:
	docker compose exec aegis-fastapi ruff check backend/

# ─── Initialization (run once after first make up) ───────────────────────────

init:
	python3 scripts/init_database.py
	python3 scripts/init_qdrant.py
	python3 scripts/init_opensearch.py
	python3 scripts/verify_redis.py
	@echo "Core data stores initialized. Now run:"
	@echo "  python3 scripts/setup_keycloak.py"
	@echo "  python3 scripts/setup_vault.py"
	@echo "  python3 scripts/setup_models.py"

seed:
	python3 scripts/seed_test_documents.py

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean:
	docker compose down -v
	@echo "All Docker volumes deleted. Data is gone. Run 'make up && make init' to rebuild."

# ─── Production (use after IT approval) ─────────────────────────────────────

prod-up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down
