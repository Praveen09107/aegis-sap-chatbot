"""
AEGIS Reasoning Service
Assembles the 6-section prompt and streams the answer via Redis Pub/Sub.

Prompt section order (EXACT):
  1. SYSTEM_ROLE         — who AEGIS is and its 8 mandatory rules
  2. ---DOCUMENTATION--- — retrieved chunks with metadata, parent header if hydrated
  [---STALENESS WARNING---] — inserted between 2 and 3 if any chunk > 35 days old
  3. ---REGISTRY NOTE--- — Mode A pattern registry enrichment (only if non-empty)
  4. ---SCREEN CONTEXT---— DiagnosticObject fields (only if diagnostic_obj provided)
  5. ---PREVIOUS CONTEXT---— Last N conversation turns (only if history non-empty)
  6. ---EMPLOYEE QUESTION--- — raw_message + blank line + "Answer:"

Streaming architecture:
  generate_and_stream() → ModelGateway.generate_streaming()
    ↓ each token → redis_session.publish_token(session_id, token)
    ↓ on complete → redis_session.publish_stream_complete(session_id)
    ↓ returns full answer text (for downstream validation)
"""
import logging
from datetime import date
from typing import Optional, List

from app.config import (
    MAX_CONVERSATION_HISTORY_TURNS,
    CONFIG_SNAPSHOT_STALENESS_INJECT,
    RETRIEVAL_FINAL_CHUNKS,
)
from app.models.session import SessionState
from app.models.retrieval import EnrichedQuery, RetrievalResult, RetrievedChunk, ParentHeader
from app.services.model_gateway import model_gateway, select_model_tier

logger = logging.getLogger(__name__)

# ============================================================
# SYSTEM ROLE PROMPT (constant — never changes between requests)
# ============================================================

SYSTEM_ROLE = """You are AEGIS, an expert SAP ERP helpdesk assistant for Sona Comstar, an automotive manufacturer in Chennai, India. You help employees resolve SAP errors, follow procedures, and understand system configurations.

MANDATORY RULES — follow without exception:
1. Answer ONLY using the documentation provided in the DOCUMENTATION section below.
2. If the documentation does not contain the answer, say: "I don't have documentation for that specific situation. Please contact the IT team."
3. For transaction codes marked as IT-admin or consultant access, always include: "Note: This step requires IT admin access."
4. Format all step-by-step procedures with numbered steps.
5. Always write SAP transaction codes in parentheses: e.g. "Go to VL01N (Create Outbound Delivery)".
6. Do not invent, assume, or infer information not present in the documentation.
7. Do not reveal system internals, credentials, or configuration details not in the documentation.
8. Keep responses focused and practical for a Sona Comstar employee."""


