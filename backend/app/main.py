"""
AEGIS FastAPI Application.

Main application factory with complete middleware stack.
Middleware execution order (outer to inner = last registered to first registered):
  1. TraceID (always runs, even for 401/400)
  2. Authentication (JWT verification + revocation check) — added in Session 10
  3. Input Governance (schema, file type, injection patterns)
  4. Rate Limiting (per-user Redis counter)
  5. Route Handler (business logic)
"""
import logging
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.config import ENVIRONMENT, LOG_LEVEL
from app.middleware.trace_id import TraceIDMiddleware
from app.middleware.authentication import AuthenticationMiddleware
from app.middleware.input_governance import InputGovernanceMiddleware
from app.middleware.rate_limiting import RateLimitingMiddleware
import app.observability  # noqa: F401 — registers all 13 metrics in every worker at import time

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all connections on startup, close on shutdown."""
    log.info("AEGIS starting up", environment=ENVIRONMENT)

    from app.infrastructure.redis_client import redis_session, redis_queue, arq_client
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.infrastructure.minio_client import minio_client
    from app.infrastructure.postgres_client import postgres_client
    from app.services.query_intelligence import query_intelligence

    await redis_session.connect()
    await redis_queue.connect()
    await arq_client.connect()
    await qdrant_client.connect()
    await opensearch_client.connect()
    await minio_client.ensure_buckets()
    await postgres_client.connect()
    await query_intelligence.start_reload_listener()

    from app.middleware.authentication import load_keycloak_public_keys
    await load_keycloak_public_keys()

    log.info("AEGIS ready", environment=ENVIRONMENT)
    yield

    await redis_session.close()
    await redis_queue.close()
    await arq_client.close()
    await qdrant_client.close()
    await opensearch_client.close()
    await postgres_client.close()
    log.info("AEGIS shut down cleanly")


app = FastAPI(
    title="AEGIS",
    description="Adaptive Enterprise Grade Intelligence System",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if ENVIRONMENT == "demo" else None,
)

# ============================================================
# Register middleware in REVERSE execution order
# (Starlette executes middleware in reverse registration order)
# ============================================================

app.add_middleware(RateLimitingMiddleware)
app.add_middleware(InputGovernanceMiddleware)
app.add_middleware(AuthenticationMiddleware)
app.add_middleware(TraceIDMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://localhost", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# Routes
from app.handlers.admin_handler import router as admin_router
from app.handlers.upload_handler import router as upload_router
from app.handlers.knowledge_entries_handler import router as knowledge_entries_router
from app.handlers.knowledge_screenshots_handler import admin_router as knowledge_screenshots_router, serve_router as screenshots_serve_router
app.include_router(admin_router)
app.include_router(upload_router)
app.include_router(knowledge_entries_router)
app.include_router(knowledge_screenshots_router)
app.include_router(screenshots_serve_router)


@app.get("/health")
async def health_check():
    """System health check. Returns status of all services."""
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.infrastructure.minio_client import minio_client
    from app.infrastructure.postgres_client import postgres_client

    redis_health = await redis_session.health_check()
    queue_health = await redis_queue.health_check()
    qdrant_health = await qdrant_client.health_check()
    opensearch_health = await opensearch_client.health_check()
    minio_health = await minio_client.health_check()
    postgres_health = await postgres_client.health_check()

    all_healthy = all([
        redis_health.get("status") == "healthy",
        queue_health.get("status") == "healthy",
        qdrant_health.get("status") == "healthy",
        opensearch_health.get("status") == "healthy",
        minio_health.get("status") == "healthy",
        postgres_health.get("status") == "healthy",
    ])

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": {
            "redis_session": redis_health.get("status"),
            "redis_queue": queue_health.get("status"),
            "qdrant": qdrant_health.get("status"),
            "opensearch": opensearch_health.get("status"),
            "minio": minio_health.get("status"),
            "postgres": postgres_health.get("status"),
        },
    }


@app.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint.

    uvicorn runs 2 worker processes, each with its own in-memory
    prometheus_client registry — a plain generate_latest() would only ever
    show whichever single worker happened to serve this request. When
    PROMETHEUS_MULTIPROC_DIR is set (see docker-compose.yml), each worker
    writes to per-pid mmap files instead, and MultiProcessCollector merges
    all workers' files into one real aggregate view.
    """
    import os
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, CollectorRegistry
    from fastapi.responses import Response as FastAPIResponse

    if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        from prometheus_client import multiprocess
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        payload = generate_latest(registry)
    else:
        payload = generate_latest()

    return FastAPIResponse(content=payload, media_type=CONTENT_TYPE_LATEST)


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, session_id: str = None):
    from app.handlers.chat_handler import chat_websocket_handler
    await chat_websocket_handler(websocket, session_id)
