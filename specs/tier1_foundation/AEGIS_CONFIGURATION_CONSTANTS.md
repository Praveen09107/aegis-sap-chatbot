# AEGIS CONFIGURATION CONSTANTS
## All Hardcoded Values, Port Numbers, Thresholds, Weights, and System Constants
## Attach to Every Agent Session

---

## CRITICAL INSTRUCTION FOR THE AI AGENT

Every value in this document must be used exactly where specified. Never hardcode a number directly in application code — always reference it from a constants module that reads from environment variables or from this specification. If you see a number in AEGIS application code that is not coming from a constants file or environment variable, that is a bug.

When implementing any component, check this document before using any numeric value, timeout, or threshold.

---

## 1. NETWORK PORTS

### Service Ports on Docker Internal Network
These are the ports services listen on inside their containers. Used for container-to-container communication.

```python
# FastAPI application
FASTAPI_PORT = 8000

# Nginx
NGINX_HTTP_PORT = 80
NGINX_HTTPS_PORT = 443

# Keycloak
KEYCLOAK_PORT = 8080

# HashiCorp Vault
VAULT_PORT = 8200
VAULT_CLUSTER_PORT = 8201

# Qdrant
QDRANT_REST_PORT = 6333
QDRANT_GRPC_PORT = 6334

# OpenSearch
OPENSEARCH_REST_PORT = 9200
OPENSEARCH_TRANSPORT_PORT = 9300

# PostgreSQL
POSTGRES_PORT = 5432

# PgBouncer (client-facing proxy port)
PGBOUNCER_PORT = 6432

# Redis
REDIS_PORT = 6379        # Both instances listen on this inside their containers

# DeBERTa NLI Service
DEBERTA_SERVICE_PORT = 8001

# BGE Embedding Service
BGE_SERVICE_PORT = 8002

# Ollama Instances (all three use same container port, different hostnames)
OLLAMA_PORT = 11434

# Prometheus
PROMETHEUS_PORT = 9090

# Grafana
GRAFANA_PORT = 3000
```

### Docker Host Port Mappings
These are the ports exposed to the host machine (for external access and debugging).

```yaml
# In docker-compose.yml:
nginx:
  ports: ["80:80", "443:443"]

qdrant:
  ports: ["6333:6333"]          # Expose for debugging only, remove in production

opensearch:
  ports: ["9200:9200"]          # Expose for debugging only

grafana:
  ports: ["3000:3000"]

prometheus:
  ports: ["9090:9090"]

# FastAPI, Redis, PostgreSQL, Keycloak, Vault are NOT exposed to host
# They are accessible only through Docker internal networks
```

---

## 2. DOCKER CONTAINER NAMES AND HOSTNAMES

Every service has a specific container name and hostname. These are used in connection strings throughout the application. Do not use different names.

```python
# Container names and their Docker network hostnames:
CONTAINER_NGINX         = "aegis-nginx"
CONTAINER_KEYCLOAK      = "aegis-keycloak"
CONTAINER_VAULT         = "aegis-vault"
CONTAINER_FASTAPI       = "aegis-fastapi"
CONTAINER_ARQ           = "aegis-arq"
CONTAINER_OLLAMA_MAIN   = "aegis-ollama-main"     # Qwen2.5-32B
CONTAINER_OLLAMA_JUDGE  = "aegis-ollama-judge"    # Qwen2.5-7B
CONTAINER_OLLAMA_VISION = "aegis-ollama-vision"   # Qwen2.5-VL-7B
CONTAINER_DEBERTA       = "aegis-deberta"
CONTAINER_BGE           = "aegis-bge"
CONTAINER_QDRANT        = "aegis-qdrant"
CONTAINER_OPENSEARCH    = "aegis-opensearch"
CONTAINER_POSTGRES_PRI  = "aegis-postgres-primary"
CONTAINER_POSTGRES_REP  = "aegis-postgres-replica"
CONTAINER_PGBOUNCER     = "aegis-pgbouncer"
CONTAINER_REDIS_SESSION = "aegis-redis-session"   # Redis Instance 1
CONTAINER_REDIS_QUEUE   = "aegis-redis-queue"     # Redis Instance 2
CONTAINER_PROMETHEUS    = "aegis-prometheus"
CONTAINER_GRAFANA       = "aegis-grafana"
```

