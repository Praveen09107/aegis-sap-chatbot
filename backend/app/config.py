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

# Company/Deployment Identity (from AMENDMENT_GENERALIZATION_BACKEND.md FILE 1 —
# only COMPANY_NAME/COMPANY_INDUSTRY added here; ALLOWED_MODULES is IMPL_18-specific
# and deferred until that session is built)
COMPANY_NAME = os.getenv("AEGIS_COMPANY_NAME", "Your Company")
COMPANY_INDUSTRY = os.getenv("AEGIS_COMPANY_INDUSTRY", "manufacturer")

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

# OpenSearch
OPENSEARCH_HOST = os.getenv("OPENSEARCH_HOST", "localhost")
OPENSEARCH_PORT = int(os.getenv("OPENSEARCH_PORT", "9200"))
OPENSEARCH_INDEX_NAME = "sap_documents"
OPENSEARCH_SEARCH_LIMIT = 10

# Ingestion pipeline
ENTITY_BOOST_REPETITIONS = 3

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
GROQ_MODEL_VISION = "meta-llama/llama-4-scout-17b-16e-instruct"  # prefix required — omitting it returns 404

EXTERNAL_INFERENCE_TIMEOUT_SECONDS = 30   # Cerebras/Groq are fast; GENERATION_TIMEOUT_SECONDS (120) remains for the local/Ollama path

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

# Note: Full implementation added in Session 02
