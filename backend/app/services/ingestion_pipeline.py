"""
AEGIS Document Ingestion Pipeline
11-stage pipeline that processes uploaded SAP knowledge documents.

Input: .docx or .pdf file following AEGIS_DOCUMENT_TEMPLATES.md format
Output: Indexed chunks in Qdrant + OpenSearch + PostgreSQL, original file in MinIO

One ingestion run = one complete document. Re-ingesting an existing document_id
deletes all previous data for that document before creating new entries.

MinIO persistence (AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 4) runs immediately
after Stage 4 succeeds, not "before Stage 2" as that amendment's text literally
says — document_id (needed for the object key) isn't known until Stage 4
determines it from the parsed template fields; Stage 2 is content extraction,
not field detection. Still fatal/blocking as the amendment intends (a document
that can't be durably stored doesn't get chunked/indexed), just at the earliest
point where document_id genuinely exists. Uses this pipeline's own
IngestionResult-return convention for failure, not a raised exception, matching
every other stage in this file.
"""
import re
import os
import uuid
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
from datetime import datetime

import asyncpg
import httpx

from app.config import (
    BGE_SERVICE_URL,
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    EMBEDDING_DIMENSION, EMBEDDING_MODEL_VERSION,
    MAX_CHUNK_TOKENS, CHUNK_OVERLAP_TOKENS, MIN_PDF_TEXT_LENGTH,
    ALLOWED_MODULES, COMPANY_NAME,
    MINIO_BUCKET_DOCUMENTS,
)
from app.infrastructure.minio_client import minio_client

logger = logging.getLogger(__name__)

# ============================================================
# TEMPLATE FIELD PATTERNS
# ============================================================

# Field label: LINE starting with UPPERCASE_LABEL:
FIELD_LABEL_PATTERN = re.compile(r'^([A-Z][A-Z0-9_]{2,35}):\s*(.*)')
# Section separator: 20+ equals or dash characters
SECTION_SEPARATOR_PATTERN = re.compile(r'^[=\-]{20,}\s*$')
# Cause block separator within error_guide
CAUSE_SEPARATOR_PATTERN = re.compile(r'^={20,}\s*$')
# Phase separator within procedure
PHASE_SEPARATOR_PATTERN = re.compile(r'^={20,}\s*$')
# Document ID validation — module set is configurable (AMENDMENT_GENERALIZATION_BACKEND.md
# FILE 2), not hardcoded, so a non-standard SAP module set works via AEGIS_SAP_MODULES.
DOCUMENT_ID_PATTERN = re.compile(
    rf'^({"|".join(ALLOWED_MODULES)})-(ERR|PROC|CFG)-\d{{3}}$'
)

ALLOWED_CONTENT_TYPES = {'error_guide', 'procedure', 'config'}
ALLOWED_CHANGE_FREQUENCIES = {'rare', 'monthly', 'quarterly', 'annual', 'as-needed'}

DOCUMENT_MIME_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


@dataclass
class DocumentChunk:
    """A semantic chunk ready for embedding and storage."""
    chunk_id: str           # {document_id}:chunk:{index}
    document_id: str
    content_type: str
    module: str
    chunk_type: str         # header|cause_resolution|outcome|procedure_header|procedure_steps|config_overview|config_values|config_navigation
    chunk_text: str
    chunk_index: int
    total_chunks: int       # Will be updated after all chunks created
    error_code: Optional[str] = None
    configuration_name: Optional[str] = None
    procedure_name: Optional[str] = None
    cause_number: Optional[int] = None
    phase_name: Optional[str] = None
    step_range: Optional[str] = None
    transactions: List[str] = field(default_factory=list)
    last_verified_date: str = ""
    verified_by: str = ""
    # Computed after embedding
    content_vector: Optional[List[float]] = None
    identity_vector: Optional[List[float]] = None


@dataclass
class IngestionResult:
    """Result of a complete ingestion run."""
    document_id: str
    status: str             # 'active' | 'failed'
    stage_failed: Optional[str] = None
    chunk_count: int = 0
    error_message: Optional[str] = None


