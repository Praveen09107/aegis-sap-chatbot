"""Unit tests for the Ingestion Pipeline field detection and chunking."""
import pytest
from app.services.ingestion_pipeline import IngestionPipeline, DOCUMENT_ID_PATTERN


@pytest.fixture
def pipeline():
    return IngestionPipeline()


SAMPLE_ERROR_GUIDE = """DOCUMENT_ID: SD-ERR-001
CONTENT_TYPE: error_guide
MODULE: SD
ERROR_CODE: VL150
TRANSACTIONS: VL01N, MMBE, MB52
WHEN_THIS_OCCURS:
This error appears when creating an outbound delivery and stock is insufficient.

================================================================================
CAUSE_1: Safety Stock Too High
================================================================================

CAUSE_1_HOW_TO_IDENTIFY:
Check MM02 MRP 2 tab Safety Stock field.

CAUSE_1_RESOLUTION_STEPS:
1. Go to MM02.
2. Reduce Safety Stock value.
3. Save and retry VL01N.

================================================================================
SUCCESS_INDICATOR:
Delivery document created successfully.

ESCALATION_CRITERIA:
- Safety stock already 0 and error persists

LAST_VERIFIED_DATE: 2024-03-28
VERIFIED_BY: Rsuresh1"""

SAMPLE_PROCEDURE = """DOCUMENT_ID: SD-PROC-001
CONTENT_TYPE: procedure
MODULE: SD
PROCEDURE_NAME: Scheduling Agreement Creation YDSA
PURPOSE: Creates export scheduling agreement.
WHEN_TO_USE: When overseas customer needs scheduled deliveries.
PREREQUISITES: Customer master must exist.
TRANSACTIONS: VA31, VA32

================================================================================
PHASE_NAME: Phase 1 — Initial Setup
================================================================================

STEP_1: Navigate to VA31.
STEP_2: Enter order type YDSA.
STEP_3: Enter customer number.

================================================================================
PHASE_NAME: Phase 2 — Scheduling Lines
================================================================================

STEP_4: Enter material and quantities.
STEP_5: Add delivery dates.

VERIFICATION_STEPS: Scheduling agreement number generated.
LAST_VERIFIED_DATE: 2024-04-12
VERIFIED_BY: Rsuresh1"""

SAMPLE_CONFIG = """DOCUMENT_ID: FI-CFG-003
CONTENT_TYPE: config
MODULE: FI
CONFIGURATION_NAME: G/L Account Determination for SD Billing
WHAT_THIS_CONTROLS: Maps billing types to G/L accounts.
CHANGE_FREQUENCY: rare
NAVIGATION: T-Code VKOA

================================================================================
CURRENT_PRODUCTION_VALUES:
================================================================================

Company Code: 1000
Billing Type F2 -> G/L 800000

CHANGE_PROCESS: Requires Finance Controller approval.
LAST_VERIFIED_DATE: 2024-05-02
VERIFIED_BY: Rsuresh1"""


class TestDocumentIdPattern:
    def test_valid_error_id(self):
        assert DOCUMENT_ID_PATTERN.match("SD-ERR-001")
        assert DOCUMENT_ID_PATTERN.match("FI-ERR-012")
        assert DOCUMENT_ID_PATTERN.match("BASIS-ERR-001")

    def test_valid_procedure_id(self):
        assert DOCUMENT_ID_PATTERN.match("SD-PROC-001")
        assert DOCUMENT_ID_PATTERN.match("MM-PROC-099")

    def test_valid_config_id(self):
        assert DOCUMENT_ID_PATTERN.match("FI-CFG-003")
        assert DOCUMENT_ID_PATTERN.match("CO-CFG-001")

    def test_invalid_formats_rejected(self):
        assert not DOCUMENT_ID_PATTERN.match("SD-ERR-01")    # Only 2 digits
        assert not DOCUMENT_ID_PATTERN.match("sd-err-001")   # Lowercase
        assert not DOCUMENT_ID_PATTERN.match("SD-ERR")       # Missing number
        assert not DOCUMENT_ID_PATTERN.match("SD-OTHER-001") # Wrong type suffix


