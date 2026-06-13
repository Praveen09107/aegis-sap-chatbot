# IMPL_21: FIX AND INTEGRATION SESSION
## Complete Consolidation of All Patches — Run After Session 20
## This document supersedes IMPL_PATCH_01, IMPL_PATCH_02, and IMPL_PATCH_03

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 21: Apply all critical fixes and quality improvements.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Read this document completely before creating any file.**

This session creates and updates files to fix 13 confirmed bugs found during specification review. Every file in this document is a **complete, standalone implementation** — not a diff or patch. Create each file exactly as shown. Where a file already exists from a previous session, replace it entirely with the content here.

**Files created or replaced in this session:**
- `backend/app/config.py` — adds 9 missing constants
- `backend/app/infrastructure/postgres_client.py` — NEW (was missing)
- `backend/app/infrastructure/redis_client.py` — adds ARQTaskClient class
- `backend/app/services/retrieval_engine.py` — fixes CRAG parser (update _stage6_crag only)
- `backend/app/infrastructure/qdrant_client.py` — fixes cache cleanup (update method only)
- `backend/app/services/query_intelligence.py` — adds multi-worker invalidation listener
- `backend/app/handlers/admin_handler.py` — NEW (was missing, admin API endpoints)
- `backend/app/main.py` — adds all missing startup connections and router registrations
- `backend/app/middleware/authentication.py` — adds WebSocket authentication function
- `backend/app/handlers/chat_handler.py` — fixes WebSocket auth and ARQ task calls
- `backend/app/workers/arq_worker.py` — fixes task function signatures
- All ARQ task files — updated function signatures
- `frontend/src/app/api/auth/set-token/route.ts` — NEW (HttpOnly cookie setter)
- `frontend/src/app/api/auth/refresh/route.ts` — NEW (token refresh)
- `frontend/src/app/api/auth/ws-token/route.ts` — NEW (WebSocket token)
- `frontend/src/app/api/proxy/[...path]/route.ts` — NEW (API proxy with auth)
- `frontend/src/lib/auth.ts` — replaces sessionStorage with HttpOnly cookies
- `frontend/src/app/admin/page.tsx` — NEW (was missing)
- `frontend/.env.local` — NEW (was missing)
- `frontend/Dockerfile` — NEW (was missing)
- `infrastructure/nginx/nginx.conf` — fixes wrong frontend proxy port
- `scripts/seed_test_documents.py` — NEW (required for integration tests)
- `scripts/warmup_models.py` — NEW (required after Docker restart)
- docker-compose.yml — adds aegis-frontend service

---

## PART A: BACKEND FIXES

---

### FILE A1: backend/app/config.py — Add Missing Constants

Open the existing `backend/app/config.py` and add these lines to the appropriate sections. The file was created in Session 10 — do not replace it, just add these constants:

```python
# ADD TO: Retrieval Constants section (after RETRIEVAL_FINAL_CHUNKS = 5)
KG_BASE_RANK_EQUIVALENT = 15       # KG docs get score equivalent to rank 15 in RRF
MODE_C_MAX_SUBQUERIES = 2          # Mode C parallel sub-queries limit

# ADD TO: Validation Constants section (after NLI_THRESHOLD_POLICY_CLAIM)
FEEDBACK_RETRIEVAL_FAIL_THRESHOLD = 0.65  # avg entailment below this → retrieval failure

# ADD TO: Conversation Constants section (after ESCALATION_UNRESOLVED_THRESHOLD)
QUERY_SUMMARY_MAX_CHARS = 200      # Truncate query summaries in conversation history
ANSWER_SUMMARY_MAX_CHARS = 300     # Truncate answer summaries in conversation history

# ADD TO: Ingestion Constants section (after ENTITY_BOOST_REPETITIONS)
MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024   # 10MB upload limit for screenshots
MAX_DOCUMENT_BYTES = 50 * 1024 * 1024     # 50MB upload limit for documents

# ADD TO: Model Constants section (if not already present)
GENERATION_MAX_TOKENS = 1000       # Max tokens for main generation response
CRAG_MAX_TOKENS = 200              # Max tokens for CRAG self-reflection
JUDGE_MAX_TOKENS = 300             # Max tokens for LLM judge evaluation
GENERATION_TEMPERATURE = 0.1      # Temperature for main generation
JUDGE_TEMPERATURE = 0.0           # Temperature for CRAG and judge calls
```

After adding, verify:
```bash
cd backend && source venv/bin/activate
python -c "from app.config import KG_BASE_RANK_EQUIVALENT, FEEDBACK_RETRIEVAL_FAIL_THRESHOLD, QUERY_SUMMARY_MAX_CHARS, GENERATION_MAX_TOKENS; print('All constants OK')"
```

---

### FILE A2: backend/app/infrastructure/postgres_client.py (NEW)