---

## 3. DOCKER NETWORK NAMES

```python
NETWORK_PUBLIC  = "nexus-public"
NETWORK_APP     = "nexus-app"
NETWORK_AI      = "nexus-ai"
NETWORK_DATA    = "nexus-data"
NETWORK_OBS     = "nexus-obs"
```

---

## 4. DOCKER VOLUME NAMES

```python
VOLUME_VAULT_DATA       = "aegis-vault-data"
VOLUME_POSTGRES_DATA    = "aegis-postgres-data"
VOLUME_POSTGRES_REP     = "aegis-postgres-replica-data"
VOLUME_QDRANT_DATA      = "aegis-qdrant-data"
VOLUME_OPENSEARCH_DATA  = "aegis-opensearch-data"
VOLUME_REDIS1_DATA      = "aegis-redis-session-data"
VOLUME_REDIS2_DATA      = "aegis-redis-queue-data"
VOLUME_OLLAMA_MODELS    = "aegis-ollama-models"    # Shared by all three Ollama containers
VOLUME_BACKUP_DATA      = "aegis-backup-data"
VOLUME_TMP_UPLOADS      = "aegis-tmp-uploads"      # Shared by FastAPI and ARQ worker
```

---

## 5. AI MODEL IDENTIFIERS

Exact model names as used in Ollama API calls and model loading.

```python
# Ollama model tags (use these exact strings in API calls)
MODEL_MAIN_GENERATION  = "qwen2.5:32b-instruct-q4_K_M"
MODEL_JUDGE_CRAG       = "qwen2.5:7b-instruct-q4_K_M"
MODEL_VISION           = "qwen2.5vl:7b-instruct-q4_K_M"

# Embedding and NLI model identifiers (HuggingFace model IDs)
MODEL_EMBEDDING        = "BAAI/bge-base-en-v1.5"
MODEL_NLI              = "cross-encoder/nli-deberta-v3-large"
MODEL_CROSS_ENCODER    = "cross-encoder/ms-marco-MiniLM-L-12-v2"

# Embedding model version string (stored in Qdrant payload)
EMBEDDING_MODEL_VERSION = "bge-base-en-v1.5"

# Vector dimension produced by the embedding model
EMBEDDING_DIMENSION    = 768    # BGE-base-en-v1.5 output dimension
```

---

## 6. QDRANT COLLECTION NAMES AND CONFIGURATION

```python
# Collection names
QDRANT_COLLECTION_ERRORS     = "meridian_errors"
QDRANT_COLLECTION_PROCEDURES = "meridian_procedures"
QDRANT_COLLECTION_CONFIGS    = "meridian_configs"
QDRANT_COLLECTION_CACHE      = "cache_queries"

# Named vector names within content collections
QDRANT_VECTOR_CONTENT        = "content"     # Embedding of chunk_text
QDRANT_VECTOR_IDENTITY       = "identity"    # Embedding of document identity string

# HNSW parameters for content collections (meridian_errors, procedures, configs)
QDRANT_HNSW_M                = 32
QDRANT_HNSW_EF_CONSTRUCTION  = 200
QDRANT_HNSW_EF               = 128

# HNSW parameters for cache_queries collection
QDRANT_CACHE_HNSW_M              = 16
QDRANT_CACHE_HNSW_EF_CONSTRUCTION = 100
QDRANT_CACHE_HNSW_EF              = 64

# Search result counts
QDRANT_SEARCH_LIMIT          = 10    # Results per collection per search
```

---

## 7. RETRIEVAL ENGINE CONSTANTS