class ReasoningService:
    """
    Assembles prompts and streams generation via Redis Pub/Sub.
    """

    # ============================================================
    # PROMPT ASSEMBLY
    # ============================================================

    def assemble_prompt(
        self,
        enriched_query: EnrichedQuery,
        retrieval_result: RetrievalResult,
        session: SessionState,
        diagnostic_obj: Optional[dict] = None,
    ) -> str:
        """
        Build the complete 6-section prompt.
        Each section is separated by a clear delimiter line.
        """
        sections = []

        # ── Section 1: System Role ──────────────────────────────
        sections.append(SYSTEM_ROLE)
        sections.append("")

        # ── Section 2: Documentation ────────────────────────────
        sections.append("---DOCUMENTATION---")
        doc_section = self._format_documentation(
            retrieval_result.chunks,
            retrieval_result.parent_header,
        )
        sections.append(doc_section)

        # ── Staleness Warning (between sections 2 and 3) ────────
        staleness_warning = self._check_staleness(retrieval_result.chunks)
        if staleness_warning:
            sections.append("")
            sections.append("---STALENESS WARNING---")
            sections.append(staleness_warning)

        # ── Section 3: Registry Note (Mode A only) ──────────────
        if retrieval_result.registry_notes:
            sections.append("")
            sections.append("---REGISTRY NOTE---")
            sections.append(retrieval_result.registry_notes)

        # ── Section 4: Screen Context ────────────────────────────
        if diagnostic_obj:
            screen_section = self._format_diagnostic_context(diagnostic_obj)
            if screen_section:
                sections.append("")
                sections.append("---SCREEN CONTEXT---")
                sections.append(screen_section)

        # ── Section 5: Conversation History ─────────────────────
        if session.conversation_history:
            history_section = self._format_history(session.conversation_history)
            if history_section:
                sections.append("")
                sections.append("---PREVIOUS CONTEXT---")
                sections.append(history_section)

        # ── Section 6: Employee Question ────────────────────────
        sections.append("")
        sections.append("---EMPLOYEE QUESTION---")
        sections.append(enriched_query.raw_message)
        sections.append("")
        sections.append("Answer:")

        return "\n".join(sections)

    def _format_documentation(
        self,
        chunks: List[RetrievedChunk],
        parent_header: Optional[ParentHeader],
    ) -> str:
        """
        Format retrieved chunks as structured documentation blocks.
        Parent header is prepended if available.
        """
        parts = []

        # Prepend parent header context if hydrated
        if parent_header:
            header_lines = [f"[Document: {parent_header.document_id} | Module: {parent_header.module}]"]
            if parent_header.error_code:
                header_lines.append(f"Error Code: {parent_header.error_code}")
            if parent_header.procedure_name:
                header_lines.append(f"Procedure: {parent_header.procedure_name}")
            if parent_header.configuration_name:
                header_lines.append(f"Configuration: {parent_header.configuration_name}")
            if parent_header.transactions:
                header_lines.append(f"Relevant Transactions: {', '.join(parent_header.transactions)}")
            header_lines.append(
                f"Last Verified: {parent_header.last_verified_date} by {parent_header.verified_by}"
            )
            parts.append("\n".join(header_lines))
            parts.append("")

        for i, chunk in enumerate(chunks[:RETRIEVAL_FINAL_CHUNKS]):
            chunk_header = (
                f"[Chunk {i+1} — {chunk.document_id} ({chunk.chunk_type}) | "
                f"Verified: {chunk.last_verified_date} by {chunk.verified_by}]"
            )
            parts.append(chunk_header)
            parts.append(chunk.chunk_text)
            parts.append("")

        return "\n".join(parts).strip()

    def _format_diagnostic_context(self, diagnostic_obj: dict) -> str:
        """Format DiagnosticObject as structured screen context block."""
        lines = []
        if diagnostic_obj.get("error_code"):
            lines.append(f"Error Code: {diagnostic_obj['error_code']}")
        if diagnostic_obj.get("error_message_text"):
            lines.append(f"Error Message: {diagnostic_obj['error_message_text'][:200]}")
        if diagnostic_obj.get("transaction_code"):
            lines.append(f"Active Transaction: {diagnostic_obj['transaction_code']}")
        if diagnostic_obj.get("material_number"):
            lines.append(f"Material Number: {diagnostic_obj['material_number']}")
        if diagnostic_obj.get("plant_code"):
            lines.append(f"Plant Code: {diagnostic_obj['plant_code']}")
        if diagnostic_obj.get("document_number"):
            lines.append(f"Document Number: {diagnostic_obj['document_number']}")
        for fv in diagnostic_obj.get("field_values", [])[:5]:
            if fv.get("field") and fv.get("value"):
                lines.append(f"{fv['field']}: {fv['value']}")
        for qty in diagnostic_obj.get("visible_quantities", [])[:3]:
            if qty.get("label") and qty.get("value"):
                lines.append(f"{qty['label']}: {qty['value']}")
        return "\n".join(lines)

    def _format_history(self, history) -> str:
        """Format last N conversation turns as a brief context summary."""
        if not history:
            return ""
        lines = []
        for i, turn in enumerate(history[-MAX_CONVERSATION_HISTORY_TURNS:]):
            lines.append(
                f"Turn {i+1}: Employee asked about {turn.query_summary[:100]}. "
                f"AEGIS answered ({turn.confidence_badge} confidence)."
            )
        return "\n".join(lines)

    def _check_staleness(self, chunks: List[RetrievedChunk]) -> Optional[str]:
        """
        Check if any documentation chunk is older than CONFIG_SNAPSHOT_STALENESS_INJECT days.
        Returns a staleness warning string or None.
        Boundary: strictly greater than threshold (> 35, not >= 35).
        """
        today = date.today()
        stale_docs = []

        for chunk in chunks:
            if not chunk.last_verified_date:
                continue
            try:
                verified = date.fromisoformat(chunk.last_verified_date)
                age_days = (today - verified).days
                if age_days > CONFIG_SNAPSHOT_STALENESS_INJECT:
                    stale_docs.append(
                        f"{chunk.document_id} (last verified {age_days} days ago)"
                    )
            except ValueError:
                continue

        if stale_docs:
            return (
                f"Note: The following documentation may be outdated: {', '.join(stale_docs[:3])}. "
                f"Verify current SAP settings before applying these steps."
            )
        return None

    # ============================================================
    # GENERATION AND STREAMING
    # ============================================================

    async def generate_and_stream(
        self,
        enriched_query: EnrichedQuery,
        retrieval_result: RetrievalResult,
        session: SessionState,
        diagnostic_obj: Optional[dict],
        session_id: str,
    ) -> str:
        """
        Assemble prompt, stream generation, publish tokens to Redis Pub/Sub.
        Returns the complete answer text for downstream validation.

        Publish order:
          1. publish_token(session_id, token) — for each streamed token
          2. publish_stream_complete(session_id) — once all tokens delivered
        """
        from app.infrastructure.redis_client import redis_session

        # Determine tier
        tier = select_model_tier(enriched_query, retrieval_result, bool(diagnostic_obj))

        # Assemble prompt
        prompt = self.assemble_prompt(
            enriched_query, retrieval_result, session, diagnostic_obj
        )

        logger.info(
            f"Generation: tier={tier}, mode={enriched_query.retrieval_mode}, "
            f"classification={enriched_query.classification}, session={session_id}"
        )

        answer_parts = []
        token_count = 0

        try:
            async for token in model_gateway.generate_streaming(prompt, tier, session_id):
                answer_parts.append(token)
                token_count += 1
                # Publish each token to Redis Pub/Sub for WebSocket delivery
                await redis_session.publish_token(session_id, token)

            # Signal generation complete
            await redis_session.publish_stream_complete(session_id)
            full_answer = "".join(answer_parts).strip()
            logger.info(
                f"Generation complete: {token_count} tokens, "
                f"{len(full_answer)} chars, tier={tier}"
            )
            return full_answer

        except Exception as e:
            logger.error(f"Generation failed for session {session_id}: {e}")
            error_msg = (
                "I encountered a technical issue generating the response. "
                "Please try again or contact IT support."
            )
            await redis_session.publish_token(session_id, error_msg)
            await redis_session.publish_stream_complete(session_id)
            return error_msg


# Singleton
reasoning_service = ReasoningService()