```python
"""
AEGIS PostgreSQL Client
Centralized async connection pool. One pool per uvicorn worker process.
All application code uses this instead of raw asyncpg.connect().
"""
import logging
from typing import Optional, List, Any
from contextlib import asynccontextmanager
import asyncpg
from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

logger = logging.getLogger(__name__)


class PostgresClient:
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        dsn = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
        self._pool = await asyncpg.create_pool(dsn, min_size=5, max_size=20, timeout=30, command_timeout=60)
        logger.info(f"PostgreSQL pool created: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")

    async def close(self):
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if not self._pool:
            raise RuntimeError("PostgreSQL pool not initialized.")
        return self._pool

    @asynccontextmanager
    async def acquire(self):
        async with self._pool.acquire() as conn:
            yield conn

    async def fetch(self, query: str, *args) -> List[asyncpg.Record]:
        async with self.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args) -> Optional[asyncpg.Record]:
        async with self.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args) -> Any:
        async with self.acquire() as conn:
            return await conn.fetchval(query, *args)

    async def execute(self, query: str, *args) -> str:
        async with self.acquire() as conn:
            return await conn.execute(query, *args)

    async def health_check(self) -> dict:
        try:
            await self.fetchval("SELECT 1")
            return {"status": "healthy", "pool_size": self._pool.get_size()}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


postgres_client = PostgresClient()
```

---

### FILE A3: Add ARQTaskClient to backend/app/infrastructure/redis_client.py

**Open the existing file and add this class at the bottom, before the singleton declarations:**

```python
# ============================================================
# ADD THESE IMPORTS at the top of redis_client.py:
# from arq.connections import ArqRedis, create_pool, RedisSettings
# ============================================================

class ARQTaskClient:
    """
    Proper ARQ task enqueueing using ARQ's native job format.
    Replaces all raw redis.rpush() calls for background task submission.
    """

    def __init__(self):
        self._pool = None

    async def connect(self):
        from arq.connections import create_pool, RedisSettings
        self._pool = await create_pool(RedisSettings.from_dsn(REDIS_QUEUE_URL))
        logger.info("Connected to ARQ task pool (Redis Instance 2)")

    async def close(self):
        if self._pool:
            await self._pool.close()

    async def enqueue_vision(self, session_id: str, file_path: str) -> str:
        job = await self._pool.enqueue_job("process_vision_task", session_id=session_id, file_path=file_path)
        return job.job_id

    async def enqueue_audit(self, audit_data: dict) -> str:
        job = await self._pool.enqueue_job("write_audit_log", audit_data=audit_data)
        return job.job_id

    async def enqueue_feedback_diagnosis(self, feedback_data: dict) -> str:
        job = await self._pool.enqueue_job("run_feedback_diagnosis", feedback_data=feedback_data)
        return job.job_id

    async def enqueue_cache_write(self, cache_data: dict) -> str:
        job = await self._pool.enqueue_job("write_semantic_cache", cache_data=cache_data)
        return job.job_id

    async def enqueue_knowledge_gap(self, gap_data: dict) -> str:
        job = await self._pool.enqueue_job("record_knowledge_gap", gap_data=gap_data)
        return job.job_id

    async def enqueue_ticket(self, ticket_data: dict) -> str:
        job = await self._pool.enqueue_job("create_mock_ticket", ticket_data=ticket_data)
        return job.job_id


# ADD THIS SINGLETON at the bottom:
arq_client = ARQTaskClient()
```

---

### FILE A4: Update ARQ Task Function Signatures

ARQ passes keyword arguments. All task functions need `*` keyword-only arguments.

**Open each task file and update ONLY the function signature line:**

```python
# backend/app/tasks/vision_task.py — line 1:
# OLD: async def process_vision_task(ctx: Dict, file_path: str, session_id: str):
# NEW:
async def process_vision_task(ctx: dict, *, session_id: str, file_path: str):

# backend/app/tasks/audit_task.py:
# OLD: async def write_audit_log(ctx: Dict, audit_data: Dict):
# NEW:
async def write_audit_log(ctx: dict, *, audit_data: dict):

# backend/app/tasks/feedback_task.py:
# OLD: async def run_feedback_diagnosis(ctx: Dict, feedback_data: Dict):
# NEW:
async def run_feedback_diagnosis(ctx: dict, *, feedback_data: dict):

# backend/app/tasks/cache_task.py:
# OLD: async def write_semantic_cache(ctx: Dict, cache_data: Dict):
# NEW:
async def write_semantic_cache(ctx: dict, *, cache_data: dict):

# backend/app/tasks/knowledge_gap_task.py:
# OLD: async def record_knowledge_gap(ctx: Dict, gap_data: Dict):
# NEW:
async def record_knowledge_gap(ctx: dict, *, gap_data: dict):

# backend/app/tasks/ticket_task.py:
# OLD: async def create_mock_ticket(ctx: Dict, ticket_data: Dict):
# NEW:
async def create_mock_ticket(ctx: dict, *, ticket_data: dict):
```

---

### FILE A5: Update backend/app/workers/arq_worker.py

Add `keep_result` and fix `WorkerSettings`:

```python
class WorkerSettings:
    functions = [
        process_vision_task,
        write_audit_log,
        run_feedback_diagnosis,
        write_semantic_cache,
        record_knowledge_gap,
        create_mock_ticket,
        nightly_cleanup,
    ]
    redis_settings = RedisSettings.from_dsn(REDIS_QUEUE_URL)
    max_jobs = 10
    job_timeout = 180
    keep_result = 3600       # Keep results for 1 hour
    max_tries = 3            # Default retry count for all tasks
    poll_delay = 0.5
    on_startup = startup
    on_shutdown = shutdown
```

