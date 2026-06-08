"""Unit tests for Upload Handler — magic bytes validation."""
import pytest
from fastapi import HTTPException

from app.handlers.upload_handler import validate_magic_bytes


class TestMagicBytes:
    def test_jpeg_detected(self):
        jpeg_header = bytes([0xFF, 0xD8, 0xFF]) + b'\x00' * 100
        ext, mime = validate_magic_bytes(jpeg_header)
        assert ext == "jpeg"
        assert mime == "image/jpeg"

    def test_png_detected(self):
        png_header = bytes([0x89, 0x50, 0x4E, 0x47]) + b'\x00' * 100
        ext, mime = validate_magic_bytes(png_header)
        assert ext == "png"
        assert mime == "image/png"

    def test_docx_detected(self):
        docx_header = bytes([0x50, 0x4B, 0x03, 0x04]) + b'\x00' * 100
        ext, mime = validate_magic_bytes(docx_header)
        assert ext == "docx"

    def test_pdf_detected(self):
        pdf_header = bytes([0x25, 0x50, 0x44, 0x46]) + b'\x00' * 100
        ext, mime = validate_magic_bytes(pdf_header)
        assert ext == "pdf"
        assert mime == "application/pdf"

    def test_unknown_format_raises(self):
        unknown = bytes([0x00, 0x00, 0x00, 0x00]) + b'\x00' * 100
        with pytest.raises(HTTPException) as exc_info:
            validate_magic_bytes(unknown)
        assert exc_info.value.status_code == 400
        assert "Unsupported file format" in exc_info.value.detail

    def test_empty_bytes_raises(self):
        with pytest.raises(HTTPException):
            validate_magic_bytes(b"")
