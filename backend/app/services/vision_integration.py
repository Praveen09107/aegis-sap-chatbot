"""
AEGIS Vision Integration Service
Integrates DiagnosticObject from screenshot analysis into the query pipeline.

Two integration modes:
  1. Proactive: After vision_complete signal → generate refined answer with screen context
  2. Contextual: If DiagnosticObject exists when a text query arrives → enrich query

The DiagnosticObject supplements but never replaces the employee's text query.
Null fields in DiagnosticObject are never mentioned in the enriched query.
"""
import logging
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


class VisionIntegrationService:
    """Integrates SAP screen context from Qwen2.5-VL-7B into the query pipeline."""

    def enrich_query_with_diagnostic(
        self,
        original_query: str,
        diagnostic_obj: Dict,
    ) -> str:
        """
        Append confirmed DiagnosticObject fields to the employee's query.
        Only appends fields with non-None, non-empty values.
        Appends as structured context, not natural language.
        """
        enrichment_parts: List[str] = []

        if diagnostic_obj.get("error_code"):
            enrichment_parts.append(f"Error code on screen: {diagnostic_obj['error_code']}")

        if diagnostic_obj.get("error_message_text"):
            msg = diagnostic_obj["error_message_text"][:150]
            enrichment_parts.append(f"Error message: {msg}")

        if diagnostic_obj.get("transaction_code"):
            enrichment_parts.append(f"Active transaction: {diagnostic_obj['transaction_code']}")

        if diagnostic_obj.get("material_number"):
            enrichment_parts.append(f"Material: {diagnostic_obj['material_number']}")

        if diagnostic_obj.get("plant_code"):
            enrichment_parts.append(f"Plant: {diagnostic_obj['plant_code']}")

        if diagnostic_obj.get("document_number"):
            enrichment_parts.append(f"Document: {diagnostic_obj['document_number']}")

        if diagnostic_obj.get("field_values"):
            for field_pair in diagnostic_obj["field_values"][:3]:
                field_name = field_pair.get("field", "")
                value = field_pair.get("value", "")
                if field_name and value:
                    enrichment_parts.append(f"{field_name}: {value}")

        if not enrichment_parts:
            return original_query

        context_block = " | ".join(enrichment_parts)
        enriched = f"{original_query} [Screen context: {context_block}]"
        logger.debug(f"Query enriched with vision context: {len(enrichment_parts)} fields")
        return enriched

    def extract_entities_from_diagnostic(self, diagnostic_obj: Dict) -> List[Dict]:
        """
        Extract EntityObject-compatible dicts from DiagnosticObject.
        These supplement QIL entity extraction when vision processing completes.
        """
        entities: List[Dict] = []

        if diagnostic_obj.get("error_code"):
            entities.append({
                "type": "error_code",
                "value": diagnostic_obj["error_code"],
            })

        if diagnostic_obj.get("transaction_code"):
            entities.append({
                "type": "tcode",
                "value": diagnostic_obj["transaction_code"],
            })

        if diagnostic_obj.get("document_number"):
            entities.append({
                "type": "document_number",
                "value": diagnostic_obj["document_number"],
            })

        return entities

    def build_proactive_query(
        self,
        original_query: str,
        diagnostic_obj: Dict,
    ) -> str:
        """
        Build a refined query for the proactive vision response.
        Sent to the full pipeline after vision_complete is received.
        """
        enriched = self.enrich_query_with_diagnostic(original_query, diagnostic_obj)
        return f"Based on the SAP screen captured: {enriched}"

    def format_diagnostic_for_prompt(self, diagnostic_obj: Dict) -> str:
        """
        Format DiagnosticObject as a structured block for inclusion in the
        model prompt's Context section.
        """
        lines = ["[Screen Analysis]"]

        if diagnostic_obj.get("error_code"):
            lines.append(f"Error Code: {diagnostic_obj['error_code']}")
        if diagnostic_obj.get("error_message_text"):
            lines.append(f"Error Message: {diagnostic_obj['error_message_text'][:200]}")
        if diagnostic_obj.get("transaction_code"):
            lines.append(f"Transaction: {diagnostic_obj['transaction_code']}")
        if diagnostic_obj.get("screen_title"):
            lines.append(f"Screen: {diagnostic_obj['screen_title']}")
        if diagnostic_obj.get("material_number"):
            lines.append(f"Material: {diagnostic_obj['material_number']}")
        if diagnostic_obj.get("plant_code"):
            lines.append(f"Plant: {diagnostic_obj['plant_code']}")

        for field_pair in diagnostic_obj.get("field_values", [])[:5]:
            field_name = field_pair.get("field", "")
            value = field_pair.get("value", "")
            if field_name and value:
                lines.append(f"{field_name}: {value}")

        for qty in diagnostic_obj.get("visible_quantities", [])[:3]:
            label = qty.get("label", "")
            value = qty.get("value", "")
            if label and value:
                lines.append(f"{label}: {value}")

        return "\n".join(lines)


vision_integration = VisionIntegrationService()