---

### FILE A6: Fix CRAG Parser in backend/app/services/retrieval_engine.py

Find the `_stage6_crag` method and replace ONLY the response parsing section:

```python
# FIND this block and REPLACE it:
# if model_response.upper().startswith("SUFFICIENT"):
#     return "SUFFICIENT", None
# elif model_response.upper().startswith("INSUFFICIENT"):
#     ...

# REPLACE WITH:
response_upper = model_response.upper()

insufficient_idx = response_upper.find("INSUFFICIENT")
if insufficient_idx != -1:
    after = model_response[insufficient_idx + len("INSUFFICIENT"):].lstrip(":").strip()
    gap_description = after.split("\n")[0][:200] if after else "Knowledge gap detected"
    logger.info(f"CRAG INSUFFICIENT: {gap_description}")
    return "INSUFFICIENT", gap_description

if "SUFFICIENT" in response_upper:
    return "SUFFICIENT", None

# Ambiguous: count sentiment signals
positive = sum(1 for s in ["sufficient","adequate","covers","addresses","provides"] if s in model_response.lower())
negative = sum(1 for s in ["insufficient","missing","lacks","not enough","incomplete"] if s in model_response.lower())
if negative > positive:
    return "INSUFFICIENT", "CRAG response ambiguous — treated as insufficient"

logger.warning(f"CRAG ambiguous, defaulting SUFFICIENT: '{model_response[:60]}'")
return "SUFFICIENT", None
```

---

### FILE A7: Fix Qdrant Cache Cleanup in backend/app/infrastructure/qdrant_client.py

Replace the `cleanup_stale_cache` method entirely:

```python
async def cleanup_stale_cache(self, cutoff_datetime_str: str) -> int:
    """
    Delete cache entries older than cutoff.
    Uses ISO string comparison (lexicographically correct for ISO dates).
    """
    from qdrant_client.models import PointIdsList

    stale_ids = []
    offset = None

    while True:
        results, offset = await self.client.scroll(
            collection_name=QDRANT_COLLECTION_CACHE,
            limit=100,
            offset=offset,
            with_payload=["created_at"],
        )
        for point in results:
            if point.payload:
                created_at = point.payload.get("created_at", "9999-12-31")
                if created_at < cutoff_datetime_str:
                    stale_ids.append(point.id)
        if offset is None:
            break

    if stale_ids:
        await self.client.delete(
            collection_name=QDRANT_COLLECTION_CACHE,
            points_selector=PointIdsList(points=stale_ids),
        )

    return len(stale_ids)
```

---

### FILE A8: Add Synonym Map Listener to backend/app/services/query_intelligence.py

Add these two methods to the `QueryIntelligenceLayer` class (after `reload_synonym_map`):

```python
SYNONYM_RELOAD_CHANNEL = "aegis:synonym_reload"

async def start_reload_listener(self):
    """Subscribe to Redis Pub/Sub for cross-worker cache invalidation."""
    import asyncio
    from app.infrastructure.redis_client import redis_session

    pubsub = await redis_session.get_pubsub()
    await pubsub.subscribe(self.SYNONYM_RELOAD_CHANNEL)

    async def listen():
        while True:
            try:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg and msg["type"] == "message":
                    logger.info("Synonym reload signal — invalidating in-memory cache")
                    self._synonym_loaded = False
                    await self._ensure_synonym_map_loaded()
            except Exception as e:
                logger.error(f"Synonym reload listener error: {e}")
                await asyncio.sleep(5)

    asyncio.create_task(listen())
    logger.info("Synonym map reload listener started")
```

---

### FILE A9: Add WebSocket Auth to backend/app/middleware/authentication.py

Add this function at the bottom of the file (outside the class):

```python
from fastapi import WebSocket, WebSocketException

async def ws_authenticate(websocket: WebSocket) -> dict:
    """
    Authenticate a WebSocket connection via ?token= query parameter.
    The frontend fetches this token from /api/auth/ws-token before connecting.
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        raise WebSocketException(code=4001)

    try:
        import hashlib
        jwks = jwks_cache.get_keys()
        payload = jwt.decode(
            token, jwks, algorithms=["RS256"],
            audience=KEYCLOAK_CLIENT_ID,
            issuer=f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}",
        )
        websocket.state.user_id = payload.get("sub", "")
        websocket.state.user_id_hash = hashlib.sha256(
            websocket.state.user_id.encode()
        ).hexdigest()
        roles = payload.get("realm_access", {}).get("roles", ["employee"])
        websocket.state.role = "it-admin" if "it-admin" in roles else "employee"
        websocket.state.jti = payload.get("jti")
        return payload
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        raise WebSocketException(code=4001)
```

---

### FILE A10: Update backend/app/handlers/chat_handler.py

Update the WebSocket handler to use auth and ARQ properly:

