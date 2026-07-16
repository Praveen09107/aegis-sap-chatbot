"""
AEGIS Vision Task
ARQ background task: processes screenshot -> extracts DiagnosticObject ->
stores in Redis -> publishes vision_complete signal.

File is at /tmp/aegis_uploads/{session_id}_{timestamp}.{ext}
"""
import os
import json
import base64
import logging
from typing import Dict

logger = logging.getLogger(__name__)

VISION_EXTRACTION_PROMPT = """You are analyzing a screenshot of an SAP screen.
Extract the following information and return it as a valid JSON object.
Set any field to null if it is not visible in the screenshot.

Required JSON structure:
{
  "error_code": "SAP error code if visible (e.g. VL150, F5201) or null",
  "error_message_text": "Complete error message text exactly as shown or null",
  "transaction_code": "T-code visible in screen title (e.g. VL01N, MM02) or null",
  "screen_title": "Full screen title bar text or null",
  "material_number": "Material number if visible or null",
  "plant_code": "Plant code (4-digit number) if visible or null",
  "document_number": "10-digit SAP document number if visible or null",
  "batch_number": "Batch/lot number if visible or null",
  "field_values": [{"field": "field label", "value": "field value"}],
  "visible_quantities": [{"label": "quantity label", "value": "quantity with unit"}]
}

Return ONLY the JSON object, no other text."""


async def process_vision_task(
    ctx: Dict,
    *,
    session_id: str,
    file_path: str,
):
    """
    ARQ vision task handler.
    Processes screenshot and stores DiagnosticObject in Redis.
    """
    logger.info(f"Vision task started: session={session_id}, file={file_path}")

    try:
        if not os.path.exists(file_path):
            logger.error(f"Vision task: file not found: {file_path}")
            return {"status": "failed", "reason": "file_not_found"}

        with open(file_path, "rb") as f:
            image_bytes = f.read()
        image_b64 = base64.b64encode(image_bytes).decode()

        ext = os.path.splitext(file_path)[1].lower()
        mime_type = "image/jpeg" if ext in {".jpg", ".jpeg"} else "image/png"

        import httpx
        from app.config import OLLAMA_VISION_URL, MODEL_VISION, VISION_PROCESSING_TIMEOUT

        async with httpx.AsyncClient(timeout=VISION_PROCESSING_TIMEOUT) as client:
            response = await client.post(
                f"{OLLAMA_VISION_URL}/api/chat",
                json={
                    "model": MODEL_VISION,
                    "messages": [
                        {
                            "role": "user",
                            "content": VISION_EXTRACTION_PROMPT,
                            "images": [image_b64],
                        }
                    ],
                    "stream": False,
                    "options": {"temperature": 0.0},
                },
            )
            response.raise_for_status()
            result = response.json()

        model_output = result.get("message", {}).get("content", "")
        diagnostic_obj = _parse_diagnostic_object(model_output)

        from app.infrastructure.redis_client import redis_session
        await redis_session.set_diagnostic_object(session_id, diagnostic_obj)
        logger.info(f"Vision task: DiagnosticObject stored for session={session_id}")

        from app.observability import VISION_TASKS
        VISION_TASKS.labels(status="success").inc()
        return {"status": "success", "session_id": session_id}

    except Exception as e:
        logger.error(f"Vision task failed for session={session_id}: {e}")
        from app.observability import VISION_TASKS
        VISION_TASKS.labels(status="failed").inc()
        raise

    finally:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Cleaned up temp file: {file_path}")
        except Exception as cleanup_err:
            logger.warning(f"Could not clean up temp file {file_path}: {cleanup_err}")


def _parse_diagnostic_object(model_output: str) -> Dict:
    """
    Parse DiagnosticObject JSON from model output.
    Returns safe defaults for all fields if parsing fails.
    """
    default = {
        "error_code": None,
        "error_message_text": None,
        "transaction_code": None,
        "screen_title": None,
        "material_number": None,
        "plant_code": None,
        "document_number": None,
        "batch_number": None,
        "field_values": [],
        "visible_quantities": [],
    }

    try:
        text = model_output.strip()
        if "{" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            json_str = text[start:end]
            parsed = json.loads(json_str)
            for key in default:
                if key not in parsed:
                    parsed[key] = default[key]
            return parsed
    except json.JSONDecodeError as e:
        logger.warning(f"Could not parse DiagnosticObject JSON: {e}. Output: {model_output[:200]}")

    return default