```python
# RRF fusion constant
RRF_K = 60    # Constant in denominator: score = 1 / (rank + K)

# Mode C diversity bonus (applied to chunks from underrepresented documents)
MODE_C_DIVERSITY_BONUS = 0.15    # 15% upward adjustment to RRF score

# Number of candidates sent to CRAG and cross-encoder
RETRIEVAL_CRAG_INPUT_CHUNKS = 8

# Final context chunks after reranking
RETRIEVAL_FINAL_CHUNKS = 5

# Knowledge Graph expansion base rank (used in RRF for KG-sourced documents)
KG_BASE_RANK_EQUIVALENT = 15    # KG documents get score equivalent to rank 15

# OpenSearch search limit
OPENSEARCH_SEARCH_LIMIT = 10

# Total candidates after all sources merged (before CRAG)
RRF_TOTAL_CANDIDATES = 20

# Mode C sub-query count
MODE_C_MAX_SUBQUERIES = 2

# CRAG skip thresholds (cross-encoder score above these → skip CRAG)
CRAG_SKIP_THRESHOLD_MODE_A = 0.82
CRAG_SKIP_THRESHOLD_MODE_B = 0.80

# Semantic cache similarity threshold
SEMANTIC_CACHE_THRESHOLD = 0.88

# Mode C activation: query length threshold in characters
MODE_C_QUERY_LENGTH_THRESHOLD = 200
```

---

## 8. VALIDATION ENGINE CONSTANTS

```python
# DeBERTa NLI token limits
DEBERTA_MAX_INPUT_TOKENS     = 512    # Hard limit imposed by DeBERTa model
DEBERTA_MAX_CHUNK_TOKENS     = 350    # Max tokens in a premise chunk (leaves room for claim + separators)
DEBERTA_WINDOW_SIZE_TOKENS   = 300    # Window size for long chunk sliding window
DEBERTA_WINDOW_OVERLAP_TOKENS = 75   # Overlap between adjacent windows

# NLI entailment thresholds
NLI_THRESHOLD_STANDARD       = 0.80  # Regular factual claims
NLI_THRESHOLD_POLICY_CLAIM   = 0.90  # Claims about company policy or specific Sona Comstar configuration

# Feedback diagnosis threshold
FEEDBACK_RETRIEVAL_FAIL_THRESHOLD = 0.65  # avg entailment below this → retrieval failure

# Validation ensemble weights (must sum to 1.0)
WEIGHT_NLI                   = 0.45
WEIGHT_JUDGE_FAITHFULNESS    = 0.30
WEIGHT_JUDGE_COMPLETENESS    = 0.25

# Freshness coefficient values
FRESHNESS_COEFF_0_90_DAYS    = 1.00
FRESHNESS_COEFF_90_180_DAYS  = 0.95
FRESHNESS_COEFF_180_365_DAYS = 0.85
FRESHNESS_COEFF_365_PLUS_DAYS = 0.75

# Freshness thresholds in days
FRESHNESS_THRESHOLD_1        = 90    # Days: 0-90 → coefficient 1.00
FRESHNESS_THRESHOLD_2        = 180   # Days: 90-180 → coefficient 0.95
FRESHNESS_THRESHOLD_3        = 365   # Days: 180-365 → coefficient 0.85

# Confidence badge thresholds
BADGE_GREEN_THRESHOLD        = 0.85  # ValidationScore >= this → green
BADGE_AMBER_THRESHOLD        = 0.70  # ValidationScore >= this → amber, < this → regenerate

# Regeneration limit
MAX_REGENERATION_ATTEMPTS    = 1     # One targeted regeneration before escalation
```

---

## 9. TTL VALUES (TIME-TO-LIVE IN SECONDS)

```python
# Redis TTLs
SESSION_TTL_SECONDS          = 7200   # 2 hours — session state in Redis Instance 1
DIAGNOSTIC_OBJECT_TTL_SECONDS = 600  # 10 minutes — DiagnosticObject in Redis Instance 1
SEMANTIC_CACHE_TTL_SECONDS   = 86400  # 24 hours — semantic cache (not Redis, tracked in payload)

# JWT TTLs
ACCESS_TOKEN_TTL_SECONDS     = 900    # 15 minutes
REFRESH_TOKEN_TTL_SECONDS    = 28800  # 8 hours
TOKEN_REFRESH_INTERVAL_SECONDS = 720  # 12 minutes — when frontend triggers silent refresh

# Vault credential TTLs
VAULT_POSTGRES_CRED_TTL_SECONDS = 3600    # 1 hour — dynamic PostgreSQL credentials
VAULT_TOKEN_TTL_SECONDS         = 21600   # 6 hours — Vault service token
VAULT_PKI_CERT_TTL_SECONDS      = 86400   # 24 hours — mTLS leaf certificates
VAULT_CERT_RENEWAL_THRESHOLD    = 64800   # 18 hours — renew certificate at this remaining TTL

# ARQ task TTLs
ARQ_TASK_STATE_TTL_SECONDS   = 86400   # 24 hours — task state hash after completion
```

