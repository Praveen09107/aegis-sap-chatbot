"""
AEGIS File Upload Handler
Handles screenshot and document uploads with complete validation.

For screenshots: validates JPEG/PNG magic bytes → saves to temp dir → queues ARQ vision task
For documents: validates DOCX/PDF magic bytes → passes to ingestion pipeline
"""
import os
import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, Request, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from app.config import TEMP_UPLOAD_DIR, MAX_SCREENSHOT_BYTES, MAX_DOCUMENT_BYTES

logger = logging.getLogger(__name__)
router = APIRouter()

MAGIC_SIGNATURES = {
    "jpeg": (bytes([0xFF, 0xD8, 0xFF]), "image/jpeg"),
    "png":  (bytes([0x89, 0x50, 0x4E, 0x47]), "image/png"),
    "docx": (bytes([0x50, 0x4B, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pdf":  (bytes([0x25, 0x50, 0x44, 0x46]), "application/pdf"),
}


def validate_magic_bytes(file_content: bytes) -> tuple[str, str]:
    """
    Validate file content against known magic bytes.
    Returns (extension, mime_type) or raises HTTPException.
    """
    for ext, (magic, mime_type) in MAGIC_SIGNATURES.items():
        if file_content[:len(magic)] == magic:
            return ext, mime_type

    raise HTTPException(
        status_code=400,
        detail=(
            "Unsupported file format. AEGIS accepts .jpg, .png (screenshots) "
            "and .docx, .pdf (documents). The uploaded file format is not recognised."
        )
    )


@router.post("/api/upload/screenshot")
async def upload_screenshot(request: Request, file: UploadFile = File(...)):
    """
    Upload a SAP screenshot for vision processing.
    Validates magic bytes, saves to temp dir, queues ARQ vision task.
    """
    session_id = getattr(request.state, "session_id", None)
    if not session_id:
        session_id = str(uuid.uuid4())

    content = await file.read()

    if len(content) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(status_code=413, detail="Screenshot too large. Maximum size is 10MB.")

    ext, mime_type = validate_magic_bytes(content)

    if ext not in {"jpeg", "png"}:
        raise HTTPException(
            status_code=400,
            detail=f"Screenshots must be JPEG or PNG format. Received: {ext}"
        )

    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    timestamp_ms = int(datetime.utcnow().timestamp() * 1000)
    filename = f"{session_id}_{timestamp_ms}.{ext}"
    file_path = os.path.join(TEMP_UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Screenshot saved: {file_path} ({len(content)} bytes)")

    task_id = await _queue_vision_task(session_id, file_path)

    return JSONResponse({
        "status": "processing",
        "session_id": session_id,
        "task_id": task_id,
        "message": "Screenshot received. Processing will complete within 60 seconds.",
    })


@router.post("/api/upload/document")
async def upload_document(request: Request, file: UploadFile = File(...)):
    """
    Upload a SAP knowledge document (DOCX or PDF) for ingestion.
    Requires it-admin role.
    """
    role = getattr(request.state, "role", "employee")
    if role not in {"it-admin", "consultant"}:
        raise HTTPException(
            status_code=403,
            detail="Document upload requires IT admin role."
        )

    content = await file.read()

    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Document too large. Maximum size is 50MB.")

    ext, mime_type = validate_magic_bytes(content)

    if ext not in {"docx", "pdf"}:
        raise HTTPException(
            status_code=400,
            detail=f"Documents must be .docx or .pdf format. Received: {ext}"
        )

    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    timestamp_ms = int(datetime.utcnow().timestamp() * 1000)
    filename = f"doc_{timestamp_ms}.{ext}"
    file_path = os.path.join(TEMP_UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Document saved for ingestion: {file_path} ({len(content)} bytes)")

    from app.services.ingestion_pipeline import ingestion_pipeline
    result = await ingestion_pipeline.ingest(file_path, ext, original_filename=file.filename)

    if result.status == "active":
        return JSONResponse({
            "status": "complete",
            "document_id": result.document_id,
            "chunk_count": result.chunk_count,
            "message": f"Document {result.document_id} ingested successfully with {result.chunk_count} chunks.",
        })
    else:
        return JSONResponse(status_code=422, content={
            "status": "failed",
            "stage": result.stage_failed,
            "message": result.error_message,
        })


async def _queue_vision_task(session_id: str, file_path: str) -> str:
    """Queue vision processing ARQ task. Returns the real ARQ job_id."""
    from app.infrastructure.redis_client import arq_client

    job_id = await arq_client.enqueue_vision(session_id=session_id, file_path=file_path)
    logger.info(f"Vision task queued: job_id={job_id}, session={session_id}")
    return job_id