class TestFieldDetection:
    def test_error_guide_fields_detected(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        assert fields["DOCUMENT_ID"] == "SD-ERR-001"
        assert fields["CONTENT_TYPE"] == "error_guide"
        assert fields["MODULE"] == "SD"
        assert fields["ERROR_CODE"] == "VL150"
        assert "VL01N" in fields["TRANSACTIONS"]
        assert "CAUSE_1" in fields
        assert "Safety Stock Too High" in fields["CAUSE_1"]

    def test_procedure_fields_detected(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_PROCEDURE)
        assert fields["DOCUMENT_ID"] == "SD-PROC-001"
        assert fields["PROCEDURE_NAME"] == "Scheduling Agreement Creation YDSA"
        assert "VA31" in fields["TRANSACTIONS"]

    def test_config_fields_detected(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_CONFIG)
        assert fields["DOCUMENT_ID"] == "FI-CFG-003"
        assert fields["CONFIGURATION_NAME"] == "G/L Account Determination for SD Billing"
        assert "Company Code: 1000" in fields["CURRENT_PRODUCTION_VALUES"]
        assert fields["CHANGE_FREQUENCY"] == "rare"

    def test_multiline_value_captured(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        # WHEN_THIS_OCCURS spans multiple lines
        assert "outbound delivery" in fields.get("WHEN_THIS_OCCURS", "")


class TestSchemaValidation:
    def test_valid_error_guide_passes(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        errors = pipeline._stage4_validate_schema(fields)
        assert errors == [], f"Unexpected errors: {errors}"

    def test_missing_document_id_caught(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        del fields["DOCUMENT_ID"]
        errors = pipeline._stage4_validate_schema(fields)
        assert any("DOCUMENT_ID" in e for e in errors)

    def test_invalid_document_id_format_caught(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        fields["DOCUMENT_ID"] = "sd-err-001"  # Lowercase
        errors = pipeline._stage4_validate_schema(fields)
        assert any("format" in e.lower() or "DOCUMENT_ID" in e for e in errors)

    def test_config_placeholder_caught(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_CONFIG)
        fields["CURRENT_PRODUCTION_VALUES"] = "[PLACEHOLDER] not filled in"
        errors = pipeline._stage4_validate_schema(fields)
        assert any("placeholder" in e.lower() for e in errors)

    def test_error_guide_missing_cause_caught(self, pipeline):
        bad_text = SAMPLE_ERROR_GUIDE.replace("CAUSE_1:", "X_CAUSE:")
        fields = pipeline._stage3_detect_fields(bad_text)
        errors = pipeline._stage4_validate_schema(fields)
        assert any("CAUSE_1" in e for e in errors)


class TestChunking:
    def test_error_guide_produces_correct_chunks(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        common = {
            "document_id": "SD-ERR-001", "content_type": "error_guide",
            "module": "SD", "transactions": ["VL01N", "MMBE"],
            "last_verified_date": "2024-03-28", "verified_by": "Rsuresh1", "total_chunks": 0,
        }
        chunks = pipeline._chunk_error_guide(fields, common)
        types = {c.chunk_type for c in chunks}
        assert "header" in types
        assert "cause_resolution" in types

    def test_error_guide_header_chunk_is_chunk_0(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        common = {
            "document_id": "SD-ERR-001", "content_type": "error_guide",
            "module": "SD", "transactions": [], "last_verified_date": "2024-03-28",
            "verified_by": "Rsuresh1", "total_chunks": 0,
        }
        chunks = pipeline._chunk_error_guide(fields, common)
        assert chunks[0].chunk_type == "header"
        assert chunks[0].chunk_index == 0

    def test_config_values_chunk_not_split(self, pipeline):
        """config_values chunk type must not be split, even if long."""
        fields = pipeline._stage3_detect_fields(SAMPLE_CONFIG)
        common = {
            "document_id": "FI-CFG-003", "content_type": "config",
            "module": "FI", "transactions": ["VKOA"], "last_verified_date": "2024-05-02",
            "verified_by": "Rsuresh1", "total_chunks": 0,
        }
        chunks = pipeline._chunk_config(fields, common)
        values_chunks = [c for c in chunks if c.chunk_type == "config_values"]
        assert len(values_chunks) == 1  # Exactly one values chunk

    def test_procedure_produces_phase_chunks(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_PROCEDURE)
        common = {
            "document_id": "SD-PROC-001", "content_type": "procedure",
            "module": "SD", "transactions": ["VA31", "VA32"], "last_verified_date": "2024-04-12",
            "verified_by": "Rsuresh1", "total_chunks": 0,
        }
        chunks = pipeline._chunk_procedure(fields, SAMPLE_PROCEDURE, common)
        types = [c.chunk_type for c in chunks]
        assert "procedure_header" in types
        assert "procedure_steps" in types

    def test_chunk_ids_are_sequential(self, pipeline):
        fields = pipeline._stage3_detect_fields(SAMPLE_ERROR_GUIDE)
        common = {
            "document_id": "SD-ERR-001", "content_type": "error_guide",
            "module": "SD", "transactions": [], "last_verified_date": "2024-03-28",
            "verified_by": "Rsuresh1", "total_chunks": 0,
        }
        chunks = pipeline._chunk_error_guide(fields, common)
        indices = [c.chunk_index for c in chunks]
        assert indices == list(range(len(chunks))), f"Indices not sequential: {indices}"

    def test_identity_string_built_correctly(self, pipeline):
        from app.services.ingestion_pipeline import DocumentChunk
        chunk = DocumentChunk(
            chunk_id="SD-ERR-001:chunk:0", document_id="SD-ERR-001",
            content_type="error_guide", module="SD", chunk_type="header",
            chunk_text="VL150 error text", chunk_index=0, total_chunks=3,
            error_code="VL150",
        )
        identity = pipeline._build_identity_string(chunk)
        assert "VL150" in identity
        assert "SD" in identity
