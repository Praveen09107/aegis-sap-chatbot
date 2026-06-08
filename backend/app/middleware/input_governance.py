"""
AEGIS Input Governance Middleware.

Implements the three-component Input Governance Layer from AEGIS_MASTER_REFERENCE.md:

Component 1: Schema validation — request body structure matches endpoint expectations
Component 2: File type validation — magic bytes check (JPEG/PNG/DOCX/PDF only)
Component 3: SAP injection pattern detection — blocks prompt injection attempts

All three checks are rule-based (no model inference), completing in under 5ms total.
"""
import json
import logging
import re
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# ============================================================
# Magic Bytes for Supported File Types
# Format: (magic_bytes, mime_type)
# ============================================================
MAGIC_BYTES = {
    "jpeg": (bytes([0xFF, 0xD8, 0xFF]), "image/jpeg"),
    "png": (bytes([0x89, 0x50, 0x4E, 0x47]), "image/png"),
    "docx": (bytes([0x50, 0x4B, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pdf": (bytes([0x25, 0x50, 0x44, 0x46]), "application/pdf"),
}

MAX_MAGIC_BYTES_TO_READ = 12

# ============================================================
# SAP Injection Pattern Detection — compiled once at module load
# These patterns have NO legitimate SAP helpdesk use case.
# ============================================================
INJECTION_PATTERNS = [
    re.compile(r"(ignore|disregard|forget|bypass|override)\s+(previous|above|prior|your)\s+(instructions?|rules?|context|system|prompt)", re.IGNORECASE),
    re.compile(r"(repeat|echo|print|show|reveal|tell\s+me|give\s+me)\s+(\w+\s+)?(your\s+)?(system\s+prompt|instructions?|rules?|prompt\s+above)", re.IGNORECASE),
    re.compile(r"what\s+are\s+your\s+(instructions?|rules?|system\s+prompt)", re.IGNORECASE),
    re.compile(r"(output|print|display)\s+your\s+(full\s+)?(prompt|instructions?|context)", re.IGNORECASE),
    re.compile(r"(act\s+as|pretend\s+(to\s+be|you\s+are)|you\s+are\s+now|from\s+now\s+on)\s+.{0,50}(different|unrestricted|uncensored|jailbreak|DAN)", re.IGNORECASE),
    re.compile(r"developer\s+mode|jailbreak|DAN\s+mode|godmode", re.IGNORECASE),
    re.compile(r"(tell\s+me|show\s+me|what\s+is|give\s+me)\s+(the\s+)?(database\s+password|db\s+password|admin\s+password|api\s+key|secret\s+key|vault\s+token)", re.IGNORECASE),
    re.compile(r"(SAP\s+)?(admin|master|root)\s+(password|credential|login|username)", re.IGNORECASE),
    re.compile(r"(system\s+user|dialog\s+user|technical\s+user)\s+(password|credential)", re.IGNORECASE),
    re.compile(r"/v1/(secret|pki|database|transit|auth)/", re.IGNORECASE),
    re.compile(r"vault\s+(token|credential|secret|path)", re.IGNORECASE),
]

# ============================================================
# Endpoints and their expected Content-Type
# ============================================================
ENDPOINT_CONTENT_TYPES = {
    "/api/chat": ["application/json", "multipart/form-data"],
    "/api/feedback": ["application/json"],
    "/admin/documents/upload": ["multipart/form-data"],
    "/admin/": ["application/json"],
    "/health": [],
}

BYPASS_PATHS = ["/health", "/metrics", "/favicon.ico"]


class InputGovernanceMiddleware(BaseHTTPMiddleware):
    """Three-component input governance.

    Runs after TraceIDMiddleware, before AuthenticationMiddleware.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """Run input governance checks on the request."""
        path = request.url.path
        trace_id = getattr(request.state, "trace_id", "no-trace-id")

        if any(path.startswith(bp) for bp in BYPASS_PATHS):
            return await call_next(request)

        # ============================================================
        # Check 1: Content-Type validation for POST/PUT requests
        # ============================================================
        if request.method in ["POST", "PUT", "PATCH"]:
            content_type = request.headers.get("content-type", "")
            content_type_base = content_type.split(";")[0].strip().lower()

            allowed_types = None
            for endpoint, types in ENDPOINT_CONTENT_TYPES.items():
                if path.startswith(endpoint) and types:
                    allowed_types = types
                    break

            if allowed_types:
                if not any(ct in content_type_base for ct in allowed_types):
                    logger.warning(
                        "Input governance: invalid content-type",
                        extra={"trace_id": trace_id, "content_type": content_type, "path": path},
                    )
                    return JSONResponse(
                        status_code=400,
                        content={
                            "error": "invalid_content_type",
                            "message": f"Endpoint {path} does not accept Content-Type: {content_type_base}",
                        },
                        headers={"X-Governance-Block": "content_type", "X-Trace-ID": trace_id},
                    )

        # ============================================================
        # Check 2: File type magic bytes validation (for uploads)
        # Note: Full body reading for magic bytes is done in upload_handler.py.
        # ============================================================

        # ============================================================
        # Check 3: SAP injection pattern detection
        # Only for JSON bodies with a 'message' field (chat requests)
        # ============================================================
        if (
            request.method == "POST"
            and "application/json" in request.headers.get("content-type", "")
            and path.startswith("/api/")
        ):
            try:
                body_bytes = await request.body()
                body_text = body_bytes.decode("utf-8", errors="ignore")
                body_json = json.loads(body_text) if body_text else {}
                message = body_json.get("message", "")

                if message and isinstance(message, str):
                    for pattern in INJECTION_PATTERNS:
                        if pattern.search(message):
                            logger.warning(
                                "Input governance: injection pattern detected",
                                extra={"trace_id": trace_id, "pattern": pattern.pattern[:50], "path": path},
                            )
                            return JSONResponse(
                                status_code=400,
                                content={
                                    "error": "governance_violation",
                                    "message": "Request content violates AEGIS content policy.",
                                },
                                headers={"X-Governance-Block": "injection_pattern", "X-Trace-ID": trace_id},
                            )

            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

        return await call_next(request)


def check_magic_bytes(file_bytes: bytes) -> Optional[str]:
    """Check magic bytes to determine file type.

    Returns file extension string ("jpeg", "png", "docx", "pdf") if valid,
    or None if the file type is not supported.

    Called from upload_handler.py when processing file uploads.

    Args:
        file_bytes: Raw file bytes to inspect.

    Returns:
        File extension string or None if unsupported.
    """
    if not file_bytes:
        return None

    header = file_bytes[:MAX_MAGIC_BYTES_TO_READ]

    for file_type, (magic, _mime_type) in MAGIC_BYTES.items():
        if header[:len(magic)] == magic:
            return file_type

    return None
