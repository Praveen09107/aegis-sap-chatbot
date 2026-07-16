"""
AEGIS Ollama Vision Client
Interfaces with qwen2.5vl:7b via aegis-ollama-vision for SAP screenshot analysis.

Two functions:
  classify_sap  — Classifies a SAP screenshot into one of five screen types
  extract_sap_content — Extracts structured SAP data using type-specific prompts

Uses Ollama /api/generate endpoint with base64 image, stream=False.
"""
import enum
import json
import logging
from dataclasses import dataclass, field
from typing import List, Dict

import httpx

from app.config import (
    INFERENCE_MODE, OLLAMA_VISION_URL, MODEL_VISION,
    CEREBRAS_API_KEY, CEREBRAS_BASE_URL, CEREBRAS_MODEL_VISION,
    GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_VISION, EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
)
from app.infrastructure.circuit_breaker import circuit_registry
from app.infrastructure.inference_providers import call_vision_completion

logger = logging.getLogger(__name__)


class SAPScreenshotType(str, enum.Enum):
    """Classification labels for SAP screenshots."""
    ERROR_DIALOG = "error_dialog"
    TRANSACTION_SCREEN = "transaction_screen"
    REPORT_OUTPUT = "report_output"
    CONFIGURATION_SCREEN = "configuration_screen"
    LIST_DISPLAY = "list_display"


@dataclass
class ExtractedSAPData:
    """Structured data extracted from a SAP screenshot."""
    error_codes: List[str] = field(default_factory=list)
    t_codes: List[str] = field(default_factory=list)
    field_names: List[str] = field(default_factory=list)
    field_values: Dict[str, str] = field(default_factory=dict)
    screen_title: str = ""
    message_text: str = ""


CLASSIFY_PROMPT = (
    "This is a SAP system screenshot. Classify it as exactly one of: "
    "error_dialog, transaction_screen, report_output, configuration_screen, list_display. "
    "Reply with only the classification label, nothing else."
)

EXTRACT_PROMPTS = {
    SAPScreenshotType.ERROR_DIALOG: (
        "Extract from this SAP error dialog: "
        "1. Error code (e.g. VL150, F5263) "
        "2. Error message text "
        "3. Any field names visible on screen "
        "4. Any transaction code shown in the title bar "
        "Reply in JSON format: "
        '{"error_codes": [...], "t_codes": [...], "field_names": [...], '
        '"field_values": {...}, "screen_title": "...", "message_text": "..."}'
    ),
    SAPScreenshotType.TRANSACTION_SCREEN: (
        "Extract from this SAP transaction screen: "
        "1. Transaction code from the title bar "
        "2. Screen title "
        "3. All visible field names and their current values "
        "Reply in JSON format: "
        '{"error_codes": [], "t_codes": [...], "field_names": [...], '
        '"field_values": {...}, "screen_title": "...", "message_text": ""}'
    ),
    SAPScreenshotType.REPORT_OUTPUT: (
        "Extract from this SAP report output: "
        "1. Report name or transaction code "
        "2. Column headers "
        "3. Any error messages or status indicators "
        "Reply in JSON format: "
        '{"error_codes": [...], "t_codes": [...], "field_names": [...], '
        '"field_values": {...}, "screen_title": "...", "message_text": "..."}'
    ),
    SAPScreenshotType.CONFIGURATION_SCREEN: (
        "Extract configuration settings from this SAP screen: "
        "1. Configuration parameter names "
        "2. Current values for each parameter "
        "3. Screen title or transaction code "
        "Reply in JSON format: "
        '{"error_codes": [], "t_codes": [...], "field_names": [...], '
        '"field_values": {...}, "screen_title": "...", "message_text": ""}'
    ),
    SAPScreenshotType.LIST_DISPLAY: (
        "Extract from this SAP list display: "
        "1. Transaction code or report name "
        "2. Column headers "
        "3. Any status indicators or error markers "
        "Reply in JSON format: "
        '{"error_codes": [...], "t_codes": [...], "field_names": [...], '
        '"field_values": {...}, "screen_title": "...", "message_text": "..."}'
    ),
}