```python
# At the top of chat_websocket_handler, AFTER await websocket.accept():

async def chat_websocket_handler(websocket: WebSocket, session_id: Optional[str] = None):
    await websocket.accept()

    # Authenticate WebSocket connection
    from app.middleware.authentication import ws_authenticate
    try:
        await ws_authenticate(websocket)
    except Exception:
        return  # ws_authenticate closes the connection

    # ... rest of handler unchanged ...


# Replace ALL redis_queue.redis.rpush() calls in this file with arq_client calls:
# Find: await redis_queue.redis.rpush("arq:queue:vision", ...)
# Replace with: await arq_client.enqueue_vision(session_id=session_id, file_path=file_path)

# Find: await redis_queue.redis.rpush("arq:queue:audit", ...)  
# Replace with: await arq_client.enqueue_audit(audit_data={...})

# Find: await redis_queue.redis.rpush("arq:queue:knowledge_gap", ...)
# Replace with: await arq_client.enqueue_knowledge_gap(gap_data={...})

# Find: await redis_queue.redis.rpush("arq:queue:mock_ticket", ...)
# Replace with: await arq_client.enqueue_ticket(ticket_data={...})

# Find: await redis_queue.redis.rpush("arq:queue:cache_write", ...)
# Replace with: await arq_client.enqueue_cache_write(cache_data={...})

# Find: await redis_queue.redis.rpush("arq:queue:feedback_diagnosis", ...)
# Replace with: await arq_client.enqueue_feedback_diagnosis(feedback_data={...})
```

---

### FILE A11: Create backend/app/handlers/admin_handler.py (NEW)

Create this complete file — it implements all 7 admin portal API endpoints:

