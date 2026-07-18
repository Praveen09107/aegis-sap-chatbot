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
    INFERENCE_MODE, OLLAMA_VISION_URL, MODEL_VISION, VISION_CASCADE_BUDGET_SECONDS,
)

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
    Ollama-only design never distinguished JPEG/PNG at this layer.

    External mode routes through model_gateway.walk_chain()'s full 5-tier
    vision chain (INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.5) —
    this function's own 2-provider try/except cascade was retired in favor
    of that shared engine. classify_sap()/extract_sap_content() (this
    file's two callers) keep their own try/except exactly as before,
    swallowing any exception walk_chain raises and returning a safe
    default — only this function's internals changed, not the error-
    handling policy layered on top of it."""
    if INFERENCE_MODE == "local":
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{OLLAMA_VISION_URL}/api/generate",
                json={"model": MODEL_VISION, "prompt": prompt,
                      "images": [image_base64], "stream": False},
            )
            response.raise_for_status()
            return response.json().get("response", "")

    from app.services.model_gateway import walk_chain
    return await walk_chain(
        role="vision", prompt=prompt, budget_seconds=VISION_CASCADE_BUDGET_SECONDS,
        image_b64=image_base64, mime_type="image/png",
    )


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
