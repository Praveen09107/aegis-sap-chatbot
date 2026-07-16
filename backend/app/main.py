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
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import ENVIRONMENT, LOG_LEVEL
from app.middleware.trace_id import TraceIDMiddleware
from app.middleware.authentication import AuthenticationMiddleware
from app.middleware.input_governance import InputGovernanceMiddleware
from app.middleware.rate_limiting import RateLimitingMiddleware

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all connections on startup, close on shutdown."""
    logger.info("AEGIS starting up...")

    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.infrastructure.minio_client import minio_client

    await redis_session.connect()
    await redis_queue.connect()
    await qdrant_client.connect()
    await opensearch_client.connect()
    await minio_client.ensure_buckets()

    from app.middleware.authentication import load_keycloak_public_keys
    await load_keycloak_public_keys()

    logger.info("AEGIS ready (environment: %s)", ENVIRONMENT)
    yield

    await redis_session.close()
    await redis_queue.close()
    await qdrant_client.close()
    await opensearch_client.close()
    logger.info("AEGIS shut down cleanly")


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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
async def health_check():
    """System health check. Returns status of all services."""
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client

    redis_health = await redis_session.health_check()
    queue_health = await redis_queue.health_check()
    qdrant_health = await qdrant_client.health_check()
    opensearch_health = await opensearch_client.health_check()

    all_healthy = all([
        redis_health.get("status") == "healthy",
        queue_health.get("status") == "healthy",
        qdrant_health.get("status") == "healthy",
        opensearch_health.get("status") == "healthy",
    ])

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": {
            "redis_session": redis_health.get("status"),
            "redis_queue": queue_health.get("status"),
            "qdrant": qdrant_health.get("status"),
            "opensearch": opensearch_health.get("status"),
        },
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    from fastapi.responses import Response as FastAPIResponse
    return FastAPIResponse(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, session_id: str = None):
    from app.handlers.chat_handler import chat_websocket_handler
    await chat_websocket_handler(websocket, session_id)


# Register upload routes (IMPL-13)
from app.handlers.upload_handler import router as upload_router
app.include_router(upload_router)