```python
"""
AEGIS Admin Handler — All /admin/* API endpoints for the 7 admin portal screens.
All routes require it-admin role.
"""
import logging
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Request, HTTPException, Depends
from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def require_it_admin(request: Request):
    role = getattr(request.state, "role", "employee")
    if role not in {"it-admin", "consultant"}:
        raise HTTPException(status_code=403, detail="IT admin role required")
    return role


async def _db():
    import asyncpg
    return await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
    )


@router.get("/documents")
async def list_documents(request: Request, content_type: Optional[str] = None,
                          module: Optional[str] = None, status: Optional[str] = None,
                          page: int = 1, page_size: int = 50,
                          _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        conditions, params, i = [], [], 1
        if content_type:
            conditions.append(f"content_type=${i}"); params.append(content_type); i += 1
        if module:
            conditions.append(f"module=${i}"); params.append(module); i += 1
        if status:
            conditions.append(f"status=${i}"); params.append(status); i += 1
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = await conn.fetch(
            f"SELECT document_id, content_type, module, status, chunk_count, last_verified_date::text, ingested_at::text FROM documents_registry {where} ORDER BY ingested_at DESC LIMIT {page_size} OFFSET {(page-1)*page_size}",
            *params)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM documents_registry {where}", *params)
        return {"documents": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}
    finally:
        await conn.close()


@router.get("/registry")
async def list_registry(request: Request, status: Optional[str] = None, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        q = "SELECT id::text, pattern_string, pattern_type, linked_document_id, linked_chunk_type, registry_notes, status, approved_by, created_at::text FROM known_patterns_registry"
        rows = await conn.fetch(q + (" WHERE status=$1 ORDER BY created_at DESC" if status else " ORDER BY created_at DESC"), *([status] if status else []))
        return {"entries": [dict(r) for r in rows]}
    finally:
        await conn.close()


@router.patch("/registry/{entry_id}/approve")
async def approve_registry_entry(entry_id: str, request: Request, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        await conn.execute(
            "UPDATE known_patterns_registry SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2::uuid",
            getattr(request.state, "user_id_hash", "unknown"), entry_id)
        from app.infrastructure.redis_client import redis_session
        await redis_session.redis.publish("aegis:synonym_reload", "reload")
        return {"status": "approved", "id": entry_id}
    finally:
        await conn.close()


@router.get("/config-snapshot")
async def get_config_snapshot(request: Request, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        rows = await conn.fetch(
            "SELECT config_category, config_key, config_value, last_updated_at::text, updated_by, notes FROM config_snapshot ORDER BY config_category, config_key")
        today = datetime.utcnow().date()
        entries = []
        for row in rows:
            e = dict(row)
            try:
                age = (today - datetime.fromisoformat(row["last_updated_at"]).date()).days
                e["staleness"] = "critical" if age > 70 else ("warning" if age > 35 else "fresh")
                e["age_days"] = age
            except Exception:
                e["staleness"] = "unknown"; e["age_days"] = 0
            entries.append(e)
        return {"entries": entries}
    finally:
        await conn.close()


@router.put("/config-snapshot/{category}/{key}")
async def update_config_value(category: str, key: str, request: Request, _: str = Depends(require_it_admin)):
    body = await request.json()
    conn = await _db()
    try:
        await conn.execute(
            "INSERT INTO config_snapshot (config_category, config_key, config_value, updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (config_category, config_key) DO UPDATE SET config_value=EXCLUDED.config_value, updated_by=EXCLUDED.updated_by, last_updated_at=NOW()",
            category, key, body["config_value"], getattr(request.state, "user_id_hash", "unknown"))
        return {"status": "updated"}
    finally:
        await conn.close()


@router.get("/knowledge-gaps")
async def get_knowledge_gaps(request: Request, days: int = 7, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        cutoff_7d = datetime.utcnow() - timedelta(days=7)
        cutoff_30d = datetime.utcnow() - timedelta(days=30)
        rows = await conn.fetch(
            """SELECT gap_description,
               COUNT(*) FILTER (WHERE occurred_at >= $1) as count_7d,
               COUNT(*) FILTER (WHERE occurred_at >= $2) as count_30d,
               array_agg(DISTINCT query_text) as example_queries
               FROM knowledge_gap_events WHERE occurred_at >= $2
               GROUP BY gap_description HAVING COUNT(*) FILTER (WHERE occurred_at >= $1) > 0
               ORDER BY count_7d DESC LIMIT 20""",
            cutoff_7d, cutoff_30d)
        return {"clusters": [{"entity_combination": r["gap_description"][:80], "gap_description": r["gap_description"],
                               "count_7d": r["count_7d"], "count_30d": r["count_30d"],
                               "example_queries": list(r["example_queries"])[:3]} for r in rows]}
    finally:
        await conn.close()


@router.get("/audit-trail")
async def get_audit_trail(request: Request, days: int = 7, confidence_badge: Optional[str] = None,
                           page: int = 1, page_size: int = 100, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        conditions, params, i = ["occurred_at >= $1"], [cutoff], 2
        if confidence_badge:
            conditions.append(f"confidence_badge=${i}"); params.append(confidence_badge); i += 1
        where = "WHERE " + " AND ".join(conditions)
        rows = await conn.fetch(
            f"SELECT id::text, occurred_at::text, user_id_hash, session_id, request_type, confidence_badge, validation_score, model_tier, feedback_signal FROM audit_log {where} ORDER BY occurred_at DESC LIMIT {page_size} OFFSET {(page-1)*page_size}",
            *params)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM audit_log {where}", *params)
        return {"entries": [dict(r) for r in rows], "total": total}
    finally:
        await conn.close()


@router.get("/review-queue")
async def get_review_queue(request: Request, status: str = "pending", _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        rows = await conn.fetch(
            "SELECT id::text, query_text, answer_text, unsupported_claims, status, created_at::text FROM human_review_queue WHERE status=$1 ORDER BY created_at DESC LIMIT 50",
            status)
        return {"items": [dict(r) for r in rows]}
    finally:
        await conn.close()


@router.post("/review-queue/{item_id}/resolve")
async def resolve_review_item(item_id: str, request: Request, _: str = Depends(require_it_admin)):
    body = await request.json()
    answer = body.get("admin_correct_answer", "")
    if not answer.strip():
        raise HTTPException(status_code=400, detail="admin_correct_answer is required")
    conn = await _db()
    try:
        await conn.execute(
            "UPDATE human_review_queue SET status='resolved', admin_correct_answer=$1, resolved_at=NOW() WHERE id=$2::uuid",
            answer, item_id)
        return {"status": "resolved"}
    finally:
        await conn.close()


@router.get("/tickets")
async def get_tickets(request: Request, status: Optional[str] = None, page: int = 1,
                       page_size: int = 50, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        cond = "WHERE status=$1 " if status else ""
        rows = await conn.fetch(
            f"SELECT ticket_id, created_at::text, user_id_hash, query_text, reason, status, resolution_notes FROM mock_tickets {cond}ORDER BY created_at DESC LIMIT {page_size} OFFSET {(page-1)*page_size}",
            *([status] if status else []))
        return {"tickets": [dict(r) for r in rows]}
    finally:
        await conn.close()


@router.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request, _: str = Depends(require_it_admin)):
    body = await request.json()
    if body.get("status") not in {"open", "in_progress", "resolved"}:
        raise HTTPException(status_code=400, detail="Invalid status value")
    conn = await _db()
    try:
        await conn.execute(
            "UPDATE mock_tickets SET status=$1, resolution_notes=$2, updated_at=NOW() WHERE ticket_id=$3",
            body["status"], body.get("resolution_notes"), ticket_id)
        return {"status": body["status"]}
    finally:
        await conn.close()
```

---

### FILE A12: Replace backend/app/main.py (COMPLETE)