---

## 10. TIMEOUT VALUES (IN SECONDS)

```python
# Generation timeouts
GENERATION_TIMEOUT_SECONDS      = 120   # Max wait for generation to complete
VISION_PROCESSING_TIMEOUT       = 180   # Max wait for vision ARQ task
CRAG_ASSESSMENT_TIMEOUT         = 60    # Max wait for CRAG self-reflection model call
JUDGE_EVALUATION_TIMEOUT        = 60    # Max wait for Tier 3 judge call

# WebSocket timeouts
WEBSOCKET_INACTIVITY_TIMEOUT    = 180   # Close WebSocket after this many seconds of inactivity

# Integration test timeouts
INTEGRATION_TEST_TIMEOUT        = 180   # All integration tests use this timeout
UNIT_TEST_TIMEOUT               = 30    # Component-level tests

# HTTP client timeouts
HTTP_CLIENT_CONNECT_TIMEOUT     = 10
HTTP_CLIENT_READ_TIMEOUT        = 90    # Long for model inference calls

# Circuit breaker settings
CIRCUIT_BREAKER_WINDOW          = 10    # Rolling window: last N calls
CIRCUIT_BREAKER_FAIL_THRESHOLD  = 0.50  # Open circuit if failure rate exceeds this
CIRCUIT_BREAKER_COOLDOWN        = 30    # Seconds to stay open before half-open test
```

---

## 11. RATE LIMITING CONSTANTS

```python
RATE_LIMIT_REQUESTS_PER_MINUTE = 60
RATE_LIMIT_BURST_CAPACITY       = 10   # Additional requests allowed in burst
RATE_LIMIT_WINDOW_SECONDS       = 60
```

---

## 12. INGESTION PIPELINE CONSTANTS

```python
# File validation
MIN_PDF_TEXT_LENGTH             = 100   # Characters — below this, PDF is likely scanned
MAX_UPLOAD_SIZE_BYTES           = 52428800  # 50MB

# Chunking
MAX_CHUNK_TOKENS                = 500   # Split chunks larger than this
CHUNK_OVERLAP_TOKENS            = 75    # Overlap at chunk split boundaries

# Temp file paths
TEMP_UPLOAD_DIR                 = "/tmp/aegis_uploads"
TEMP_FILE_FORMAT                = "{session_id}_{timestamp_ms}.{ext}"
ORPHANED_FILE_CLEANUP_MINUTES   = 10

# Embedding
EMBEDDING_MAX_INPUT_TOKENS      = 512   # BGE-base input limit

# Entity boosting (OpenSearch indexing)
ENTITY_BOOST_REPETITIONS        = 3     # entity_code repeated N times for BM25 boosting
```

---

## 13. CONVERSATION STATE CONSTANTS

```python
MAX_CONVERSATION_HISTORY_TURNS  = 3     # Maximum turns stored in session state
QUERY_SUMMARY_MAX_CHARS         = 200   # Truncate query summaries to this length
ANSWER_SUMMARY_MAX_CHARS        = 300   # Truncate answer summaries to this length

ESCALATION_UNRESOLVED_THRESHOLD = 3     # Suggest escalation after this many unresolved turns

CONFIDENCE_HISTORY_MAX_ENTRIES  = 5     # Maximum ValidationScores stored in history
```

---

## 14. OPENSEARCH CONFIGURATION

```python
OPENSEARCH_INDEX_NAME           = "sap_documents"
OPENSEARCH_JVM_HEAP_MIN         = "2g"  # Used in OPENSEARCH_JAVA_OPTS: -Xms2g
OPENSEARCH_JVM_HEAP_MAX         = "2g"  # Used in OPENSEARCH_JAVA_OPTS: -Xmx2g
OPENSEARCH_CONTAINER_MEMORY     = "4g"  # Docker memory limit for OpenSearch container
```

