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

        model_output = await _run_vision_extraction(image_b64, mime_type)
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


async def _run_vision_extraction(image_b64: str, mime_type: str) -> str:
    """
    Provider routing for the DiagnosticObject extraction call — mirrors
    app/clients/ollama_vision.py's _run_vision_prompt, adapted to this
    file's own real call shape (/api/chat with a "messages" array and a
    top-level "images" list, not /api/generate). Both files call the same
    underlying Groq/Cerebras vision models, so they deliberately share the
    same circuit breaker keys ("groq_vision"/"cerebras_vision") rather
    than tracking independent circuits for the same provider dependency.

    Raises on failure in both modes — the caller's existing try/except
    already records the VISION_TASKS failure metric and lets ARQ retry,
    matching this file's pre-existing behavior (unlike ollama_vision.py's
    classify_sap/extract_sap_content, which swallow errors and return a
    safe default instead, since those calls have no retry mechanism).
    """
    import httpx
    from app.config import (
        INFERENCE_MODE, OLLAMA_VISION_URL, MODEL_VISION, VISION_PROCESSING_TIMEOUT,
        CEREBRAS_API_KEY, CEREBRAS_BASE_URL, CEREBRAS_MODEL_VISION,
        GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_VISION, EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
    )

    if INFERENCE_MODE == "local":
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
            return response.json().get("message", {}).get("content", "")

    from app.infrastructure.circuit_breaker import circuit_registry
    from app.infrastructure.inference_providers import call_vision_completion

    cb_groq = circuit_registry.get("groq_vision")
    cb_cerebras = circuit_registry.get("cerebras_vision")
    if cb_groq.allows_call:
        try:
            result = await call_vision_completion(
                base_url=GROQ_BASE_URL, api_key=GROQ_API_KEY, model=GROQ_MODEL_VISION,
                prompt=VISION_EXTRACTION_PROMPT, image_b64=image_b64, mime_type=mime_type,
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            cb_groq.record_success()
            return result
        except Exception:
            cb_groq.record_failure()
    if cb_cerebras.allows_call:
        result = await call_vision_completion(
            base_url=CEREBRAS_BASE_URL, api_key=CEREBRAS_API_KEY, model=CEREBRAS_MODEL_VISION,
            prompt=VISION_EXTRACTION_PROMPT, image_b64=image_b64, mime_type=mime_type,
            timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
        )
        cb_cerebras.record_success()
        return result
    raise RuntimeError("Both groq_vision and cerebras_vision circuits are open")


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
