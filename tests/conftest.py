"""
AEGIS Test Configuration
Shared pytest configuration for all test files.

asyncio_mode = "auto" is set in backend/pyproject.toml, which pytest only
discovers when invoked from within backend/. When running the full suite
from the repo root (tests/unit/ backend/tests/unit/ — CLAUDE.md's
documented command), that file isn't picked up, so async tests still need
an explicit @pytest.mark.asyncio decoration; every existing test already
follows this convention.
"""
import pytest


# Shared marker for slow integration tests
slow = pytest.mark.slow


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow (integration tests)")
    config.addinivalue_line("markers", "asyncio: marks tests as async")
