"""
AEGIS Configuration Module
Reads all environment variables and exposes them as typed constants.
All values in this file come from AEGIS_CONFIGURATION_CONSTANTS.md.
This file is implemented fully in Session 02.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# This file will be fully implemented in Session 02 (environment setup).
# All constants defined in AEGIS_CONFIGURATION_CONSTANTS.md will be here.
# Placeholder to establish module structure.

ENVIRONMENT = os.getenv("ENVIRONMENT", "demo")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Company/Deployment Identity (from AMENDMENT_GENERALIZATION_BACKEND.md FILE 1)
COMPANY_NAME = os.getenv("AEGIS_COMPANY_NAME", "Your Company")
COMPANY_INDUSTRY = os.getenv("AEGIS_COMPANY_INDUSTRY", "manufacturer")

# Ingestion module set (from AMENDMENT_GENERALIZATION_BACKEND.md FILE 1 —
# deferred until IMPL_18 was actually built; that's now)
ALLOWED_MODULES = set(os.getenv("AEGIS_SAP_MODULES", "FI,MM,SD,HR,PP,CO,BASIS").split(","))

# Object storage (from AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 1/3)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "aegis-minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "")
MINIO_BUCKET_DOCUMENTS = os.getenv("MINIO_BUCKET_DOCUMENTS", "aegis-documents")
MINIO_BUCKET_SCREENSHOTS = os.getenv("MINIO_BUCKET_SCREENSHOTS", "knowledge-screenshots")
MINIO_USE_SSL = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
MINIO_REGION = os.getenv("MINIO_REGION", "us-east-1")

# Redis
REDIS_SESSION_URL = os.getenv("REDIS_SESSION_URL", "redis://localhost:6379/0")
REDIS_QUEUE_URL = os.getenv("REDIS_QUEUE_URL", "redis://localhost:6380/0")

# Qdrant
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

# Qdrant collection names
QDRANT_COLLECTION_ERRORS = "meridian_errors"
QDRANT_COLLECTION_PROCEDURES = "meridian_procedures"
QDRANT_COLLECTION_CONFIGS = "meridian_configs"
QDRANT_COLLECTION_CACHE = "cache_queries"

# Named vector names within content collections
QDRANT_VECTOR_CONTENT = "content"
QDRANT_VECTOR_IDENTITY = "identity"

# HNSW search parameters
QDRANT_HNSW_EF = 128
QDRANT_CACHE_HNSW_EF = 64
QDRANT_SEARCH_LIMIT = 10

# Semantic cache similarity threshold
SEMANTIC_CACHE_THRESHOLD = 0.88

# Mode C query length threshold (from AEGIS_CONFIGURATION_CONSTANTS.md Section 7)
MODE_C_QUERY_LENGTH_THRESHOLD = 200

# Retrieval Engine constants (from AEGIS_CONFIGURATION_CONSTANTS.md Section 7)
RRF_K = 60
MODE_C_DIVERSITY_BONUS = 0.15
RETRIEVAL_CRAG_INPUT_CHUNKS = 8
RETRIEVAL_FINAL_CHUNKS = 5
KG_BASE_RANK_EQUIVALENT = 15
MODE_C_MAX_SUBQUERIES = 2          # Mode C parallel sub-queries limit

# OpenSearch
OPENSEARCH_HOST = os.getenv("OPENSEARCH_HOST", "localhost")
OPENSEARCH_PORT = int(os.getenv("OPENSEARCH_PORT", "9200"))
OPENSEARCH_INDEX_NAME = "sap_documents"
OPENSEARCH_SEARCH_LIMIT = 10

# Ingestion pipeline
ENTITY_BOOST_REPETITIONS = 3
MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024   # 10MB upload limit for screenshots
MAX_DOCUMENT_BYTES = 50 * 1024 * 1024     # 50MB upload limit for documents

# Redis TTLs (from AEGIS_CONFIGURATION_CONSTANTS.md Section 9)
SESSION_TTL_SECONDS = 7200
DIAGNOSTIC_OBJECT_TTL_SECONDS = 600
ACCESS_TOKEN_TTL_SECONDS = 900

# Rate limiting (from AEGIS_CONFIGURATION_CONSTANTS.md Section 11)
RATE_LIMIT_REQUESTS_PER_MINUTE = 60
RATE_LIMIT_BURST_CAPACITY = 10
RATE_LIMIT_WINDOW_SECONDS = 60

# FastAPI (from AEGIS_CONFIGURATION_CONSTANTS.md Section 18)
FASTAPI_HOST = os.getenv("FASTAPI_HOST", "0.0.0.0")
FASTAPI_PORT = int(os.getenv("FASTAPI_PORT", "8000"))
UVICORN_WORKERS = int(os.getenv("UVICORN_WORKERS", "2"))

# mTLS toggle (from IMPL_09 locked decisions)
MTLS_ENABLED = os.getenv("MTLS_ENABLED", "false").lower() == "true"

# Keycloak (from IMPL_10 — Identity)
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://aegis-keycloak:8080")
KEYCLOAK_ISSUER_URL = os.getenv("KEYCLOAK_ISSUER_URL", "http://localhost:8180")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "aegis-realm")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "aegis-chat")

# Vault (from IMPL_10 — Secrets)
VAULT_URL = os.getenv("VAULT_URL", "http://aegis-vault:8200")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "")
VAULT_ROLE_ID = os.getenv("VAULT_ROLE_ID", "")
VAULT_SECRET_ID = os.getenv("VAULT_SECRET_ID", "")
VAULT_POSTGRES_ROLE = "aegis-operational-role"  # from scripts/setup_vault.py

# Ollama model endpoints (from AEGIS_CONFIGURATION_CONSTANTS.md Section 29)
OLLAMA_MAIN_URL = os.getenv("OLLAMA_MAIN_URL", "http://aegis-ollama-main:11434")
OLLAMA_JUDGE_URL = os.getenv("OLLAMA_JUDGE_URL", "http://aegis-ollama-judge:11434")
OLLAMA_VISION_URL = os.getenv("OLLAMA_VISION_URL", "http://aegis-ollama-vision:11434")

# AI model identifiers (from AEGIS_CONFIGURATION_CONSTANTS.md Section 5)
MODEL_MAIN = os.getenv("OLLAMA_MODEL_MAIN", "qwen2.5:32b-instruct-q4_K_M")
MODEL_JUDGE = os.getenv("OLLAMA_MODEL_JUDGE", "qwen2.5:7b-instruct-q4_K_M")
MODEL_VISION = os.getenv("OLLAMA_MODEL_VISION", "qwen2.5vl:7b-instruct-q4_K_M")
EMBEDDING_MODEL_VERSION = "bge-base-en-v1.5"
EMBEDDING_DIMENSION = 768  # BGE-base-en-v1.5 output dimension — never change this

# Inference routing (from AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 1)
INFERENCE_MODE = os.getenv("INFERENCE_MODE", "external")  # "external" | "local"

# External provider — Cerebras (primary for main reasoning + vision fallback)
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
CEREBRAS_MODEL_MAIN = "gpt-oss-120b"
CEREBRAS_MODEL_VISION = "gemma-4-31b"

# External provider — Groq (fallback for main reasoning, primary for judge + vision)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL_MAIN = "openai/gpt-oss-120b"       # same weights as CEREBRAS_MODEL_MAIN — note the "openai/" prefix Groq requires that Cerebras does not
GROQ_MODEL_JUDGE = "llama-3.1-8b-instant"
GROQ_MODEL_JUDGE_CAPABILITY = "openai/gpt-oss-20b"  # judge fallback 1 — capability upgrade for harder judge calls once GROQ_MODEL_JUDGE's much larger daily budget (14,400/day vs 1,000/day) is exhausted
GROQ_MODEL_VISION = "qwen/qwen3.6-27b"  # dense 27B, MMMU 82.9 — corrected 2026-07-19: this constant previously held
                                          # "meta-llama/llama-4-scout-17b-16e-instruct", which is no longer present on
                                          # Groq's live model catalog (confirmed via a real GET /v1/models call during
                                          # inference-model research) — every real vision call through this constant
                                          # was silently 404ing. Llama 4 Scout is still genuinely available, just moved
                                          # to Cloudflare — see CLOUDFLARE_MODEL_VISION below, unaffected by this fix.

# External provider — SambaNova (deep fallback tier for main reasoning + judge)
# Free-tier limits are per-model, not account-wide: 20 RPM / 20 RPD / 200,000 TPD each.
SAMBANOVA_API_KEY = os.getenv("SAMBANOVA_API_KEY", "")
SAMBANOVA_BASE_URL = "https://api.sambanova.ai/v1"
SAMBANOVA_MODEL_MAIN = "gpt-oss-120b"                        # same weights as CEREBRAS_MODEL_MAIN/GROQ_MODEL_MAIN
SAMBANOVA_MODEL_JUDGE = "Meta-Llama-3.3-70B-Instruct"

# External provider — Cloudflare Workers AI (deep fallback tier for all 3 roles)
# Free-tier limit is a single shared 10,000-Neuron/day pool across the whole account,
# not per-model — all four CLOUDFLARE_MODEL_* constants below draw from the same budget.
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run"
CLOUDFLARE_MODEL_MAIN = "@cf/openai/gpt-oss-120b"            # same weights as CEREBRAS_MODEL_MAIN/GROQ_MODEL_MAIN/SAMBANOVA_MODEL_MAIN
CLOUDFLARE_MODEL_JUDGE = "@cf/openai/gpt-oss-120b"           # same model reused — judge falls back to the main-reasoning pair here, matching the existing degrade-on-exhaustion pattern
CLOUDFLARE_MODEL_VISION = "@cf/meta/llama-4-scout-17b-16e-instruct"
CLOUDFLARE_MODEL_VISION_2 = "@cf/google/gemma-4-26b-a4b-it"  # second, distinct Cloudflare-hosted vision model — a genuine 4th vision tier, not a duplicate

# External provider — Google AI Studio (Gemini 3.5 Flash — vision only, break-glass last tier)
# Free-tier limit confirmed live: 5 requests/minute. Will fail under normal concurrent
# traffic — reached only after all 4 prior vision tiers (Groq, Cloudflare x2, Cerebras)
# have already failed. Not used for main reasoning or judge — request volume disqualifies
# it from both roles entirely.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL_VISION = "gemini-3.5-flash"

EXTERNAL_INFERENCE_TIMEOUT_SECONDS = 30   # Cerebras/Groq are fast; GENERATION_TIMEOUT_SECONDS (120) remains for the local/Ollama path

# Inference orchestration — N-tier chain cascade budgets (INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §3)
# Total wall-clock ceiling per role across an ENTIRE chain walk, not per-tier —
# prevents e.g. 4 sequential 30s timeouts stacking into a 2-minute worst case.
MAIN_CASCADE_BUDGET_SECONDS = 45
JUDGE_CASCADE_BUDGET_SECONDS = 20
VISION_CASCADE_BUDGET_SECONDS = 60   # tolerates more — one of its 3 call sites is an async ARQ task, not a live request

# Cloudflare Workers AI — shared account-wide daily Neuron cost pool (not per-model).
CLOUDFLARE_NEURON_DAILY_CEILING = 10_000

# Per-provider quota ceilings confirmed live during inference-model research (2026-07-18/19) —
# used by the sliding-window quota tracker for providers with no rate-limit response headers.
SAMBANOVA_RPD_CEILING = 20            # per model, confirmed via SambaNova's own rate-limits doc
GEMINI_RPM_CEILING = 5                # confirmed live via a real 429 (quotaValue: "5") during burst testing

# BGE and DeBERTa service URLs
BGE_SERVICE_URL = os.getenv("BGE_SERVICE_URL", "http://aegis-bge:8002")
DEBERTA_SERVICE_URL = os.getenv("DEBERTA_SERVICE_URL", "http://aegis-deberta:8001")

# Circuit breaker (from AEGIS_CONFIGURATION_CONSTANTS.md Section 10)
CIRCUIT_BREAKER_WINDOW = 10
CIRCUIT_BREAKER_FAIL_THRESHOLD = 0.50
CIRCUIT_BREAKER_COOLDOWN = 30

# Conversation state (from AEGIS_CONFIGURATION_CONSTANTS.md Section 13)
MAX_CONVERSATION_HISTORY_TURNS = 3
QUERY_SUMMARY_MAX_CHARS = 200
ANSWER_SUMMARY_MAX_CHARS = 300
ESCALATION_UNRESOLVED_THRESHOLD = 3

# Feedback diagnosis (from AEGIS_CONFIGURATION_CONSTANTS.md Section 8)
FEEDBACK_RETRIEVAL_FAIL_THRESHOLD = 0.65

# Timeouts (from AEGIS_CONFIGURATION_CONSTANTS.md Section 10)
GENERATION_TIMEOUT_SECONDS = 120
VISION_PROCESSING_TIMEOUT = 180
WEBSOCKET_INACTIVITY_TIMEOUT = 180

# PostgreSQL direct connection (for ARQ tasks, via PgBouncer)
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "aegis-pgbouncer")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "6432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "aegis")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

# Temp file uploads
TEMP_UPLOAD_DIR = "/tmp/aegis_uploads"

# Ingestion pipeline constants (from AEGIS_CONFIGURATION_CONSTANTS.md Section 12)
MIN_PDF_TEXT_LENGTH = 100     # Characters — below this, PDF is likely scanned
MAX_CHUNK_TOKENS = 500        # Split chunks larger than this
CHUNK_OVERLAP_TOKENS = 75     # Overlap at chunk split boundaries

# CRAG self-reflection constants (from AEGIS_CONFIGURATION_CONSTANTS.md Section 7)
CRAG_SKIP_THRESHOLD_MODE_A = 0.82
CRAG_SKIP_THRESHOLD_MODE_B = 0.80
CRAG_MAX_TOKENS = 64
JUDGE_TEMPERATURE = 0.0

# Judge model alias used by CRAG (same as MODEL_JUDGE)
MODEL_JUDGE_CRAG = os.getenv("OLLAMA_MODEL_JUDGE", "qwen2.5:7b-instruct-q4_K_M")

# Main generation model alias (from AEGIS_CONFIGURATION_CONSTANTS.md Section 5)
MODEL_MAIN_GENERATION = os.getenv("OLLAMA_MODEL_MAIN", "qwen2.5:32b-instruct-q4_K_M")

# Generation parameters (from AEGIS_CONFIGURATION_CONSTANTS.md Section 6)
GENERATION_MAX_TOKENS = 1000
GENERATION_TEMPERATURE = 0.1
JUDGE_MAX_TOKENS = 300

# Config snapshot staleness threshold (from AEGIS_CONFIGURATION_CONSTANTS.md Section 14)
CONFIG_SNAPSHOT_STALENESS_INJECT = 35  # days — inject warning if older than this

# DeBERTa NLI windowing (from AEGIS_CONFIGURATION_CONSTANTS.md Section 11)
DEBERTA_MAX_CHUNK_TOKENS = 350
DEBERTA_WINDOW_SIZE_TOKENS = 300
DEBERTA_WINDOW_OVERLAP_TOKENS = 75

# NLI thresholds (from AEGIS_CONFIGURATION_CONSTANTS.md Section 11)
NLI_THRESHOLD_STANDARD = 0.80
NLI_THRESHOLD_POLICY_CLAIM = 0.90

# Validation ensemble weights (from AEGIS_CONFIGURATION_CONSTANTS.md Section 12)
WEIGHT_NLI = 0.45
WEIGHT_JUDGE_FAITHFULNESS = 0.30
WEIGHT_JUDGE_COMPLETENESS = 0.25

# Badge thresholds (from AEGIS_CONFIGURATION_CONSTANTS.md Section 12)
BADGE_GREEN_THRESHOLD = 0.85
BADGE_AMBER_THRESHOLD = 0.70

# Freshness coefficient thresholds and values (from AEGIS_CONFIGURATION_CONSTANTS.md Section 12)
FRESHNESS_THRESHOLD_1 = 90    # days: <= 90 → 1.00
FRESHNESS_THRESHOLD_2 = 180   # days: <= 180 → 0.95
FRESHNESS_THRESHOLD_3 = 365   # days: <= 365 → 0.85
FRESHNESS_COEFF_0_90_DAYS = 1.00
FRESHNESS_COEFF_90_180_DAYS = 0.95
FRESHNESS_COEFF_180_365_DAYS = 0.85
FRESHNESS_COEFF_365_PLUS_DAYS = 0.75

# Quick Entry (from IMPL_23_QUICK_ENTRY_OVERVIEW.md Section 9) — only the
# constants Session 25's Phase 1.2/1.4/1.5 code actually uses; the rest of
# Section 9's list (screenshot, chunking, staleness, feedback, autosave
# constants) belongs to later, not-yet-built phases.
QUICK_ENTRY_RATE_LIMIT_MAX = 5                    # submissions
QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS = 900       # 15 minutes
QUICK_ENTRY_PRESUBMIT_DEDUP_THRESHOLD = 0.85      # UI/check-duplicate warning threshold

# Quick Entry (Session 26/27 additions — IMPL_23 Section 9 constants needed
# by the processing pipeline and chunker; staleness/screenshot constants
# still belong to later, not-yet-built phases)
QUICK_ENTRY_QUALITY_THRESHOLD = 0.65              # min avg chunk quality score to publish
QUICK_ENTRY_DEDUP_THRESHOLD = 0.92                # similarity above = flagged as duplicate
CHUNK_STEPS_PER_BATCH = 5
CHUNK_BRANCH_MAX_TOKENS = 1500                    # ceiling before forced split within a branch group

# Quick Entry (Session 28 additions — IMPL_23 Section 9 screenshot constants)
VISION_EXTRACTION_TIMEOUT_SECONDS = 30
SCREENSHOT_ACCEPTED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
SCREENSHOT_MAX_PER_CAUSE = 3          # error_guide cause_N sections
SCREENSHOT_MAX_PER_STEP_BATCH = 2     # procedure proc_steps_N sections — IMPL_25's own count limit
                                       # text names this tier but IMPL_23 Section 9's constant list
                                       # never gave it a name; added one rather than leaving it magic
SCREENSHOT_MAX_OVERALL = 5            # overview/overall sections
SCREENSHOT_PROXY_CACHE_SECONDS = 86400            # 24 hours
SCREENSHOT_CLEANUP_MIN_VERSIONS_OLD = 2
SCREENSHOT_CLEANUP_MIN_ARCHIVED_DAYS = 90

# Quick Entry (Session 29 additions — IMPL_29 Section 2 staleness constants)
REVIEW_FREQUENCY_DAYS = {
    "monthly": 30, "quarterly": 90, "semi_annual": 180, "annual": 365, "as_needed": None,
}
QUICK_ENTRY_STALENESS_SCORE_DEDUCTION = 0.10
QUICK_ENTRY_QUALITY_FLOOR = 0.40

# Note: Full implementation added in Session 02