async def _run_vision_prompt(prompt: str, image_base64: str, timeout: int) -> str:
    """Shared provider routing for both vision functions in this file.
    image_base64 has no data:image/...;base64, prefix — mime_type is
    assumed image/png for the external providers, since the original
    Ollama-only design never distinguished JPEG/PNG at this layer."""
    if INFERENCE_MODE == "local":
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{OLLAMA_VISION_URL}/api/generate",
                json={"model": MODEL_VISION, "prompt": prompt,
                      "images": [image_base64], "stream": False},
            )
            response.raise_for_status()
            return response.json().get("response", "")

    cb_groq = circuit_registry.get("groq_vision")
    cb_cerebras = circuit_registry.get("cerebras_vision")
    if cb_groq.allows_call:
        try:
            result = await call_vision_completion(
                base_url=GROQ_BASE_URL, api_key=GROQ_API_KEY, model=GROQ_MODEL_VISION,
                prompt=prompt, image_b64=image_base64, mime_type="image/png",
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            cb_groq.record_success()
            return result
        except Exception:
            cb_groq.record_failure()
    if cb_cerebras.allows_call:
        result = await call_vision_completion(
            base_url=CEREBRAS_BASE_URL, api_key=CEREBRAS_API_KEY, model=CEREBRAS_MODEL_VISION,
            prompt=prompt, image_b64=image_base64, mime_type="image/png",
            timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
        )
        cb_cerebras.record_success()
        return result
    raise RuntimeError("Both groq_vision and cerebras_vision circuits are open")


async def classify_sap(image_base64: str) -> SAPScreenshotType:
    """
    Classify a SAP screenshot into one of five screen types.
    Uses qwen2.5vl:7b via aegis-ollama-vision.

    Args:
        image_base64: Base64-encoded image content (JPEG or PNG).

    Returns:
        SAPScreenshotType enum value.
    """
    try:
        result_text = (await _run_vision_prompt(CLASSIFY_PROMPT, image_base64, timeout=15)).strip().lower()

        for screen_type in SAPScreenshotType:
            if screen_type.value in result_text:
                logger.info("sap_screenshot_classified", extra={"type": screen_type.value})
                return screen_type

        logger.warning("sap_classification_unknown", extra={"raw_response": result_text[:100]})
        return SAPScreenshotType.TRANSACTION_SCREEN

    except httpx.TimeoutException:
        logger.error("vision_classify_timeout")
        return SAPScreenshotType.TRANSACTION_SCREEN
    except Exception as e:
        logger.error("vision_classify_failed", extra={"error": str(e)})
        return SAPScreenshotType.TRANSACTION_SCREEN


async def extract_sap_content(
    image_base64: str, screen_type: SAPScreenshotType
) -> ExtractedSAPData:
    """
    Extract structured SAP data from a screenshot using a type-specific prompt.

    Args:
        image_base64: Base64-encoded image content.
        screen_type: Classification result from classify_sap.

    Returns:
        ExtractedSAPData with all fields populated from the model's response.
    """
    prompt = EXTRACT_PROMPTS.get(screen_type, EXTRACT_PROMPTS[SAPScreenshotType.TRANSACTION_SCREEN])

    try:
        result_text = (await _run_vision_prompt(prompt, image_base64, timeout=30)).strip()

        return _parse_extraction_response(result_text)

    except httpx.TimeoutException:
        logger.error("vision_extract_timeout")
        return ExtractedSAPData()
    except Exception as e:
        logger.error("vision_extract_failed", extra={"error": str(e)})
        return ExtractedSAPData()


def _parse_extraction_response(raw_text: str) -> ExtractedSAPData:
    """Parse the model's JSON response into ExtractedSAPData."""
    try:
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start >= 0 and end > start:
            json_str = raw_text[start:end]
            data = json.loads(json_str)
            return ExtractedSAPData(
                error_codes=data.get("error_codes", []),
                t_codes=data.get("t_codes", []),
                field_names=data.get("field_names", []),
                field_values=data.get("field_values", {}),
                screen_title=data.get("screen_title", ""),
                message_text=data.get("message_text", ""),
            )
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("vision_json_parse_failed", extra={"error": str(e), "raw": raw_text[:200]})

    return ExtractedSAPData()


# ============================================================
# DIAGNOSTIC OBJECT STORAGE
# Key format: diagnostic:{session_id}:{screenshot_id}
# TTL: 600 seconds (10 minutes)
# ============================================================

DIAGNOSTIC_TTL_SECONDS = 600
DIAGNOSTIC_KEY_PREFIX = "diagnostic:"


async def store_diagnostic_object(
    session_id: str,
    screenshot_id: str,
    extracted: ExtractedSAPData,
) -> None:
    """
    Store extracted vision data as a DiagnosticObject in Redis Instance 1.
    Key: diagnostic:{session_id}:{screenshot_id}, TTL: 600 seconds.
    """
    from app.infrastructure.redis_client import redis_session

    key = f"{DIAGNOSTIC_KEY_PREFIX}{session_id}:{screenshot_id}"
    diagnostic = {
        "error_code": extracted.error_codes[0] if extracted.error_codes else None,
        "error_message_text": extracted.message_text or None,
        "transaction_code": extracted.t_codes[0] if extracted.t_codes else None,
        "screen_title": extracted.screen_title or None,
        "material_number": None,
        "plant_code": None,
        "document_number": None,
        "batch_number": None,
        "field_values": [
            {"field": k, "value": v} for k, v in extracted.field_values.items()
        ],
        "visible_quantities": [],
    }

    await redis_session.redis.set(key, json.dumps(diagnostic), ex=DIAGNOSTIC_TTL_SECONDS)
    logger.info(
        "diagnostic_object_stored",
        extra={"key": key, "ttl": DIAGNOSTIC_TTL_SECONDS},
    )


class OllamaVisionClient:
    """Convenience class wrapping module-level vision functions."""

    async def classify_sap(self, image_base64: str) -> SAPScreenshotType:
        return await classify_sap(image_base64)

    async def extract_sap_content(
        self, image_base64: str, screen_type: SAPScreenshotType
    ) -> ExtractedSAPData:
        return await extract_sap_content(image_base64, screen_type)

    async def store_diagnostic(
        self, session_id: str, screenshot_id: str, extracted: ExtractedSAPData
    ) -> None:
        await store_diagnostic_object(session_id, screenshot_id, extracted)