---

## 15. POSTGRESQL CONFIGURATION

```python
POSTGRES_DB_NAME                = "aegis"
POSTGRES_KEYCLOAK_DB            = "keycloak"  # Keycloak uses separate database
PGBOUNCER_POOL_SIZE             = 20
PGBOUNCER_MAX_CLIENT_CONN       = 100
PGBOUNCER_POOL_MODE             = "transaction"

# Config Snapshot staleness thresholds (in days)
CONFIG_SNAPSHOT_WARNING_DAYS    = 35   # Show amber warning in admin portal
CONFIG_SNAPSHOT_CRITICAL_DAYS   = 70   # Show red warning in admin portal

# Config Snapshot staleness injection threshold (in days)
CONFIG_SNAPSHOT_STALENESS_INJECT = 35  # If older than this, inject warning into prompt
```

---

## 16. REDIS MEMORY CONFIGURATION

```python
# Redis Instance 1 (Session Store)
REDIS_SESSION_MAX_MEMORY        = "6gb"
REDIS_SESSION_MAX_MEMORY_POLICY = "allkeys-lru"
REDIS_SESSION_PERSISTENCE       = "no"   # No AOF, no RDB

# Redis Instance 2 (ARQ Queue)
REDIS_QUEUE_MAX_MEMORY          = "1gb"
REDIS_QUEUE_MAX_MEMORY_POLICY   = "noeviction"
REDIS_QUEUE_PERSISTENCE         = "yes"  # AOF enabled
REDIS_QUEUE_AOF_FSYNC           = "everysec"
```

---

## 17. OLLAMA CONFIGURATION

```python
# KEEP_ALIVE setting — models are NEVER unloaded from RAM
OLLAMA_KEEP_ALIVE               = "-1"

# CPU thread allocation per instance
OLLAMA_MAIN_NUM_THREAD          = 10    # Qwen2.5-32B gets 10 threads
OLLAMA_JUDGE_NUM_THREAD         = 3     # Qwen2.5-7B gets 3 threads
OLLAMA_VISION_NUM_THREAD        = 3     # Qwen2.5-VL-7B gets 3 threads
```

---

## 18. FASTAPI CONFIGURATION

```python
UVICORN_WORKERS                 = 2
UVICORN_HOST                    = "0.0.0.0"
UVICORN_PORT                    = 8000
```

---

## 19. KEYCLOAK CONFIGURATION

```python
KEYCLOAK_REALM                  = "aegis-realm"
KEYCLOAK_CLIENT_CHAT            = "aegis-chat"
KEYCLOAK_CLIENT_ADMIN           = "aegis-admin"
KEYCLOAK_ROLE_EMPLOYEE          = "employee"
KEYCLOAK_ROLE_IT_ADMIN          = "it-admin"

# Internal Keycloak URL (used by FastAPI for JWKS)
KEYCLOAK_INTERNAL_URL           = "http://aegis-keycloak:8080"
KEYCLOAK_JWKS_URL               = "http://aegis-keycloak:8080/realms/aegis-realm/protocol/openid-connect/certs"
KEYCLOAK_TOKEN_URL              = "http://aegis-keycloak:8080/realms/aegis-realm/protocol/openid-connect/token"
```

---

## 20. VAULT CONFIGURATION (DEMO)

```python
VAULT_DEV_ROOT_TOKEN            = "aegis-dev-root-token"   # Dev mode root token
VAULT_ADDR                      = "http://aegis-vault:8200"
VAULT_POSTGRES_ROLE             = "aegis-operational-role"  # Dynamic cred role name
VAULT_TRANSIT_KEY               = "aegis-transit-key"       # Transit encryption key name
VAULT_PKI_ROLE                  = "aegis-service-certs"     # PKI role for service certs
VAULT_PKI_COMMON_NAME           = "{service_name}.aegis.internal"
```

---

## 21. NGINX RATE LIMITING CONFIGURATION