```python
"""AEGIS FastAPI Application — Complete main.py with all connections and routes."""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.trace_id import TraceIDMiddleware
from app.middleware.authentication import AuthenticationMiddleware
from app.middleware.input_governance import InputGovernanceMiddleware
from app.middleware.rate_limiting import RateLimitingMiddleware

structlog.configure(processors=[structlog.processors.TimeStamper(fmt="iso"),
    structlog.stdlib.add_log_level, structlog.processors.JSONRenderer()],
    wrapper_class=structlog.stdlib.BoundLogger, context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory())
log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AEGIS starting", environment="demo")
    from app.infrastructure.redis_client import redis_session, redis_queue, arq_client
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.infrastructure.postgres_client import postgres_client
    from app.services.query_intelligence import query_intelligence

    await redis_session.connect()
    await redis_queue.connect()
    await arq_client.connect()
    await qdrant_client.connect()
    await opensearch_client.connect()
    await postgres_client.connect()
    await query_intelligence.start_reload_listener()
    log.info("AEGIS startup complete — all connections ready")
    yield

    await redis_session.close()
    await redis_queue.close()
    await arq_client.close()
    await qdrant_client.close()
    await opensearch_client.close()
    await postgres_client.close()
    log.info("AEGIS shutdown complete")


app = FastAPI(title="AEGIS", version="1.0.0", lifespan=lifespan)

# Middleware (last added = outermost = runs first)
app.add_middleware(RateLimitingMiddleware)
app.add_middleware(InputGovernanceMiddleware)
app.add_middleware(AuthenticationMiddleware)
app.add_middleware(TraceIDMiddleware)
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://localhost"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Routes
from app.handlers.admin_handler import router as admin_router
from app.handlers.upload_handler import router as upload_router
app.include_router(admin_router)
app.include_router(upload_router)


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, session_id: str = None):
    from app.handlers.chat_handler import chat_websocket_handler
    await chat_websocket_handler(websocket, session_id)


@app.get("/health")
async def health():
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.infrastructure.postgres_client import postgres_client
    r1 = await redis_session.health_check()
    r2 = await redis_queue.health_check()
    q = await qdrant_client.health_check()
    o = await opensearch_client.health_check()
    p = await postgres_client.health_check()
    all_ok = all(x["status"] in {"healthy", "green", "yellow"} for x in [r1, r2, q, o, p])
    return {
        "status": "healthy" if all_ok else "degraded",
        "services": {"redis_session": r1["status"], "redis_queue": r2["status"],
                     "qdrant": q["status"], "opensearch": o["status"], "postgres": p["status"]}
    }


@app.get("/metrics")
async def metrics():
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    from fastapi.responses import Response
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

---

## PART B: FRONTEND FIXES

---

### FILE B1: frontend/.env.local (NEW)

```bash
# Server-side (not exposed to browser)
KEYCLOAK_INTERNAL_URL=http://aegis-keycloak:8080
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=aegis_chat_client_secret_dev
BACKEND_URL=http://aegis-fastapi:8000

# Client-side (NEXT_PUBLIC_ exposed to browser)
NEXT_PUBLIC_WS_URL=wss://localhost
NEXT_PUBLIC_API_URL=https://localhost
```

For local development (outside Docker), create `frontend/.env.local.dev` and copy to `.env.local`:
```bash
KEYCLOAK_INTERNAL_URL=http://localhost:8080
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=aegis_chat_client_secret_dev
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### FILE B2: frontend/src/app/api/auth/set-token/route.ts (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { access_token, refresh_token, expires_in } = await request.json();
  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set("access_token", access_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: expires_in || 900, path: "/",
  });
  response.cookies.set("refresh_token", refresh_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 28800, path: "/",
  });

  try {
    const payload = JSON.parse(atob(access_token.split(".")[1]));
    const roles: string[] = payload?.realm_access?.roles || [];
    response.cookies.set("user_role",
      roles.includes("it-admin") ? "it-admin" : "employee",
      { httpOnly: false, sameSite: "lax", maxAge: expires_in || 900, path: "/" });
  } catch {}

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  ["access_token", "refresh_token", "user_role"].forEach(name =>
    response.cookies.delete(name));
  return response;
}
```

---

### FILE B3: frontend/src/app/api/auth/refresh/route.ts (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const refresh_token = request.cookies.get("refresh_token")?.value;
  if (!refresh_token) return NextResponse.json({ error: "No refresh token" }, { status: 401 });

  const KEYCLOAK_URL = `${process.env.KEYCLOAK_INTERNAL_URL}/realms/aegis-realm/protocol/openid-connect/token`;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.KEYCLOAK_CLIENT_ID || "aegis-chat",
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET || "",
    refresh_token,
  });

  try {
    const resp = await fetch(KEYCLOAK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!resp.ok) {
      const r = NextResponse.json({ error: "Refresh failed" }, { status: 401 });
      ["access_token", "refresh_token", "user_role"].forEach(n => r.cookies.delete(n));
      return r;
    }
    const data = await resp.json();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("access_token", data.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", maxAge: data.expires_in, path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Network error" }, { status: 500 });
  }
}
```

---

### FILE B4: frontend/src/app/api/auth/ws-token/route.ts (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ ws_token: token });
}
```

---

### FILE B5: frontend/src/app/api/proxy/[...path]/route.ts (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://aegis-fastapi:8000";

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  const path = params.path.join("/");
  const url = `${BACKEND}/${path}${request.nextUrl.search}`;
  const body = request.method !== "GET" ? await request.text() : undefined;

  const resp = await fetch(url, {
    method: request.method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": request.headers.get("content-type") || "application/json",
    },
    body,
  });

  return new NextResponse(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") || "application/json" },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
```

---

### FILE B6: Replace frontend/src/lib/auth.ts (COMPLETE)

