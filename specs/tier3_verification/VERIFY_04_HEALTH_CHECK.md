# VERIFY_04: HEALTH CHECK SCRIPT
## verify_health.py — Comprehensive System Verification

---

## FILE: scripts/verify_health.py

```python
#!/usr/bin/env python3
"""
AEGIS System Health Check
Verifies all services, schemas, collections, and configurations.
Usage: python scripts/verify_health.py
Run from project root with backend venv activated.
"""
import sys
import json
import subprocess
import urllib.request

PASS = "  ✓"
FAIL = "  ✗"
WARN = "  ⚠"
SECTION_COUNT = {"pass": 0, "fail": 0, "warn": 0}


def check(label: str, result: bool, warning: bool = False):
    status = WARN if warning else (PASS if result else FAIL)
    key = "warn" if warning else ("pass" if result else "fail")
    SECTION_COUNT[key] += 1
    print(f"{status} {label}")
    return result


def http_get(url: str, timeout: int = 10) -> dict | None:
    try:
        req = urllib.request.urlopen(url, timeout=timeout)
        return json.loads(req.read())
    except Exception as e:
        return None


def docker_exec(container: str, *cmd) -> str:
    try:
        result = subprocess.run(
            ["docker", "exec", container] + list(cmd),
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip()
    except Exception:
        return ""


print("=" * 60)
print("AEGIS System Health Check")
print("=" * 60)

# ── Data Stores ──────────────────────────────────────────────
print("\n[1] DATA STORES")

# Redis Instance 1
r1_maxmem = docker_exec("aegis-redis-session", "redis-cli", "config", "get", "maxmemory")
check("Redis Session: maxmemory = 6GB", "6442450944" in r1_maxmem)
r1_policy = docker_exec("aegis-redis-session", "redis-cli", "config", "get", "maxmemory-policy")
check("Redis Session: policy = allkeys-lru", "allkeys-lru" in r1_policy)
r1_aof = docker_exec("aegis-redis-session", "redis-cli", "config", "get", "appendonly")
check("Redis Session: appendonly = no", "no" in r1_aof.split("\n")[-1])

# Redis Instance 2
r2_maxmem = docker_exec("aegis-redis-queue", "redis-cli", "config", "get", "maxmemory")
check("Redis Queue: maxmemory = 1GB", "1073741824" in r2_maxmem)
r2_aof = docker_exec("aegis-redis-queue", "redis-cli", "config", "get", "appendonly")
check("Redis Queue: appendonly = yes", "yes" in r2_aof.split("\n")[-1])

# Qdrant
qdrant = http_get("http://localhost:6333/collections")
if qdrant:
    names = [c["name"] for c in qdrant.get("result", {}).get("collections", [])]
    check("Qdrant: meridian_errors exists", "meridian_errors" in names)
    check("Qdrant: meridian_procedures exists", "meridian_procedures" in names)
    check("Qdrant: meridian_configs exists", "meridian_configs" in names)
    check("Qdrant: cache_queries exists", "cache_queries" in names)

    # Check meridian_errors dimension
    err_info = http_get("http://localhost:6333/collections/meridian_errors")
    if err_info:
        vectors = err_info.get("result", {}).get("config", {}).get("params", {}).get("vectors", {})
        if isinstance(vectors, dict) and "content" in vectors:
            dim = vectors["content"].get("size", 0)
            check("Qdrant: meridian_errors vector dim = 768", dim == 768)
        else:
            check("Qdrant: meridian_errors vector config readable", False)
else:
    check("Qdrant: reachable", False)

# OpenSearch
os_health = http_get("http://localhost:9200/_cluster/health")
if os_health:
    check("OpenSearch: cluster healthy", os_health.get("status") in {"green", "yellow"})
    idx = http_get("http://localhost:9200/sap_documents/_settings")
    check("OpenSearch: sap_documents index exists", idx is not None)
else:
    check("OpenSearch: reachable", False)

# PostgreSQL (via pg_isready)
pg_ok = "accepting" in docker_exec("aegis-postgres-primary", "pg_isready", "-U", "postgres", "-d", "aegis")
check("PostgreSQL primary: accepting connections", pg_ok)

# ── AI Services ───────────────────────────────────────────────
print("\n[2] AI SERVICES")

bge = http_get("http://localhost:8002/health")
check("BGE embedding service: healthy", bge and bge.get("status") == "healthy")
if bge:
    check("BGE: dimension = 768", bge.get("dimension") == 768)

deb = http_get("http://localhost:8001/health")
check("DeBERTa NLI service: healthy", deb and deb.get("status") == "healthy")

for inst, name in [("aegis-ollama-main", "main"), ("aegis-ollama-judge", "judge"), ("aegis-ollama-vision", "vision")]:
    tags = docker_exec(inst, "curl", "-sf", "http://localhost:11434/api/tags")
    check(f"Ollama {name}: API responding", bool(tags))
    ka = docker_exec(inst, "env")
    check(f"Ollama {name}: KEEP_ALIVE=-1", "OLLAMA_KEEP_ALIVE=-1" in ka)

# ── Security ──────────────────────────────────────────────────
print("\n[3] SECURITY")

vault = http_get("http://localhost:8200/v1/sys/health")
check("Vault: initialized and unsealed",
      vault and vault.get("initialized") and not vault.get("sealed"))

kc_health = http_get("http://localhost:8080/health/ready")
check("Keycloak: ready", kc_health is not None)

# ── FastAPI ───────────────────────────────────────────────────
print("\n[4] FASTAPI")

fa = http_get("http://localhost:8000/health")
check("FastAPI: /health returns 200", fa is not None)
if fa:
    check("FastAPI: redis_session healthy", fa.get("services", {}).get("redis_session") == "healthy")
    check("FastAPI: qdrant healthy", fa.get("services", {}).get("qdrant") == "healthy")

# ── Summary ───────────────────────────────────────────────────
print("\n" + "=" * 60)
total = SECTION_COUNT["pass"] + SECTION_COUNT["fail"] + SECTION_COUNT["warn"]
print(f"Results: {SECTION_COUNT['pass']} passed, {SECTION_COUNT['fail']} failed, {SECTION_COUNT['warn']} warnings")
print(f"Total checks: {total}")

if SECTION_COUNT["fail"] == 0:
    print("\n✓ ALL HEALTH CHECKS PASSED — System ready for demo")
    sys.exit(0)
else:
    print(f"\n✗ {SECTION_COUNT['fail']} CHECKS FAILED — Resolve before demo")
    sys.exit(1)
```

---
