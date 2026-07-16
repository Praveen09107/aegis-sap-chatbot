#!/bin/bash
PASS=0
FAIL=0
WARN=0
FAILED_FILES=()

check_file() {
    local session="$1"
    local path="$2"
    if [ -f "$path" ]; then
        local lines
        lines=$(wc -l < "$path" 2>/dev/null || echo 0)
        if [ "$lines" -lt 5 ]; then
            echo "  ⚠ WARN  [$session] $path exists but is suspiciously small ($lines lines)"
            WARN=$((WARN+1))
        else
            echo "  ✓ OK    [$session] $path ($lines lines)"
            PASS=$((PASS+1))
        fi
    else
        echo "  ✗ FAIL  [$session] MISSING: $path"
        FAIL=$((FAIL+1))
        FAILED_FILES+=("$session: $path")
    fi
}

echo "=== SECTION 1 — FILE EXISTENCE ==="
check_file "01" "backend/requirements.txt"
check_file "01" "backend/requirements-dev.txt"
check_file "01" "backend/pyproject.toml"
check_file "01" "services/bge-embedding/requirements.txt"
check_file "01" "services/deberta-nli/requirements.txt"
check_file "01" "frontend/package.json"
check_file "01" "frontend/next.config.js"
check_file "01" "frontend/tsconfig.json"
check_file "01" "frontend/tailwind.config.js"
check_file "01" "frontend/postcss.config.js"
check_file "01" "scripts/verify_deps.py"
check_file "01" ".env.example"
check_file "03" "docker-compose.yml"
check_file "03" "backend/Dockerfile"
check_file "03" "services/bge-embedding/Dockerfile"
check_file "03" "services/deberta-nli/Dockerfile"
check_file "03" "services/bge-embedding/main.py"
check_file "03" "services/deberta-nli/main.py"
check_file "03" "infrastructure/nginx/nginx.conf"
check_file "03" "infrastructure/pgbouncer/pgbouncer.ini"
check_file "03" "infrastructure/pgbouncer/userlist.txt"
check_file "03" "infrastructure/prometheus/prometheus.yml"
check_file "03" "infrastructure/grafana/provisioning/datasources.yml"
check_file "03" "infrastructure/grafana/provisioning/dashboards.yml"
check_file "05" "database/migrations/001_operational_schema.sql"
check_file "05" "database/migrations/002_analytical_schema.sql"
check_file "05" "database/migrations/003_config_snapshot.sql"
check_file "05" "database/migrations/004_initial_data.sql"
check_file "05" "database/seeds/transaction_code_permissions.sql"
check_file "05" "database/seeds/synonym_map.sql"
check_file "05" "scripts/init_database.py"
check_file "06" "scripts/init_qdrant.py"
check_file "06" "backend/app/infrastructure/qdrant_client.py"
check_file "07" "scripts/init_opensearch.py"
check_file "07" "backend/app/infrastructure/opensearch_client.py"
check_file "08" "backend/app/infrastructure/redis_client.py"
check_file "08" "scripts/verify_redis.py"
check_file "09" "backend/app/middleware/input_governance.py"
check_file "09" "backend/app/middleware/output_governance.py"
check_file "09" "backend/app/middleware/rate_limiting.py"
check_file "09" "backend/app/middleware/trace_id.py"
check_file "09" "backend/app/main.py"
check_file "09" "tests/unit/test_input_governance.py"
check_file "10" "scripts/setup_keycloak.py"
check_file "10" "scripts/setup_vault.py"
check_file "10" "backend/app/middleware/authentication.py"
check_file "11" "backend/app/infrastructure/circuit_breaker.py"
check_file "11" "backend/app/models/session.py"
check_file "11" "backend/app/models/api.py"
check_file "11" "backend/app/tasks/vision_task.py"
check_file "11" "backend/app/tasks/audit_task.py"
check_file "11" "backend/app/tasks/feedback_task.py"
check_file "11" "backend/app/tasks/cache_task.py"
check_file "11" "backend/app/tasks/knowledge_gap_task.py"
check_file "11" "backend/app/tasks/ticket_task.py"
check_file "11" "backend/app/tasks/cleanup_task.py"
check_file "11" "backend/app/workers/arq_worker.py"
check_file "11" "backend/app/handlers/chat_handler.py"
check_file "12" "backend/app/models/retrieval.py"
check_file "12" "backend/app/services/query_intelligence.py"
check_file "12" "tests/unit/test_query_intelligence.py"
check_file "13" "backend/app/handlers/upload_handler.py"
check_file "13" "backend/app/services/vision_integration.py"
check_file "13" "backend/app/clients/ollama_vision.py"
check_file "13" "tests/unit/test_vision_integration.py"
check_file "13" "tests/unit/test_ollama_vision.py"
check_file "14" "backend/app/services/retrieval_engine.py"
check_file "14" "tests/unit/test_retrieval_engine.py"
check_file "15" "tests/unit/test_retrieval_stages_6_to_8.py"
check_file "16" "backend/app/services/model_gateway.py"
check_file "16" "backend/app/services/reasoning_service.py"
check_file "16" "backend/tests/unit/test_reasoning_service.py"

echo ""
echo "=== SECTION 3 — CRITICAL FACT SPOT-CHECKS ==="
grep -q "6432" infrastructure/pgbouncer/pgbouncer.ini 2>/dev/null && echo "  ✓ PgBouncer 6432 OK" || { echo "  ✗ PgBouncer 6432 FAIL"; FAIL=$((FAIL+1)); }
mig_count=$(ls database/migrations/*.sql 2>/dev/null | grep -c "00[1-4]_")
[ "$mig_count" -eq 4 ] && echo "  ✓ 4 migrations OK" || { echo "  ✗ migrations FAIL (found $mig_count)"; FAIL=$((FAIL+1)); }
grep -q "aegis-minio" docker-compose.yml 2>/dev/null && echo "  ⚠ MinIO unexpectedly present" || echo "  ✓ MinIO correctly absent"
ollama_count=$(grep -c "aegis-ollama-" docker-compose.yml 2>/dev/null)
[ "$ollama_count" -ge 3 ] && echo "  ✓ 3 Ollama services OK" || echo "  ⚠ Ollama count WARN ($ollama_count)"

echo ""
echo "=== SECTION 4 — GIT HISTORY ==="
if [ -d .git ]; then
    echo "Commit count: $(git log --oneline | wc -l)"
    git log --oneline -15
else
    echo "  ⚠ No .git directory found"
fi

echo ""
echo "=== SECTION 5 — DOCKER COMPOSE VALIDITY ==="
if command -v docker &> /dev/null; then
    docker compose config --quiet && echo "  ✓ docker-compose.yml parses cleanly" || echo "  ✗ docker-compose.yml FAIL"
else
    echo "  ⚠ docker not available"
fi

echo ""
echo "=== SECTION 6 — PYTEST ==="
if command -v pytest &> /dev/null; then
    pytest tests/unit/ backend/tests/unit/ -v 2>&1 | tail -40
else
    echo "  ⚠ pytest not installed — run: pip install -r backend/requirements-dev.txt"
fi

echo ""
echo "=== SUMMARY ==="
echo "PASS: $PASS   FAIL: $FAIL   WARN: $WARN"
if [ ${#FAILED_FILES[@]} -gt 0 ]; then
    echo "Missing files:"
    printf '  %s\n' "${FAILED_FILES[@]}"
fi