class IngestionPipeline:
    """
    Orchestrates the 11-stage document ingestion pipeline.
    """

    async def ingest(
        self, file_path: str, file_type: str, original_filename: Optional[str] = None
    ) -> IngestionResult:
        """
        Main entry point. Runs all 11 stages for one document.
        Returns IngestionResult with status and chunk count.

        original_filename: the client's uploaded filename, used to build the
        MinIO object key. Falls back to the saved file's basename if the
        caller doesn't have the original (e.g. re-ingesting from disk).
        """
        logger.info(f"Ingestion started: {file_path} ({file_type})")
        fields: Dict[str, str] = {}

        try:
            # Stage 1: Magic bytes validation (already done by upload handler, double-check)
            if not await self._stage1_validate_format(file_path, file_type):
                return IngestionResult("unknown", "failed", "stage_1_format_validation",
                                      error_message="File format validation failed")

            # Stage 2: Content extraction
            raw_text = await self._stage2_extract_content(file_path, file_type)
            if not raw_text:
                return IngestionResult("unknown", "failed", "stage_2_extraction",
                                      error_message="Could not extract text from file")

            # Stage 3: Field detection
            fields = self._stage3_detect_fields(raw_text)

            # Stage 4: Schema validation
            validation_errors = self._stage4_validate_schema(fields)
            if validation_errors:
                return IngestionResult("unknown", "failed", "stage_4_schema_validation",
                                      error_message="; ".join(validation_errors))

            document_id = fields["DOCUMENT_ID"]
            content_type = fields["CONTENT_TYPE"]

            # MinIO persist (AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 4) — document_id is
            # now known. Fatal: a document that can't be durably stored doesn't proceed.
            minio_object_key = await self._persist_to_minio(
                file_path, file_type, document_id, original_filename
            )
            if minio_object_key is None:
                return IngestionResult(document_id, "failed", "minio_persist",
                                      error_message="Could not durably store the uploaded document; ingestion aborted.")

            # Stage 5: Content validation
            content_errors = self._stage5_validate_content(fields)
            if content_errors:
                return IngestionResult(document_id, "failed", "stage_5_content_validation",
                                      error_message="; ".join(content_errors))

            # Stage 6: Chunking
            chunks = self._stage6_chunk_document(fields, raw_text)
            if not chunks:
                return IngestionResult(document_id, "failed", "stage_6_chunking",
                                      error_message="No chunks produced from document")

            # Update total_chunks for all chunks
            total = len(chunks)
            for chunk in chunks:
                chunk.total_chunks = total

            # Stage 7: Embedding
            chunks = await self._stage7_embed_chunks(chunks)

            # Stage 8: Qdrant ingestion
            await self._stage8_qdrant_ingest(chunks, document_id)

            # Stage 9: OpenSearch indexing
            await self._stage9_opensearch_index(chunks, document_id)

            # Stage 11 runs before Stage 10 (deliberately reordered): Stage 10's
            # KG edge inserts have a from_document_id foreign key against
            # documents_registry — the row for THIS document doesn't exist until
            # Stage 11 creates it. Running 10 before 11 (as originally ordered)
            # meant no document could ever create an edge on its own first
            # ingestion. Nothing in Stage 11 depends on Stage 10's output, so
            # this reorder is safe.
            await self._stage11_registry_update(fields, document_id, len(chunks), minio_object_key)

            # Stage 10: Knowledge Graph edges
            await self._stage10_knowledge_graph(fields, document_id)

            logger.info(f"Ingestion complete: {document_id}, {len(chunks)} chunks")
            return IngestionResult(document_id, "active", chunk_count=len(chunks))

        except Exception as e:
            logger.error(f"Ingestion pipeline failed: {e}")
            doc_id = fields.get("DOCUMENT_ID", "unknown")
            return IngestionResult(doc_id, "failed", "unknown",
                                  error_message=str(e)[:200])

    # ============================================================
    # STAGE 1: FORMAT VALIDATION
    # ============================================================

    async def _stage1_validate_format(self, file_path: str, file_type: str) -> bool:
        """Verify file exists and has expected format."""
        if not os.path.exists(file_path):
            logger.error(f"Stage 1: file not found: {file_path}")
            return False
        if file_type not in {"docx", "pdf"}:
            logger.error(f"Stage 1: unsupported file type: {file_type}")
            return False
        return True

    # ============================================================
    # STAGE 2: CONTENT EXTRACTION
    # ============================================================

    async def _stage2_extract_content(self, file_path: str, file_type: str) -> Optional[str]:
        """Extract plain text from DOCX or PDF file."""
        try:
            if file_type == "docx":
                return self._extract_docx(file_path)
            elif file_type == "pdf":
                return self._extract_pdf(file_path)
        except Exception as e:
            logger.error(f"Stage 2 extraction failed: {e}")
        return None

    def _extract_docx(self, file_path: str) -> Optional[str]:
        """Extract text from DOCX using python-docx."""
        from docx import Document
        doc = Document(file_path)
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        text = "\n".join(paragraphs)
        if len(text.strip()) < MIN_PDF_TEXT_LENGTH:
            logger.warning(f"DOCX extracted very little text ({len(text)} chars)")
            return None
        return text

    def _extract_pdf(self, file_path: str) -> Optional[str]:
        """Extract text from PDF using pdfplumber."""
        import pdfplumber
        all_text = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    all_text.append(page_text)
        text = "\n".join(all_text)
        if len(text.strip()) < MIN_PDF_TEXT_LENGTH:
            logger.warning(f"PDF extracted only {len(text)} chars — may be scanned/image-based")
            return None
        return text

    # ============================================================
    # STAGE 3: FIELD DETECTION
    # ============================================================

    def _stage3_detect_fields(self, text: str) -> Dict[str, str]:
        """
        Parse template field labels from extracted text.
        Fields are detected as lines starting with UPPERCASE_LABEL:
        Multi-line values accumulate until the next field label or separator.
        """
        fields: Dict[str, str] = {}
        current_field = None
        current_value_lines = []

        for line in text.splitlines():
            stripped = line.strip()

            # Section separator — save current field, reset.
            # Exception: a separator immediately after a label with no
            # accumulated content yet is the OPENING separator of the
            # "===\nLABEL:\n===\n\ncontent" wrapper convention used for
            # long/critical fields (e.g. CURRENT_PRODUCTION_VALUES) —
            # not a terminator. Closing here would silently discard the
            # actual content that follows it.
            if SECTION_SEPARATOR_PATTERN.match(stripped):
                if current_field and current_value_lines:
                    fields[current_field] = "\n".join(current_value_lines).strip()
                    current_field = None
                    current_value_lines = []
                continue

            # Check for field label
            match = FIELD_LABEL_PATTERN.match(stripped)
            if match:
                # Save previous field
                if current_field:
                    fields[current_field] = "\n".join(current_value_lines).strip()

                current_field = match.group(1)
                inline_value = match.group(2).strip()
                current_value_lines = [inline_value] if inline_value else []
            else:
                # Continuation line for current field
                if current_field and stripped:
                    current_value_lines.append(stripped)

        # Save last field
        if current_field:
            fields[current_field] = "\n".join(current_value_lines).strip()

        logger.debug(f"Stage 3: detected {len(fields)} fields: {list(fields.keys())[:10]}")
        return fields

    # ============================================================
    # STAGE 4: SCHEMA VALIDATION
    # ============================================================

    def _stage4_validate_schema(self, fields: Dict[str, str]) -> List[str]:
        """Validate that required fields are present and DOCUMENT_ID has correct format."""
        errors = []

        required_always = ["DOCUMENT_ID", "CONTENT_TYPE", "MODULE",
                           "LAST_VERIFIED_DATE", "VERIFIED_BY"]
        for f in required_always:
            if not fields.get(f):
                errors.append(f"Missing required field: {f}")

        if "DOCUMENT_ID" in fields:
            doc_id = fields["DOCUMENT_ID"].strip()
            if not DOCUMENT_ID_PATTERN.match(doc_id):
                errors.append(
                    f"DOCUMENT_ID '{doc_id}' does not match required format "
                    f"MODULE-(ERR|PROC|CFG)-NNN (e.g. SD-ERR-001)"
                )

        if "LAST_VERIFIED_DATE" in fields:
            date_str = fields["LAST_VERIFIED_DATE"].strip()
            try:
                from datetime import date
                date.fromisoformat(date_str)
            except ValueError:
                errors.append(f"LAST_VERIFIED_DATE '{date_str}' must be YYYY-MM-DD format")

        # Content-type specific required fields
        content_type = fields.get("CONTENT_TYPE", "").strip()
        if content_type == "error_guide":
            for f in ["ERROR_CODE", "TRANSACTIONS", "WHEN_THIS_OCCURS",
                       "SUCCESS_INDICATOR", "ESCALATION_CRITERIA"]:
                if not fields.get(f):
                    errors.append(f"error_guide requires field: {f}")
            # Must have at least CAUSE_1
            if not fields.get("CAUSE_1"):
                errors.append("error_guide requires at least one CAUSE_1 block")

        elif content_type == "procedure":
            for f in ["PROCEDURE_NAME", "PURPOSE", "TRANSACTIONS", "VERIFICATION_STEPS"]:
                if not fields.get(f):
                    errors.append(f"procedure requires field: {f}")

        elif content_type == "config":
            for f in ["CONFIGURATION_NAME", "WHAT_THIS_CONTROLS",
                       "NAVIGATION", "CURRENT_PRODUCTION_VALUES", "CHANGE_PROCESS"]:
                if not fields.get(f):
                    errors.append(f"config requires field: {f}")
            # Reject placeholder values
            current_values = fields.get("CURRENT_PRODUCTION_VALUES", "")
            if "[PLACEHOLDER]" in current_values or not current_values.strip():
                errors.append(
                    f"CURRENT_PRODUCTION_VALUES must contain actual {COMPANY_NAME} "
                    f"configuration values, not placeholders"
                )

        return errors

    # ============================================================
    # STAGE 5: CONTENT VALIDATION
    # ============================================================

    def _stage5_validate_content(self, fields: Dict[str, str]) -> List[str]:
        """Validate field values against allowed enums and cross-field logic."""
        errors = []

        content_type = fields.get("CONTENT_TYPE", "").strip()
        if content_type not in ALLOWED_CONTENT_TYPES:
            errors.append(
                f"CONTENT_TYPE must be one of: {', '.join(ALLOWED_CONTENT_TYPES)}. "
                f"Got: '{content_type}'"
            )

        module = fields.get("MODULE", "").strip()
        if module not in ALLOWED_MODULES:
            errors.append(f"MODULE must be one of: {', '.join(ALLOWED_MODULES)}. Got: '{module}'")

        if "CHANGE_FREQUENCY" in fields:
            freq = fields["CHANGE_FREQUENCY"].strip()
            if freq not in ALLOWED_CHANGE_FREQUENCIES:
                errors.append(
                    f"CHANGE_FREQUENCY must be one of: {', '.join(ALLOWED_CHANGE_FREQUENCIES)}"
                )

        # Validate document_id prefix matches content_type
        doc_id = fields.get("DOCUMENT_ID", "")
        if doc_id:
            type_suffix = doc_id.split("-")[1] if "-" in doc_id else ""
            expected_suffix = {"error_guide": "ERR", "procedure": "PROC", "config": "CFG"}
            expected = expected_suffix.get(content_type)
            if expected and type_suffix != expected:
                errors.append(
                    f"DOCUMENT_ID suffix '{type_suffix}' does not match "
                    f"CONTENT_TYPE '{content_type}' (expected '{expected}')"
                )

        return errors

    # ============================================================
    # MINIO PERSISTENCE (AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 4)
    # Runs after Stage 4 (document_id known), before Stage 5.
    # ============================================================

    async def _persist_to_minio(
        self, file_path: str, file_type: str, document_id: str, original_filename: Optional[str]
    ) -> Optional[str]:
        """
        Persist the original uploaded file to MinIO before any further
        processing. Returns the object_key on success, None on failure
        (caller treats None as fatal — a document that can't be durably
        stored should not proceed to be chunked and indexed).
        """
        filename = original_filename or os.path.basename(file_path)
        object_key = f"{document_id}/{filename}"

        try:
            with open(file_path, "rb") as f:
                file_bytes = f.read()

            # Clears any prior object for this document_id on reingestion
            await minio_client.delete_prefix(bucket=MINIO_BUCKET_DOCUMENTS, prefix=f"{document_id}/")

            await minio_client.put_object(
                bucket=MINIO_BUCKET_DOCUMENTS,
                object_key=object_key,
                data=file_bytes,
                content_type=DOCUMENT_MIME_TYPES.get(file_type, "application/octet-stream"),
            )
            return object_key
        except Exception as e:
            logger.error(f"Failed to persist document to MinIO before ingestion: {e}")
            return None

    # ============================================================
    # STAGE 6: CHUNKING
    # ============================================================

    def _stage6_chunk_document(
        self, fields: Dict[str, str], raw_text: str
    ) -> List[DocumentChunk]:
        """
        Split document into semantic chunks based on content_type.
        Returns list of DocumentChunk objects ready for embedding.
        """
        document_id = fields["DOCUMENT_ID"].strip()
        content_type = fields["CONTENT_TYPE"].strip()
        module = fields["MODULE"].strip()
        transactions = [t.strip() for t in fields.get("TRANSACTIONS", "").split(",") if t.strip()]
        last_verified_date = fields.get("LAST_VERIFIED_DATE", "").strip()
        verified_by = fields.get("VERIFIED_BY", "").strip()

        common = dict(
            document_id=document_id, content_type=content_type, module=module,
            transactions=transactions, last_verified_date=last_verified_date,
            verified_by=verified_by, total_chunks=0,  # Updated later
        )

        if content_type == "error_guide":
            return self._chunk_error_guide(fields, common)
        elif content_type == "procedure":
            return self._chunk_procedure(fields, raw_text, common)
        elif content_type == "config":
            return self._chunk_config(fields, common)
        else:
            logger.error(f"Unknown content_type: {content_type}")
            return []

    def _chunk_error_guide(self, fields: Dict, common: Dict) -> List[DocumentChunk]:
        """
        Chunking for error_guide:
        - 1 header chunk: all metadata + WHEN_THIS_OCCURS + SUCCESS_INDICATOR + ESCALATION_CRITERIA
        - N cause chunks: one per CAUSE_N block
        - 1 outcome chunk: related errors, admin steps (if present)
        """
        chunks = []
        doc_id = common["document_id"]
        error_code = fields.get("ERROR_CODE", "").strip()

        # Chunk 0: Header
        header_text = (
            f"Error Code: {error_code}\n"
            f"Module: {common['module']}\n"
            f"Transactions: {', '.join(common['transactions'])}\n\n"
            f"When This Occurs:\n{fields.get('WHEN_THIS_OCCURS', '')}\n\n"
            f"Success Indicator:\n{fields.get('SUCCESS_INDICATOR', '')}\n\n"
            f"Escalation Criteria:\n{fields.get('ESCALATION_CRITERIA', '')}"
        )
        chunks.append(DocumentChunk(
            chunk_id=f"{doc_id}:chunk:0", chunk_index=0,
            chunk_type="header", chunk_text=header_text,
            error_code=error_code, **common,
        ))

        # Cause chunks
        cause_num = 1
        while True:
            cause_key = f"CAUSE_{cause_num}"
            identify_key = f"CAUSE_{cause_num}_HOW_TO_IDENTIFY"
            resolution_key = f"CAUSE_{cause_num}_RESOLUTION_STEPS"

            cause_name = fields.get(cause_key, "").strip()
            if not cause_name:
                break

            cause_text = (
                f"Error Code: {error_code}\n"
                f"Cause {cause_num}: {cause_name}\n\n"
                f"How to Identify:\n{fields.get(identify_key, '')}\n\n"
                f"Resolution Steps:\n{fields.get(resolution_key, '')}"
            )
            related_config = fields.get(f"CAUSE_{cause_num}_RELATED_CONFIG", "")
            if related_config:
                cause_text += f"\n\nRelated Configuration: {related_config}"

            chunks.append(DocumentChunk(
                chunk_id=f"{doc_id}:chunk:{cause_num}", chunk_index=cause_num,
                chunk_type="cause_resolution", chunk_text=cause_text,
                cause_number=cause_num, error_code=error_code, **common,
            ))
            cause_num += 1

        # Outcome chunk (related errors, admin steps)
        idx = cause_num
        outcome_parts = []
        if fields.get("ADMIN_STEPS"):
            outcome_parts.append(f"Admin Steps:\n{fields['ADMIN_STEPS']}")
        if fields.get("RELATED_ERRORS"):
            outcome_parts.append(f"Related Errors: {fields['RELATED_ERRORS']}")
        if outcome_parts:
            chunks.append(DocumentChunk(
                chunk_id=f"{doc_id}:chunk:{idx}", chunk_index=idx,
                chunk_type="outcome", chunk_text="\n\n".join(outcome_parts),
                error_code=error_code, **common,
            ))

        return chunks

    def _chunk_procedure(self, fields: Dict, raw_text: str, common: Dict) -> List[DocumentChunk]:
        """
        Chunking for procedure:
        - 1 procedure_header chunk: metadata + PURPOSE + WHEN_TO_USE + PREREQUISITES + VERIFICATION_STEPS
        - N procedure_steps chunks: one per PHASE_NAME section
        """
        chunks = []
        doc_id = common["document_id"]
        procedure_name = fields.get("PROCEDURE_NAME", "").strip()

        # Chunk 0: Procedure Header
        header_text = (
            f"Procedure: {procedure_name}\n"
            f"Module: {common['module']}\n"
            f"Transactions: {', '.join(common['transactions'])}\n\n"
            f"Purpose:\n{fields.get('PURPOSE', '')}\n\n"
            f"When to Use:\n{fields.get('WHEN_TO_USE', '')}\n\n"
            f"Prerequisites:\n{fields.get('PREREQUISITES', '')}\n\n"
            f"Verification Steps:\n{fields.get('VERIFICATION_STEPS', '')}"
        )
        chunks.append(DocumentChunk(
            chunk_id=f"{doc_id}:chunk:0", chunk_index=0,
            chunk_type="procedure_header", chunk_text=header_text,
            procedure_name=procedure_name, **common,
        ))

        # Detect phases from raw text
        phases = self._extract_procedure_phases(raw_text, fields)

        for phase_idx, (phase_name, steps_text) in enumerate(phases):
            idx = phase_idx + 1
            phase_text = (
                f"Procedure: {procedure_name}\n"
                f"Phase: {phase_name}\n\n"
                f"{steps_text}"
            )
            chunks.append(DocumentChunk(
                chunk_id=f"{doc_id}:chunk:{idx}", chunk_index=idx,
                chunk_type="procedure_steps", chunk_text=phase_text,
                phase_name=phase_name, procedure_name=procedure_name, **common,
            ))

        return chunks

    def _extract_procedure_phases(
        self, raw_text: str, fields: Dict
    ) -> List[Tuple[str, str]]:
        """
        Extract phase blocks from procedure text.
        Returns list of (phase_name, steps_text) tuples.
        """
        phases = []
        lines = raw_text.splitlines()
        current_phase_name = None
        current_phase_lines = []
        in_phase = False

        for i, line in enumerate(lines):
            stripped = line.strip()

            # Phase start: PHASE_NAME: value
            if stripped.startswith("PHASE_NAME:"):
                if current_phase_name and current_phase_lines:
                    phases.append((current_phase_name, "\n".join(current_phase_lines).strip()))
                current_phase_name = stripped[len("PHASE_NAME:"):].strip()
                current_phase_lines = []
                in_phase = True
                continue

            # Section separator — may be before PHASE_NAME
            if SECTION_SEPARATOR_PATTERN.match(stripped):
                continue

            if in_phase and stripped:
                # Collect step lines
                if re.match(r'^STEP_\d+:', stripped) or stripped.startswith("STEP_"):
                    current_phase_lines.append(stripped)
                elif stripped.startswith(("VERIFICATION_STEPS:", "COMMON_ERRORS_IN_THIS_PROCEDURE:",
                                          "POST_COMPLETION_NOTES:", "LAST_VERIFIED_DATE:",
                                          "VERIFIED_BY:")):
                    # End of phase content
                    if current_phase_name and current_phase_lines:
                        phases.append((current_phase_name, "\n".join(current_phase_lines).strip()))
                    current_phase_name = None
                    current_phase_lines = []
                    in_phase = False
                elif current_phase_name:
                    current_phase_lines.append(stripped)

        if current_phase_name and current_phase_lines:
            phases.append((current_phase_name, "\n".join(current_phase_lines).strip()))

        return phases

    def _chunk_config(self, fields: Dict, common: Dict) -> List[DocumentChunk]:
        """
        Chunking for config:
        - config_overview chunk: CONFIGURATION_NAME, WHAT_THIS_CONTROLS, CHANGE_FREQUENCY
        - config_values chunk: CURRENT_PRODUCTION_VALUES (NEVER SPLIT regardless of length)
        - config_navigation chunk: NAVIGATION, CHANGE_PROCESS
        """
        chunks = []
        doc_id = common["document_id"]
        config_name = fields.get("CONFIGURATION_NAME", "").strip()

        # Chunk 0: Config Overview
        overview_text = (
            f"Configuration: {config_name}\n"
            f"Module: {common['module']}\n"
            f"Change Frequency: {fields.get('CHANGE_FREQUENCY', '')}\n\n"
            f"What This Controls:\n{fields.get('WHAT_THIS_CONTROLS', '')}"
        )
        chunks.append(DocumentChunk(
            chunk_id=f"{doc_id}:chunk:0", chunk_index=0,
            chunk_type="config_overview", chunk_text=overview_text,
            configuration_name=config_name, **common,
        ))

        # Chunk 1: Current Values (NEVER SPLIT — even if long)
        values_text = (
            f"Configuration: {config_name}\n"
            f"Module: {common['module']}\n"
            f"Current Production Values:\n\n"
            f"{fields.get('CURRENT_PRODUCTION_VALUES', '')}"
        )
        chunks.append(DocumentChunk(
            chunk_id=f"{doc_id}:chunk:1", chunk_index=1,
            chunk_type="config_values", chunk_text=values_text,
            configuration_name=config_name, **common,
        ))

        # Chunk 2: Navigation and Change Process
        nav_text = (
            f"Configuration: {config_name}\n"
            f"Navigation Path:\n{fields.get('NAVIGATION', '')}\n\n"
            f"Change Process:\n{fields.get('CHANGE_PROCESS', '')}"
        )
        if fields.get("RELATED_ERRORS"):
            nav_text += f"\n\nRelated Errors: {fields['RELATED_ERRORS']}"
        chunks.append(DocumentChunk(
            chunk_id=f"{doc_id}:chunk:2", chunk_index=2,
            chunk_type="config_navigation", chunk_text=nav_text,
            configuration_name=config_name, **common,
        ))

        return chunks

    # ============================================================
    # STAGE 7: EMBEDDING
    # ============================================================

    async def _stage7_embed_chunks(
        self, chunks: List[DocumentChunk]
    ) -> List[DocumentChunk]:
        """
        Embed each chunk with BGE-base-en-v1.5.
        Content vector: embedding of chunk_text
        Identity vector: embedding of the document's entity identity string
        """
        async with httpx.AsyncClient(timeout=60) as client:
            # Build all texts to embed (content + identity per chunk)
            content_texts = [c.chunk_text[:1000] for c in chunks]

            identity_texts = []
            for chunk in chunks:
                identity = self._build_identity_string(chunk)
                identity_texts.append(identity)

            # Batch embed content vectors
            content_resp = await client.post(
                f"{BGE_SERVICE_URL}/embed",
                json={"texts": content_texts},
            )
            content_resp.raise_for_status()
            content_embeddings = content_resp.json()["embeddings"]

            # Batch embed identity vectors
            identity_resp = await client.post(
                f"{BGE_SERVICE_URL}/embed",
                json={"texts": identity_texts},
            )
            identity_resp.raise_for_status()
            identity_embeddings = identity_resp.json()["embeddings"]

        for chunk, content_vec, identity_vec in zip(chunks, content_embeddings, identity_embeddings):
            chunk.content_vector = content_vec
            chunk.identity_vector = identity_vec

        logger.debug(f"Stage 7: embedded {len(chunks)} chunks (dim={EMBEDDING_DIMENSION})")
        return chunks

    def _build_identity_string(self, chunk: DocumentChunk) -> str:
        """Build the identity string used for the 'identity' named vector."""
        if chunk.error_code:
            return f"{chunk.error_code} SAP error {chunk.module} module resolution"
        elif chunk.procedure_name:
            return f"{chunk.procedure_name} SAP procedure {chunk.module} module steps"
        elif chunk.configuration_name:
            return f"{chunk.configuration_name} SAP configuration {chunk.module} current values"
        return chunk.chunk_text[:200]

    # ============================================================
    # STAGE 8: QDRANT INGESTION
    # ============================================================

    async def _stage8_qdrant_ingest(
        self, chunks: List[DocumentChunk], document_id: str
    ) -> None:
        """Upsert all chunks to the appropriate Qdrant collection."""
        from app.infrastructure.qdrant_client import qdrant_client

        # Determine collection
        if "-ERR-" in document_id:
            from app.config import QDRANT_COLLECTION_ERRORS as collection
        elif "-PROC-" in document_id:
            from app.config import QDRANT_COLLECTION_PROCEDURES as collection
        elif "-CFG-" in document_id:
            from app.config import QDRANT_COLLECTION_CONFIGS as collection
        else:
            raise ValueError(f"Cannot determine collection for document_id: {document_id}")

        # Delete existing chunks for this document (re-ingestion)
        await qdrant_client.delete_by_document_id(collection, document_id)

        # Upsert new chunks
        for chunk in chunks:
            payload = {
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "content_type": chunk.content_type,
                "module": chunk.module,
                "chunk_type": chunk.chunk_type,
                "chunk_index": chunk.chunk_index,
                "total_chunks": chunk.total_chunks,
                "transactions": chunk.transactions,
                "last_verified_date": chunk.last_verified_date,
                "verified_by": chunk.verified_by,
                "chunk_text": chunk.chunk_text,
                "embedding_model_version": EMBEDDING_MODEL_VERSION,
            }
            if chunk.error_code:
                payload["error_code"] = chunk.error_code
            if chunk.configuration_name:
                payload["configuration_name"] = chunk.configuration_name
            if chunk.procedure_name:
                payload["procedure_name"] = chunk.procedure_name
            if chunk.cause_number is not None:
                payload["cause_number"] = chunk.cause_number
            if chunk.phase_name:
                payload["phase_name"] = chunk.phase_name

            await qdrant_client.upsert_point(
                collection_name=collection,
                point_id=str(uuid.uuid4()),
                content_vector=chunk.content_vector,
                identity_vector=chunk.identity_vector,
                payload=payload,
            )

        logger.debug(f"Stage 8: {len(chunks)} chunks upserted to Qdrant {collection}")

    # ============================================================
    # STAGE 9: OPENSEARCH INDEXING
    # ============================================================

    async def _stage9_opensearch_index(
        self, chunks: List[DocumentChunk], document_id: str
    ) -> None:
        """Index all chunks in OpenSearch. Entity boosting applied by opensearch_client."""
        from app.infrastructure.opensearch_client import opensearch_client

        # Delete existing chunks
        await opensearch_client.delete_by_document_id(document_id)

        for chunk in chunks:
            doc = {
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "content_type": chunk.content_type,
                "module": chunk.module,
                "chunk_type": chunk.chunk_type,
                "transactions": chunk.transactions,
                "last_verified_date": chunk.last_verified_date,
                "verified_by": chunk.verified_by,
                "chunk_text": chunk.chunk_text,
                "embedding_model_version": EMBEDDING_MODEL_VERSION,
            }
            if chunk.error_code:
                doc["error_code"] = chunk.error_code
            if chunk.configuration_name:
                doc["configuration_name"] = chunk.configuration_name
            if chunk.procedure_name:
                doc["procedure_name"] = chunk.procedure_name

            await opensearch_client.index_document(chunk.chunk_id, doc)

        logger.debug(f"Stage 9: {len(chunks)} chunks indexed in OpenSearch")

    # ============================================================
    # STAGE 10: KNOWLEDGE GRAPH EDGES
    # ============================================================

    async def _stage10_knowledge_graph(
        self, fields: Dict, document_id: str
    ) -> None:
        """
        Create document_relationships entries from template cross-references.
        RELATED_ERRORS and COMMON_ERRORS_IN_THIS_PROCEDURE fields create edges.
        """
        related_ids = []

        related_str = fields.get("RELATED_ERRORS", "")
        if related_str:
            related_ids.extend([r.strip() for r in related_str.split(",") if r.strip()])

        common_str = fields.get("COMMON_ERRORS_IN_THIS_PROCEDURE", "")
        if common_str:
            related_ids.extend([r.strip() for r in common_str.split(",") if r.strip()])

        if not related_ids:
            return

        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
                statement_cache_size=0,
            )
            try:
                for rel_id in related_ids:
                    if not DOCUMENT_ID_PATTERN.match(rel_id):
                        continue
                    content_type = fields.get("CONTENT_TYPE", "error_guide")
                    rel_type = (
                        "common_in_procedure" if content_type == "procedure"
                        else "related_to"
                    )
                    await conn.execute(
                        """
                        INSERT INTO document_relationships (from_document_id, to_document_id, relationship_type)
                        VALUES ($1, $2, $3)
                        ON CONFLICT DO NOTHING
                        """,
                        document_id, rel_id, rel_type,
                    )
            finally:
                await conn.close()
        except Exception as e:
            logger.warning(f"Stage 10: KG edge creation failed (non-blocking): {e}")

    # ============================================================
    # STAGE 11: DOCUMENTS REGISTRY UPDATE
    # ============================================================

    async def _stage11_registry_update(
        self, fields: Dict, document_id: str, chunk_count: int, minio_object_key: Optional[str] = None
    ) -> None:
        """Update documents_registry with final status, chunk count, and MinIO object key."""
        transactions = [t.strip() for t in fields.get("TRANSACTIONS", "").split(",") if t.strip()]

        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
                statement_cache_size=0,
            )
            try:
                from datetime import date
                await conn.execute(
                    """
                    INSERT INTO documents_registry
                        (document_id, content_type, module, transactions,
                         last_verified_date, verified_by, chunk_count, status, minio_object_key)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
                    ON CONFLICT (document_id) DO UPDATE
                      SET content_type = EXCLUDED.content_type,
                          module = EXCLUDED.module,
                          transactions = EXCLUDED.transactions,
                          last_verified_date = EXCLUDED.last_verified_date,
                          verified_by = EXCLUDED.verified_by,
                          chunk_count = EXCLUDED.chunk_count,
                          status = 'active',
                          minio_object_key = EXCLUDED.minio_object_key,
                          ingested_at = NOW()
                    """,
                    document_id,
                    fields["CONTENT_TYPE"].strip(),
                    fields["MODULE"].strip(),
                    transactions,
                    date.fromisoformat(fields["LAST_VERIFIED_DATE"].strip()),
                    fields["VERIFIED_BY"].strip(),
                    chunk_count,
                    minio_object_key,
                )
            finally:
                await conn.close()
            logger.info(f"Stage 11: documents_registry updated for {document_id} (chunks={chunk_count})")
        except Exception as e:
            logger.error(f"Stage 11: registry update failed: {e}")
            raise


# Singleton
ingestion_pipeline = IngestionPipeline()
