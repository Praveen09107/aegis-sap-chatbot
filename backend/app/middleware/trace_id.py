"""
AEGIS Trace ID Middleware.

Generates a unique UUID4 trace_id for every request and attaches it to the
request state. This trace_id flows through all components for debugging.
Runs FIRST so that even 401/400 responses have a trace_id in their logs.
"""
import uuid
import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)


class TraceIDMiddleware(BaseHTTPMiddleware):
    """Generates a trace_id UUID4 for every request.

    The trace_id is:
    1. Stored in request.state.trace_id
    2. Added to the response as X-Trace-ID header
    3. Used by all downstream components for structured logging
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """Inject trace_id into request state and response headers."""
        trace_id = str(uuid.uuid4())
        request.state.trace_id = trace_id

        response = await call_next(request)
        response.headers["X-Trace-ID"] = trace_id
        return response
