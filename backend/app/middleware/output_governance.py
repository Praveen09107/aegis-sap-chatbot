"""
AEGIS Output Governance.

Scans generated text for patterns that should never appear in AEGIS responses.
Used by the Validation Engine's Tier 1 check, which calls scan_sentence()
for each sentence during concurrent streaming.

Not implemented as FastAPI middleware (runs inside the Validation Engine pipeline).
This module provides the scanning functions used by validation_engine.py.
"""
import re
import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)

# ============================================================
# Restricted Content Patterns
# These should NEVER appear in AEGIS response text
# ============================================================

PATTERN_INTERNAL_IP = re.compile(
    r"172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}",
    re.IGNORECASE,
)

PATTERN_JWT = re.compile(
    r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
)

PATTERN_VAULT_PATH = re.compile(
    r"/v1/(secret|pki|database|transit|auth|sys)/",
    re.IGNORECASE,
)

PATTERN_SYSTEM_PROMPT_FRAGMENTS = [
    re.compile(r"You are AEGIS.*Sona Comstar", re.IGNORECASE),
    re.compile(r"answer ONLY based on the provided documentation", re.IGNORECASE),
    re.compile(r"Do not reproduce SAP credentials", re.IGNORECASE),
    re.compile(r"aegis-realm.*keycloak", re.IGNORECASE),
]

PATTERN_SAP_CREDENTIALS = re.compile(
    r"(SY-UNAME|BNAME|PASSWORD|PASSWD)\s*[:=]\s*\S+",
    re.IGNORECASE,
)

PATTERN_CONTAINER_HOSTNAME = re.compile(
    r"(aegis-fastapi|aegis-vault|aegis-postgres|aegis-redis|aegis-qdrant|aegis-ollama)\b",
    re.IGNORECASE,
)

ALL_PATTERNS = [
    ("internal_ip", PATTERN_INTERNAL_IP),
    ("jwt_token", PATTERN_JWT),
    ("vault_path", PATTERN_VAULT_PATH),
    ("sap_credential", PATTERN_SAP_CREDENTIALS),
    ("container_hostname", PATTERN_CONTAINER_HOSTNAME),
]


class OutputGovernanceResult:
    """Result of an output governance scan."""

    def __init__(self) -> None:
        self.violations: List[Tuple[str, str]] = []
        self.clean_text: str = ""

    @property
    def has_violations(self) -> bool:
        """Return True if any violations were found."""
        return len(self.violations) > 0


def scan_sentence(sentence: str) -> OutputGovernanceResult:
    """Scan a single sentence for restricted content.

    Called by the Validation Engine for each sentence during streaming.
    Returns a result with any violations found and the cleaned text.

    This function must complete in under 2ms per sentence.
    All checks are regex-based (no model inference).

    Args:
        sentence: A single sentence from the generated response.

    Returns:
        OutputGovernanceResult with violations and cleaned text.
    """
    result = OutputGovernanceResult()
    clean_text = sentence

    for pattern_name, pattern in ALL_PATTERNS:
        match = pattern.search(clean_text)
        if match:
            matched = match.group(0)
            result.violations.append((pattern_name, matched))
            clean_text = pattern.sub("[REDACTED]", clean_text)
            logger.warning(
                "Output governance: %s detected and redacted",
                pattern_name,
                extra={"pattern": pattern_name, "matched_length": len(matched)},
            )

    for pattern in PATTERN_SYSTEM_PROMPT_FRAGMENTS:
        if pattern.search(clean_text):
            result.violations.append(("system_prompt_fragment", "system prompt content detected"))
            clean_text = pattern.sub("[SYSTEM CONTENT REDACTED]", clean_text)
            logger.warning("Output governance: system prompt fragment detected and redacted")

    result.clean_text = clean_text
    return result


def scan_full_response(response_text: str) -> OutputGovernanceResult:
    """Scan a complete response text.

    Used for responses not streamed sentence-by-sentence.

    Args:
        response_text: The full response text to scan.

    Returns:
        OutputGovernanceResult with all violations and cleaned text.
    """
    result = OutputGovernanceResult()
    clean_text = response_text

    for pattern_name, pattern in ALL_PATTERNS:
        matches = pattern.findall(clean_text)
        for match in matches:
            matched_str = match if isinstance(match, str) else match[0]
            result.violations.append((pattern_name, matched_str[:50]))
        clean_text = pattern.sub("[REDACTED]", clean_text)

    for pattern in PATTERN_SYSTEM_PROMPT_FRAGMENTS:
        if pattern.search(clean_text):
            result.violations.append(("system_prompt_fragment", "system prompt content"))
            clean_text = pattern.sub("[SYSTEM CONTENT REDACTED]", clean_text)

    result.clean_text = clean_text
    return result