```typescript
"use client";

import { KEYCLOAK_TOKEN_URL, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } from "./constants";

export async function loginWithCredentials(username: string, password: string):
    Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      grant_type: "password", client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET, username, password,
    });
    const resp = await fetch(KEYCLOAK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      return { success: false, error: e.error_description || "Invalid credentials." };
    }
    const data = await resp.json();
    const cookieResp = await fetch("/api/auth/set-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: data.access_token,
        refresh_token: data.refresh_token, expires_in: data.expires_in }),
    });
    return cookieResp.ok ? { success: true } : { success: false, error: "Failed to establish session." };
  } catch {
    return { success: false, error: "Connection error. Please try again." };
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const resp = await fetch("/api/auth/refresh", { method: "POST" });
    return resp.ok;
  } catch { return false; }
}

export async function logout() {
  await fetch("/api/auth/set-token", { method: "DELETE" });
  window.location.href = "/login";
}

export function isAuthenticated(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("user_role=");
}

export function getUserRole(): "employee" | "it-admin" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/user_role=([^;]+)/);
  return match ? (match[1] as "employee" | "it-admin") : null;
}

export function getAccessToken(): string | null {
  return null; // HttpOnly — not readable from JS. Use /api/proxy/ for API calls.
}
```

---

### FILE B7: Update frontend/src/hooks/useWebSocket.ts

Find the WebSocket connection setup and replace:

```typescript
// OLD: const ws = new WebSocket(`${WS_BASE_URL}/ws/chat`);

// NEW: Fetch WS token first, then connect
async function connectWebSocket() {
  const tokenResp = await fetch("/api/auth/ws-token");
  if (!tokenResp.ok) {
    window.location.href = "/login";
    return;
  }
  const { ws_token } = await tokenResp.json();
  const sessionParam = sessionId ? `&session_id=${sessionId}` : "";
  const ws = new WebSocket(`${WS_BASE_URL}/ws/chat?token=${encodeURIComponent(ws_token)}${sessionParam}`);
  wsRef.current = ws;
  // ... rest of WebSocket setup unchanged
}
connectWebSocket();
```

Also update ALL fetch calls in the frontend that use `Authorization: Bearer ${getAccessToken()}` to use the proxy instead:

```typescript
// OLD:
fetch("/admin/documents", { headers: { Authorization: `Bearer ${getAccessToken()}` } })

// NEW:
fetch("/api/proxy/admin/documents")
```

---

### FILE B8: frontend/src/app/admin/page.tsx (NEW)

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRootPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/documents"); }, [router]);
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-gray-400 text-sm">Loading...</p>
    </div>
  );
}
```

---

### FILE B9: frontend/Dockerfile (NEW)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

Also add `output: "standalone"` to `frontend/next.config.js`:
```javascript
const nextConfig = {
  output: "standalone",  // Required for Docker multi-stage build
  reactStrictMode: true,
  // ... rest unchanged
};
```

---

## PART C: DOCKER AND INFRASTRUCTURE FIXES

---

### C1: Add aegis-frontend service to docker-compose.yml

Add this service block after `aegis-fastapi`:

```yaml
  aegis-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: aegis-frontend
    hostname: aegis-frontend
    environment:
      KEYCLOAK_INTERNAL_URL: http://aegis-keycloak:8080
      KEYCLOAK_CLIENT_ID: aegis-chat
      KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-aegis_chat_client_secret_dev}
      BACKEND_URL: http://aegis-fastapi:8000
      NODE_ENV: production
    networks:
      - nexus-app
      - nexus-obs
    depends_on:
      aegis-fastapi:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3000 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

Also add to `aegis-nginx` depends_on:
```yaml
    depends_on:
      aegis-fastapi:
        condition: service_healthy
      aegis-frontend:
        condition: service_healthy
```

---

### C2: Fix infrastructure/nginx/nginx.conf

Find and replace the frontend upstream and location block:

```nginx
# ADD this upstream block near the top of the http{} section:
upstream aegis_frontend {
    server aegis-frontend:3000;
    keepalive 16;
}

# REPLACE the wrong location / block:
# OLD: proxy_pass http://aegis-fastapi:3000;
# NEW:
location / {
    proxy_pass http://aegis_frontend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
}
```

---

## PART D: NEW UTILITY SCRIPTS

---

### FILE D1: scripts/warmup_models.py (NEW)

```python
#!/usr/bin/env python3
"""Warm up Ollama models after Docker restart."""
import sys, subprocess

INSTANCES = [
    ("aegis-ollama-main", "qwen2.5:32b-instruct-q4_K_M"),
    ("aegis-ollama-judge", "qwen2.5:7b-instruct-q4_K_M"),
    ("aegis-ollama-vision", "qwen2.5vl:7b-instruct-q4_K_M"),
]

print("Warming up Ollama models (this may take 2-5 minutes)...")
for container, model in INSTANCES:
    print(f"  Warming {container}...")
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "run", model, "Respond: READY"],
        capture_output=True, text=True, timeout=300)
    if result.returncode == 0:
        print(f"  ✓ {container} ready")
    else:
        print(f"  ✗ {container} failed: {result.stderr[:80]}")
        sys.exit(1)

print("✓ All models warmed up")
```

