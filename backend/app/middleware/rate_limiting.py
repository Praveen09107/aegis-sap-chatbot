"""
AEGIS Rate Limiting Middleware.

Redis-backed per-user rate limiting: 60 requests per minute, burst of 10.
Runs after AuthenticationMiddleware (needs user_id from JWT).
Bypasses rate limiting for the /health endpoint.
"""
import logging
import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.config import RATE_LIMIT_REQUESTS_PER_MINUTE, RATE_LIMIT_BURST_CAPACITY

logger = logging.getLogger(__name__)

BYPASS_PATHS = ["/health", "/metrics"]


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """Per-user rate limiting using Redis Instance 1.

    Uses a sliding window counter keyed by user_id_hash and minute epoch.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """Check rate limit and proceed or reject."""
        path = request.url.path
        trace_id = getattr(request.state, "trace_id", "no-trace-id")

        if any(path.startswith(bp) for bp in BYPASS_PATHS):
            return await call_next(request)

        user_id = getattr(request.state, "user_id", None)
        if not user_id:
            return await call_next(request)

        minute_epoch = int(time.time() / 60)
        rate_key = f"ratelimit:{user_id}:{minute_epoch}"

        try:
            from app.infrastructure.redis_client import redis_session

            async with redis_session.redis.pipeline(transaction=True) as pipe:
                pipe.incr(rate_key)
                pipe.expire(rate_key, 120)
                results = await pipe.execute()

            current_count = results[0]
            effective_limit = RATE_LIMIT_REQUESTS_PER_MINUTE + RATE_LIMIT_BURST_CAPACITY

            if current_count > effective_limit:
                retry_after = 60 - (int(time.time()) % 60)
                logger.warning(
                    "Rate limit exceeded",
                    extra={
                        "trace_id": trace_id,
                        "user_id": user_id[:8],
                        "count": current_count,
                        "limit": effective_limit,
                    },
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "rate_limit_exceeded",
                        "message": f"Too many requests. Maximum {RATE_LIMIT_REQUESTS_PER_MINUTE} requests per minute.",
                        "retry_after_seconds": retry_after,
                    },
                    headers={
                        "X-Trace-ID": trace_id,
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(RATE_LIMIT_REQUESTS_PER_MINUTE),
                        "X-RateLimit-Remaining": str(max(0, effective_limit - current_count)),
                    },
                )

        except Exception as e:
            logger.error("Rate limiting Redis error: %s", e, extra={"trace_id": trace_id})

        return await call_next(request)