```python
NGINX_RATE_LIMIT_ZONE           = "aegis_ratelimit"
NGINX_RATE_LIMIT_KEY            = "$http_authorization"  # Rate limit by JWT
NGINX_RATE_LIMIT_RATE           = "60r/m"               # 60 requests per minute
NGINX_RATE_LIMIT_BURST          = 10                    # Burst allowance
NGINX_MAX_BODY_SIZE             = "50m"                 # 50MB max request body
```

---

## 22. SENTENCE DETECTION CHARACTERS

Used by the Validation Engine to split streamed text into sentences.

```python
# Characters that signal sentence completion when followed by whitespace or newline
SENTENCE_END_CHARS              = {'.', '?', '!', '\n'}

# Additionally, numbered list items signal step boundaries (split before new number)
STEP_NUMBER_PATTERN             = r'^\d+\.'  # Pattern: starts with digit(s) and period
```

---

## 23. ENTITY EXTRACTION REGEX PATTERNS

Used by the Query Intelligence Layer. These are the exact patterns for entity detection.

```python
import re

# SAP Error Code: 1-4 capital letters followed by 2-6 digits
PATTERN_ERROR_CODE = re.compile(r'\b[A-Z]{1,4}\d{2,6}\b')

# SAP Transaction Code: 2-5 capital letters followed by 1-4 digits, optional final capital letter
PATTERN_TCODE = re.compile(r'\b[A-Z]{2,5}\d{1,4}[A-Z]?\b')

# SAP Document Number: exactly 10 consecutive digits
PATTERN_DOCUMENT_NUMBER = re.compile(r'\b\d{10}\b')

# SAP Module Keywords: exact word match only
SAP_MODULE_KEYWORDS = {'FI', 'MM', 'SD', 'HR', 'PP', 'CO', 'BASIS'}

# Document ID format validation
PATTERN_DOCUMENT_ID = re.compile(r'^(FI|MM|SD|HR|PP|CO|BASIS)-(ERR|PROC|CFG)-\d{3}$')
```

---

## 24. CONTEXT RESOLVER REFERENCE SIGNALS

Phrases that indicate a follow-up question referencing a previous topic.

```python
REFERENCE_SIGNAL_PHRASES = [
    "what if",
    "what about",
    "that error",
    "the same issue",
    "it still",
    "this problem",
    "does that also",
    "after that",
    "then what",
    "what happens when",
    "how about when",
    "what else",
    "same thing",
    "that same",
    "this same",
    "still not",
    "still showing",
    "still getting",
]
```

---

## 25. CLASSIFICATION KEYWORDS

Used by the Query Intelligence Layer to classify query intent.

```python
ERROR_RESOLUTION_SIGNALS = [
    "error", "message", "issue", "problem", "failing", "blocked", "not working",
    "showing", "getting", "receiving", "occurred", "appears", "failed"
]

PROCESS_SIGNALS = [
    "how to", "how do i", "steps to", "procedure", "process", "create", "post",
    "run", "execute", "configure", "set up", "complete", "perform"
]

CONFIG_SIGNALS = [
    "configured", "configuration", "setting", "value", "current", "what is set",
    "what period", "open period", "company code", "plant", "assignment"
]
```

---

## 26. PROMPT GENERATION CONSTANTS

```python
# Maximum conversation history tokens to include in prompt
PROMPT_MAX_HISTORY_TOKENS       = 800

# Maximum retrieved context tokens in prompt
PROMPT_MAX_CONTEXT_TOKENS       = 2500

# Temperature for main generation (low for factual accuracy)
GENERATION_TEMPERATURE          = 0.1

# Temperature for CRAG and judge model calls
JUDGE_TEMPERATURE               = 0.0

# Max tokens for main generation response
GENERATION_MAX_TOKENS           = 1000

# Max tokens for CRAG self-reflection response
CRAG_MAX_TOKENS                 = 200

# Max tokens for LLM judge response
JUDGE_MAX_TOKENS                = 300
```

---

## 27. BACKUP SCHEDULE