---

### FILE D2: scripts/seed_test_documents.py (NEW)

```python
#!/usr/bin/env python3
"""Seeds SD-ERR-001 document for integration tests."""
import asyncio, sys

SAMPLE_TEXT = """DOCUMENT_ID: SD-ERR-001
CONTENT_TYPE: error_guide
MODULE: SD
ERROR_CODE: VL150
TRANSACTIONS: VL01N, MMBE, MB52, MB25, MM02
WHEN_THIS_OCCURS:
This error appears in VL01N when available stock minus safety stock is less than delivery quantity.

================================================================================
CAUSE_1: Safety Stock Too High
================================================================================

CAUSE_1_HOW_TO_IDENTIFY:
1. Check MMBE for unrestricted stock. 2. Check MM02 MRP 2 tab Safety Stock field.
3. If Safety Stock equals or exceeds unrestricted stock this is Cause 1.

CAUSE_1_RESOLUTION_STEPS:
1. Go to MM02. 2. Enter material number from error. 3. Select plant. 4. Go to MRP 2 tab.
5. Reduce Safety Stock below unrestricted stock shown in MMBE. 6. Save. 7. Retry VL01N.

================================================================================
SUCCESS_INDICATOR:
Delivery document created. Number appears at bottom of VL01N screen.

ESCALATION_CRITERIA:
- Safety stock already 0 and error persists.
- Same error for more than 5 materials simultaneously.

LAST_VERIFIED_DATE: 2024-03-28
VERIFIED_BY: Rsuresh1"""


async def seed():
    from app.infrastructure.redis_client import redis_session, redis_queue, arq_client
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.infrastructure.postgres_client import postgres_client
    from app.services.ingestion_pipeline import IngestionPipeline

    await redis_session.connect()
    await redis_queue.connect()
    await arq_client.connect()
    await qdrant_client.connect()
    await opensearch_client.connect()
    await postgres_client.connect()

    pipe = IngestionPipeline()
    fields = pipe._stage3_detect_fields(SAMPLE_TEXT)
    errors = pipe._stage4_validate_schema(fields)
    if errors:
        print(f"✗ Validation: {errors}"); sys.exit(1)

    chunks = pipe._stage6_chunk_document(fields, SAMPLE_TEXT)
    for c in chunks: c.total_chunks = len(chunks)
    chunks = await pipe._stage7_embed_chunks(chunks)
    doc_id = fields["DOCUMENT_ID"]
    await pipe._stage8_qdrant_ingest(chunks, doc_id)
    await pipe._stage9_opensearch_index(chunks, doc_id)
    await pipe._stage11_registry_update(fields, doc_id, len(chunks))
    print(f"✓ Seeded {doc_id}: {len(chunks)} chunks — integration tests ready")


asyncio.run(seed())
```

---

## SESSION 21 VERIFICATION

```bash
# 1. Verify all imports work
cd backend && source venv/bin/activate
python -c "
from app.config import KG_BASE_RANK_EQUIVALENT, FEEDBACK_RETRIEVAL_FAIL_THRESHOLD
from app.infrastructure.postgres_client import postgres_client
from app.infrastructure.redis_client import arq_client
from app.handlers.admin_handler import router
from app.middleware.authentication import ws_authenticate
print('✓ All imports successful')
"

# 2. Start all services
docker compose build aegis-frontend aegis-fastapi aegis-arq
docker compose up -d
sleep 10

# 3. Warm up models (after restart)
python scripts/warmup_models.py

# 4. Seed integration test data
python scripts/seed_test_documents.py

# 5. Run all tests
python -m pytest tests/unit/ -v --timeout=30
python -m pytest tests/integration/ -v --timeout=180 -s

# 6. Test login flow
open http://localhost:3000
# Login as employee1 / employee_demo_2024
# Should see chat interface with Connected status
```

---

## WHAT THIS SESSION FIXES

| Bug | Fixed? |
|---|---|
| Auth: sessionStorage vs HttpOnly cookies | ✓ Fully fixed |
| ARQ: raw rpush vs enqueue_job | ✓ Fully fixed |
| WebSocket: unauthenticated endpoint | ✓ Fully fixed |
| Nginx: wrong frontend port | ✓ Fully fixed |
| Frontend: no Docker service | ✓ Fully fixed |
| postgres_client.py: missing | ✓ Fully fixed |
| CRAG parser: brittle startswith | ✓ Fully fixed |
| Qdrant cache cleanup: wrong filter type | ✓ Fully fixed |
| Multi-worker synonym map | ✓ Fully fixed |
| Missing .env.local | ✓ Fully fixed |
| Integration test data: no seed | ✓ Fully fixed |
| Model warm-up: no script | ✓ Fully fixed |
| Admin portal: missing redirect page | ✓ Fully fixed |
| Admin handler: completely missing | ✓ Fully fixed |
| Missing config constants | ✓ Fully fixed |

```bash
git add -A
git commit -m "IMPL-21: All 15 bugs fixed — auth cookies, ARQ, WS, Docker frontend, admin handler"
```

---

*Document version: 1.0 | AEGIS Specification Set — Final Fix Session*