```python
# PostgreSQL backup
POSTGRES_WAL_ARCHIVE_ENABLED    = True
POSTGRES_BASE_BACKUP_INTERVAL   = "1 hour"

# Qdrant snapshot
QDRANT_SNAPSHOT_INTERVAL        = "6 hours"

# Redis AOF rewrite
REDIS_QUEUE_AOF_REWRITE_INTERVAL = "1 hour"
```

---

## 28. PROMETHEUS SCRAPE INTERVAL

```python
PROMETHEUS_SCRAPE_INTERVAL      = "15s"
PROMETHEUS_EVALUATION_INTERVAL  = "15s"
```

---

## 29. CONNECTION STRING TEMPLATES

```python
# PostgreSQL (via PgBouncer, using dynamic Vault credentials)
# Format: postgresql+asyncpg://{user}:{password}@aegis-pgbouncer:6432/aegis
POSTGRES_DSN_TEMPLATE           = "postgresql+asyncpg://{user}:{password}@aegis-pgbouncer:6432/aegis"

# PostgreSQL read replica (analytical queries)
POSTGRES_REPLICA_DSN_TEMPLATE   = "postgresql+asyncpg://{user}:{password}@aegis-postgres-replica:5432/aegis"

# Redis Instance 1
REDIS_SESSION_URL               = "redis://aegis-redis-session:6379/0"

# Redis Instance 2
REDIS_QUEUE_URL                 = "redis://aegis-redis-queue:6379/0"

# Qdrant
QDRANT_HOST                     = "aegis-qdrant"
QDRANT_PORT                     = 6333

# OpenSearch
OPENSEARCH_HOSTS                = [{"host": "aegis-opensearch", "port": 9200}]

# Ollama Instance 1 (main generation)
OLLAMA_MAIN_BASE_URL            = "http://aegis-ollama-main:11434"

# Ollama Instance 2 (judge and CRAG)
OLLAMA_JUDGE_BASE_URL           = "http://aegis-ollama-judge:11434"

# Ollama Instance 3 (vision)
OLLAMA_VISION_BASE_URL          = "http://aegis-ollama-vision:11434"

# BGE Embedding Service
BGE_SERVICE_URL                 = "http://aegis-bge:8002"

# DeBERTa NLI Service
DEBERTA_SERVICE_URL             = "http://aegis-deberta:8001"

# Vault
VAULT_URL                       = "http://aegis-vault:8200"

# Keycloak
KEYCLOAK_URL                    = "http://aegis-keycloak:8080"
```

---

## 30. ENVIRONMENT VARIABLE NAMES

These are the environment variable names the application reads. All values come from environment variables — never hardcoded in application code.

```bash
# Database (populated by Vault dynamic credentials at startup)
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_HOST=aegis-pgbouncer
POSTGRES_PORT=6432
POSTGRES_DB=aegis

# Redis
REDIS_SESSION_URL=redis://aegis-redis-session:6379/0
REDIS_QUEUE_URL=redis://aegis-redis-queue:6379/0

# Vault
VAULT_ADDR=http://aegis-vault:8200
VAULT_TOKEN=aegis-dev-root-token
VAULT_ROLE_ID=
VAULT_SECRET_ID=

# Ollama
OLLAMA_MAIN_URL=http://aegis-ollama-main:11434
OLLAMA_JUDGE_URL=http://aegis-ollama-judge:11434
OLLAMA_VISION_URL=http://aegis-ollama-vision:11434

# Services
BGE_SERVICE_URL=http://aegis-bge:8002
DEBERTA_SERVICE_URL=http://aegis-deberta:8001

# Keycloak
KEYCLOAK_URL=http://aegis-keycloak:8080
KEYCLOAK_REALM=aegis-realm
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=

# OpenSearch
OPENSEARCH_HOST=aegis-opensearch
OPENSEARCH_PORT=9200

# Qdrant
QDRANT_HOST=aegis-qdrant
QDRANT_PORT=6333

# Application
ENVIRONMENT=demo
LOG_LEVEL=INFO
SECRET_KEY=
```

---

*All constants in this document are authoritative. Reference them from a central constants.py file in the application. Never hardcode these values directly in business logic.*
*Document version: 1.0 | AEGIS Specification Set*
