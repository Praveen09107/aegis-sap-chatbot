# IMPL_03: DOCKER INFRASTRUCTURE
## Complete Docker Compose Specification — All 19 Services
## Session 03 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 03: Create the complete Docker Compose infrastructure.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

This session creates all Docker infrastructure files. No Python application code is written here. After this session, all 19 services must be running and healthy.

**Critical requirements for this session:**
- Container names must exactly match those in AEGIS_CONFIGURATION_CONSTANTS.md
- Network names must exactly match the five defined networks
- OpenSearch MUST have `OPENSEARCH_JAVA_OPTS: "-Xms2g -Xmx2g"` environment variable
- All three Ollama instances MUST have `OLLAMA_KEEP_ALIVE: "-1"`
- Keycloak MUST connect to PostgreSQL (not H2)
- Redis Instance 1: maxmemory 6gb, allkeys-lru, no persistence
- Redis Instance 2: maxmemory 1gb, noeviction, AOF enabled

---

## FILE 1: docker-compose.yml

Create this file at the project root: `docker-compose.yml`

This is the complete specification. Create this file exactly as shown.

```yaml
# AEGIS Docker Compose — Complete Infrastructure
# Version: 1.0 | All 19 services

networks:
  nexus-public:
    driver: bridge
    name: nexus-public
  nexus-app:
    driver: bridge
    name: nexus-app
  nexus-ai:
    driver: bridge
    name: nexus-ai
  nexus-data:
    driver: bridge
    name: nexus-data
  nexus-obs:
    driver: bridge
    name: nexus-obs

volumes:
  aegis-vault-data:
    name: aegis-vault-data
  aegis-postgres-data:
    name: aegis-postgres-data
  aegis-postgres-replica-data:
    name: aegis-postgres-replica-data
  aegis-qdrant-data:
    name: aegis-qdrant-data
  aegis-opensearch-data:
    name: aegis-opensearch-data
  aegis-redis-session-data:
    name: aegis-redis-session-data
  aegis-redis-queue-data:
    name: aegis-redis-queue-data
  aegis-ollama-models:
    name: aegis-ollama-models
  aegis-backup-data:
    name: aegis-backup-data
  aegis-tmp-uploads:
    name: aegis-tmp-uploads

services:

  # ============================================================
  # LAYER 1: Core Infrastructure (start first, no dependencies)
  # ============================================================

  aegis-vault:
    image: hashicorp/vault:1.18.1
    container_name: aegis-vault
    hostname: aegis-vault
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: aegis-dev-root-token
      VAULT_DEV_LISTEN_ADDRESS: "0.0.0.0:8200"
      VAULT_ADDR: "http://0.0.0.0:8200"
    cap_add:
      - IPC_LOCK
    volumes:
      - aegis-vault-data:/vault/data
    networks:
      - nexus-app
      - nexus-data
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "vault", "status", "-address=http://127.0.0.1:8200"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s

  aegis-redis-session:
    image: redis:7.4-alpine
    container_name: aegis-redis-session
    hostname: aegis-redis-session
    command: >
      redis-server
      --maxmemory 6gb
      --maxmemory-policy allkeys-lru
      --appendonly no
      --save ""
      --loglevel warning
    volumes:
      - aegis-redis-session-data:/data
    networks:
      - nexus-data
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  aegis-redis-queue:
    image: redis:7.4-alpine
    container_name: aegis-redis-queue
    hostname: aegis-redis-queue
    command: >
      redis-server
      --maxmemory 1gb
      --maxmemory-policy noeviction
      --appendonly yes
      --appendfsync everysec
      --loglevel warning
    volumes:
      - aegis-redis-queue-data:/data
    networks:
      - nexus-data
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ============================================================
  # LAYER 2: Databases (depend on Layer 1)
  # ============================================================

  aegis-postgres-primary:
    image: postgres:16.4-alpine
    container_name: aegis-postgres-primary
    hostname: aegis-postgres-primary
    environment:
      POSTGRES_DB: aegis
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_ADMIN_PASSWORD:-aegis_admin_dev_2024}
      # Enable WAL for replication
      POSTGRES_INITDB_ARGS: "--wal-level=replica"
    command: >
      postgres
      -c wal_level=replica
      -c hot_standby=on
      -c max_wal_senders=3
      -c max_replication_slots=3
      -c wal_keep_size=1GB
      -c synchronous_commit=on
    volumes:
      - aegis-postgres-data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d:ro
      - aegis-backup-data:/backups
    networks:
      - nexus-data
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d aegis"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

  aegis-postgres-replica:
    image: postgres:16.4-alpine
    container_name: aegis-postgres-replica
    hostname: aegis-postgres-replica
    environment:
      PGDATA: /var/lib/postgresql/data
      POSTGRES_MASTER_HOST: aegis-postgres-primary
      POSTGRES_MASTER_PORT: "5432"
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_ADMIN_PASSWORD:-aegis_admin_dev_2024}
    entrypoint:
      - /bin/sh
      - -c
      - |
        if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then
          echo "Setting up replica from primary..."
          until pg_isready -h aegis-postgres-primary -U postgres; do sleep 2; done
          pg_basebackup -h aegis-postgres-primary -U postgres -D /var/lib/postgresql/data -Fp -Xs -P -R
          echo "Replica setup complete"
        fi
        exec docker-entrypoint.sh postgres -c hot_standby=on
    volumes:
      - aegis-postgres-replica-data:/var/lib/postgresql/data
    networks:
      - nexus-data
      - nexus-obs
    depends_on:
      aegis-postgres-primary:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 60s

  aegis-qdrant:
    image: qdrant/qdrant:v1.12.1
    container_name: aegis-qdrant
    hostname: aegis-qdrant
    volumes:
      - aegis-qdrant-data:/qdrant/storage
    networks:
      - nexus-data
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:6333/healthz || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 20s

  aegis-opensearch:
    image: opensearchproject/opensearch:2.17.0
    container_name: aegis-opensearch
    hostname: aegis-opensearch
    environment:
      discovery.type: single-node
      OPENSEARCH_JAVA_OPTS: "-Xms2g -Xmx2g"
      plugins.security.disabled: "true"
      DISABLE_INSTALL_DEMO_CONFIG: "true"
      bootstrap.memory_lock: "true"
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    mem_limit: 4g
    volumes:
      - aegis-opensearch-data:/usr/share/opensearch/data
    networks:
      - nexus-data
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health | grep -qv '\"status\":\"red\"' || exit 1"]
      interval: 20s
      timeout: 10s
      retries: 10
      start_period: 60s

  # ============================================================
  # LAYER 3: Application Tier Services (depend on Layer 2)
  # ============================================================

  aegis-pgbouncer:
    image: pgbouncer/pgbouncer:1.23.1
    container_name: aegis-pgbouncer
    hostname: aegis-pgbouncer
    environment:
      DB_USER: postgres
      DB_PASSWORD: ${POSTGRES_ADMIN_PASSWORD:-aegis_admin_dev_2024}
      DB_HOST: aegis-postgres-primary
      DB_NAME: aegis
      POOL_MODE: transaction
      MAX_CLIENT_CONN: "100"
      DEFAULT_POOL_SIZE: "20"
      ADMIN_USERS: postgres
    volumes:
      - ./infrastructure/pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
      - ./infrastructure/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
    networks:
      - nexus-data
      - nexus-obs
    depends_on:
      aegis-postgres-primary:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h localhost -p 6432 -U postgres || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

  aegis-keycloak:
    image: quay.io/keycloak/keycloak:26.0.5
    container_name: aegis-keycloak
    hostname: aegis-keycloak
    command: start-dev
    environment:
      # CRITICAL: Keycloak must use PostgreSQL backend, NOT H2
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://aegis-postgres-primary:5432/keycloak
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: ${POSTGRES_ADMIN_PASSWORD:-aegis_admin_dev_2024}
      KC_DB_SCHEMA: public
      KC_HOSTNAME: localhost
      KC_HOSTNAME_STRICT: "false"
      KC_HOSTNAME_STRICT_HTTPS: "false"
      KC_HTTP_ENABLED: "true"
      KC_HTTP_PORT: "8080"
      KC_METRICS_ENABLED: "true"
      KC_HEALTH_ENABLED: "true"
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-keycloak_admin_dev_2024}
    networks:
      - nexus-app
      - nexus-obs
    depends_on:
      aegis-postgres-primary:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/health/ready || exit 1"]
      interval: 30s
      timeout: 15s
      retries: 10
      start_period: 120s

  # ============================================================
  # LAYER 4: AI Inference Services (depend on Layer 3)
  # ============================================================

  aegis-bge:
    build:
      context: ./services/bge-embedding
      dockerfile: Dockerfile
    container_name: aegis-bge
    hostname: aegis-bge
    environment:
      MODEL_NAME: BAAI/bge-base-en-v1.5
      PORT: "8002"
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    networks:
      - nexus-ai
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8002/health || exit 1"]
      interval: 30s
      timeout: 15s
      retries: 5
      start_period: 90s

  aegis-deberta:
    build:
      context: ./services/deberta-nli
      dockerfile: Dockerfile
    container_name: aegis-deberta
    hostname: aegis-deberta
    environment:
      NLI_MODEL_NAME: cross-encoder/nli-deberta-v3-large
      RERANKER_MODEL_NAME: cross-encoder/ms-marco-MiniLM-L-12-v2
      PORT: "8001"
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    networks:
      - nexus-ai
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8001/health || exit 1"]
      interval: 30s
      timeout: 15s
      retries: 5
      start_period: 120s

  # ============================================================
  # LAYER 5: Ollama Model Servers (depend on Layer 4)
  # WARNING: Ollama Instance 1 (32B model) takes 2-4 minutes to load
  # ============================================================

  aegis-ollama-main:
    image: ollama/ollama:0.4.1
    container_name: aegis-ollama-main
    hostname: aegis-ollama-main
    environment:
      # CRITICAL: Never unload models from RAM
      OLLAMA_KEEP_ALIVE: "-1"
      # Main model gets most CPU threads
      OLLAMA_NUM_THREAD: "10"
    volumes:
      # Shared model storage — all three instances share downloaded models
      - aegis-ollama-models:/root/.ollama
    networks:
      - nexus-ai
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:11434/api/tags || exit 1"]
      interval: 30s
      timeout: 15s
      retries: 10
      start_period: 30s

  aegis-ollama-judge:
    image: ollama/ollama:0.4.1
    container_name: aegis-ollama-judge
    hostname: aegis-ollama-judge
    environment:
      OLLAMA_KEEP_ALIVE: "-1"
      OLLAMA_NUM_THREAD: "3"
    volumes:
      - aegis-ollama-models:/root/.ollama
    networks:
      - nexus-ai
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:11434/api/tags || exit 1"]
      interval: 30s
      timeout: 15s
      retries: 10
      start_period: 30s

  aegis-ollama-vision:
    image: ollama/ollama:0.4.1
    container_name: aegis-ollama-vision
    hostname: aegis-ollama-vision
    environment:
      OLLAMA_KEEP_ALIVE: "-1"
      OLLAMA_NUM_THREAD: "3"
    volumes:
      - aegis-ollama-models:/root/.ollama
    networks:
      - nexus-ai
      - nexus-obs
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:11434/api/tags || exit 1"]
      interval: 30s
      timeout: 15s
      retries: 10
      start_period: 30s

  # ============================================================
  # LAYER 6: Application Services (depend on Layer 5)
  # ============================================================

  aegis-fastapi:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: aegis-fastapi
    hostname: aegis-fastapi
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
    env_file:
      - .env
    volumes:
      - aegis-tmp-uploads:/tmp/aegis_uploads
    networks:
      - nexus-app
      - nexus-ai
      - nexus-data
      - nexus-obs
    depends_on:
      aegis-vault:
        condition: service_healthy
      aegis-redis-session:
        condition: service_healthy
      aegis-redis-queue:
        condition: service_healthy
      aegis-pgbouncer:
        condition: service_healthy
      aegis-qdrant:
        condition: service_healthy
      aegis-opensearch:
        condition: service_healthy
      aegis-keycloak:
        condition: service_healthy
      aegis-bge:
        condition: service_healthy
      aegis-deberta:
        condition: service_healthy
      aegis-ollama-main:
        condition: service_healthy
      aegis-ollama-judge:
        condition: service_healthy
      aegis-ollama-vision:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8000/health || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 30s

  aegis-arq:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: aegis-arq
    hostname: aegis-arq
    command: python -m arq app.workers.arq_worker.WorkerSettings
    env_file:
      - .env
    volumes:
      - aegis-tmp-uploads:/tmp/aegis_uploads
    networks:
      - nexus-app
      - nexus-ai
      - nexus-data
      - nexus-obs
    depends_on:
      aegis-vault:
        condition: service_healthy
      aegis-redis-queue:
        condition: service_healthy
      aegis-pgbouncer:
        condition: service_healthy
      aegis-qdrant:
        condition: service_healthy
      aegis-ollama-vision:
        condition: service_healthy
    restart: unless-stopped

  # ============================================================
  # LAYER 7: Edge (depends on Layer 6 — last to start)
  # ============================================================

  aegis-nginx:
    image: nginx:1.27-alpine
    container_name: aegis-nginx
    hostname: aegis-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infrastructure/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infrastructure/nginx/ssl:/etc/nginx/ssl:ro
    networks:
      - nexus-public
      - nexus-app
      - nexus-obs
    depends_on:
      aegis-fastapi:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:80/ || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  # ============================================================
  # OBSERVABILITY (start alongside Layer 2, no functional deps)
  # ============================================================

  aegis-prometheus:
    image: prom/prometheus:v2.55.0
    container_name: aegis-prometheus
    hostname: aegis-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
      - '--storage.tsdb.retention.time=15d'
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "9090:9090"
    networks:
      - nexus-obs
    restart: unless-stopped

  aegis-grafana:
    image: grafana/grafana:11.3.1
    container_name: aegis-grafana
    hostname: aegis-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-grafana_admin_dev}
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
    volumes:
      - ./infrastructure/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./infrastructure/grafana/dashboards:/var/lib/grafana/dashboards:ro
    ports:
      - "3000:3000"
    networks:
      - nexus-obs
    depends_on:
      - aegis-prometheus
    restart: unless-stopped
```

---

## FILE 2: backend/Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including curl for health checks
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU first (requires special index URL)
RUN pip install --no-cache-dir torch==2.5.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install all other Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create temp upload directory with correct permissions
RUN mkdir -p /tmp/aegis_uploads && chmod 777 /tmp/aegis_uploads

EXPOSE 8000

# Default command (can be overridden in docker-compose.yml)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

---

## FILE 3: services/bge-embedding/Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU
RUN pip install --no-cache-dir torch==2.5.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
```

---

## FILE 4: services/deberta-nli/Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU
RUN pip install --no-cache-dir torch==2.5.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
```

---

## FILE 5: services/bge-embedding/main.py

Complete implementation of the BGE embedding service.

```python
"""
AEGIS BGE Embedding Service
Wraps BAAI/bge-base-en-v1.5 as a FastAPI inference endpoint.
Produces 768-dimensional dense vectors.
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import List

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("MODEL_NAME", "BAAI/bge-base-en-v1.5")
EMBEDDING_DIMENSION = 768

# Global model instance
model: SentenceTransformer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model at startup, release at shutdown."""
    global model
    logger.info(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    # Warm up the model with a test embedding
    _ = model.encode(["warm up"], normalize_embeddings=True)
    logger.info(f"Embedding model loaded. Dimension: {EMBEDDING_DIMENSION}")
    yield
    logger.info("Embedding service shutting down")
    model = None


app = FastAPI(title="AEGIS BGE Embedding Service", version="1.0.0", lifespan=lifespan)


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedSingleRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimension: int


class EmbedSingleResponse(BaseModel):
    embedding: List[float]
    dimension: int


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": MODEL_NAME, "dimension": EMBEDDING_DIMENSION}


@app.post("/embed", response_model=EmbedResponse)
async def embed_batch(request: EmbedRequest):
    """Embed a batch of texts. Returns 768-dim vectors."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not request.texts:
        raise HTTPException(status_code=400, detail="texts list cannot be empty")
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts per batch")

    embeddings = model.encode(
        request.texts,
        normalize_embeddings=True,
        show_progress_bar=False
    )
    return EmbedResponse(
        embeddings=embeddings.tolist(),
        dimension=EMBEDDING_DIMENSION
    )


@app.post("/embed-single", response_model=EmbedSingleResponse)
async def embed_single(request: EmbedSingleRequest):
    """Embed a single text. Returns one 768-dim vector."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    embedding = model.encode(
        [request.text],
        normalize_embeddings=True,
        show_progress_bar=False
    )[0]
    return EmbedSingleResponse(
        embedding=embedding.tolist(),
        dimension=EMBEDDING_DIMENSION
    )
```

---

## FILE 6: services/deberta-nli/main.py

Complete implementation of the DeBERTa NLI and cross-encoder service.

```python
"""
AEGIS DeBERTa NLI and Cross-Encoder Service
Provides NLI entailment scoring (Tier 2 validation) and
cross-encoder reranking (Stage 7 of retrieval pipeline).
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import pipeline
from sentence_transformers import CrossEncoder

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

NLI_MODEL_NAME = os.getenv("NLI_MODEL_NAME", "cross-encoder/nli-deberta-v3-large")
RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-12-v2")

# Global model instances
nli_pipeline = None
reranker_model: CrossEncoder = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nli_pipeline, reranker_model
    logger.info(f"Loading NLI model: {NLI_MODEL_NAME}")
    nli_pipeline = pipeline(
        "zero-shot-classification",
        model=NLI_MODEL_NAME,
        device=-1  # CPU
    )
    logger.info(f"Loading reranker model: {RERANKER_MODEL_NAME}")
    reranker_model = CrossEncoder(RERANKER_MODEL_NAME, max_length=512)
    logger.info("NLI and reranker models loaded")
    yield
    nli_pipeline = None
    reranker_model = None


app = FastAPI(title="AEGIS DeBERTa NLI Service", version="1.0.0", lifespan=lifespan)


class NLIRequest(BaseModel):
    hypothesis: str
    premises: List[str]  # Each premise must be max 350 tokens


class NLIScore(BaseModel):
    premise_index: int
    entailment: float
    neutral: float
    contradiction: float


class NLIResponse(BaseModel):
    scores: List[NLIScore]
    max_entailment: float


class NLIPair(BaseModel):
    hypothesis: str
    premise: str


class NLIBatchRequest(BaseModel):
    pairs: List[NLIPair]


class NLIBatchResult(BaseModel):
    entailment: float
    neutral: float
    contradiction: float


class NLIBatchResponse(BaseModel):
    results: List[NLIBatchResult]


class RerankRequest(BaseModel):
    query: str
    passages: List[str]


class RerankResponse(BaseModel):
    scores: List[float]


@app.get("/health")
async def health():
    if nli_pipeline is None or reranker_model is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    return {"status": "healthy", "nli_model": NLI_MODEL_NAME, "reranker_model": RERANKER_MODEL_NAME}


@app.post("/nli", response_model=NLIResponse)
async def nli_evaluate(request: NLIRequest):
    """
    Evaluate whether each premise entails the hypothesis.
    Returns ENTAILMENT, NEUTRAL, CONTRADICTION scores for each premise.
    """
    if nli_pipeline is None:
        raise HTTPException(status_code=503, detail="NLI model not loaded")
    if not request.hypothesis.strip():
        raise HTTPException(status_code=400, detail="hypothesis cannot be empty")
    if not request.premises:
        raise HTTPException(status_code=400, detail="premises list cannot be empty")

    scores = []
    max_entailment = 0.0

    for i, premise in enumerate(request.premises):
        if not premise.strip():
            scores.append(NLIScore(premise_index=i, entailment=0.0, neutral=1.0, contradiction=0.0))
            continue

        result = nli_pipeline(
            premise,
            candidate_labels=[request.hypothesis],
            hypothesis_template="{}",
            multi_label=False
        )

        # The nli_pipeline for zero-shot returns label-score pairs
        # We map to entailment/neutral/contradiction
        label_scores = dict(zip(result["labels"], result["scores"]))

        # For NLI deberta: entailment = 1 (true), neutral = 0.5 (uncertain), contradiction = 0 (false)
        # Use the top label as entailment indicator
        top_label = result["labels"][0]
        top_score = result["scores"][0]

        if top_label.lower() in ["entailment", "true", "yes"]:
            ent_score = top_score
            neut_score = result["scores"][1] if len(result["scores"]) > 1 else 0.0
            cont_score = result["scores"][2] if len(result["scores"]) > 2 else 0.0
        elif top_label.lower() in ["neutral", "uncertain"]:
            ent_score = result["scores"][2] if len(result["scores"]) > 2 else 0.0
            neut_score = top_score
            cont_score = result["scores"][1] if len(result["scores"]) > 1 else 0.0
        else:
            ent_score = result["scores"][2] if len(result["scores"]) > 2 else 0.0
            neut_score = result["scores"][1] if len(result["scores"]) > 1 else 0.0
            cont_score = top_score

        score = NLIScore(
            premise_index=i,
            entailment=round(ent_score, 4),
            neutral=round(neut_score, 4),
            contradiction=round(cont_score, 4)
        )
        scores.append(score)
        max_entailment = max(max_entailment, ent_score)

    return NLIResponse(scores=scores, max_entailment=round(max_entailment, 4))


@app.post("/rerank", response_model=RerankResponse)
async def rerank_passages(request: RerankRequest):
    """
    Score query-passage pairs using ms-marco-MiniLM-L-12-v2.
    Used by the Retrieval Engine Stage 7 (cross-encoder reranking).
    """
    if reranker_model is None:
        raise HTTPException(status_code=503, detail="Reranker model not loaded")
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="query cannot be empty")
    if not request.passages:
        raise HTTPException(status_code=400, detail="passages list cannot be empty")

    pairs = [[request.query, passage] for passage in request.passages]
    scores = reranker_model.predict(pairs, show_progress_bar=False)

    # Convert numpy float32 to Python float
    return RerankResponse(scores=[round(float(s), 4) for s in scores])
```

---

## FILE 7: infrastructure/nginx/nginx.conf

```nginx
# AEGIS Nginx Configuration
# TLS 1.3 only, rate limiting, reverse proxy to FastAPI

events {
    worker_connections 1024;
}

http {
    # Rate limiting zone: 60 requests per minute per user
    # Key: Authorization header (JWT token)
    limit_req_zone $http_authorization zone=aegis_ratelimit:10m rate=60r/m;

    # Upstream FastAPI application
    upstream aegis_backend {
        server aegis-fastapi:8000;
        keepalive 32;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name _;

        # TLS Configuration — TLS 1.3 only
        ssl_certificate /etc/nginx/ssl/aegis.crt;
        ssl_certificate_key /etc/nginx/ssl/aegis.key;
        ssl_protocols TLSv1.3;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security headers
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options DENY always;
        add_header Strict-Transport-Security "max-age=31536000" always;

        # Maximum request body size (50MB for document uploads)
        client_max_body_size 50m;

        # API routes — with rate limiting and burst
        location /api/ {
            # Apply rate limiting: 60/min, burst of 10 allowed
            limit_req zone=aegis_ratelimit burst=10 nodelay;
            limit_req_status 429;

            # Validate Content-Type for chat endpoint
            if ($request_method = POST) {
                set $content_ok 0;
                if ($content_type ~ "application/json") { set $content_ok 1; }
                if ($content_type ~ "multipart/form-data") { set $content_ok 1; }
                # Note: WebSocket upgrade handled separately below
            }

            proxy_pass http://aegis_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 180s;
            proxy_connect_timeout 10s;
        }

        # Admin API routes
        location /admin/ {
            limit_req zone=aegis_ratelimit burst=10 nodelay;
            limit_req_status 429;

            proxy_pass http://aegis_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
        }

        # Health check (no rate limiting)
        location /health {
            proxy_pass http://aegis_backend;
            proxy_read_timeout 10s;
        }

        # Frontend static files and Next.js routes
        location / {
            proxy_pass http://aegis-fastapi:3000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_read_timeout 30s;
        }

        # Block undefined paths
        location ~* \.(php|asp|aspx|cgi)$ {
            return 404;
        }
    }
}
```

---

## FILE 8: infrastructure/pgbouncer/pgbouncer.ini

```ini
[databases]
; Main application database
aegis = host=aegis-postgres-primary port=5432 dbname=aegis pool_size=20
; Keycloak database
keycloak = host=aegis-postgres-primary port=5432 dbname=keycloak pool_size=5

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 5
server_idle_timeout = 600
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
stats_period = 60
```

---

## FILE 9: infrastructure/pgbouncer/userlist.txt

```
"postgres" "SCRAM-SHA-256$4096:your_admin_password_hash_here"
```

**IMPORTANT:** The agent must generate the actual password hash for this file. After creating this file, run:
```bash
# Generate the correct hash entry for pgbouncer
docker run --rm postgres:16.4-alpine \
  psql -c "SELECT concat('\"postgres\" \"', passwd, '\"') FROM pg_shadow WHERE usename='postgres';" || \
  echo "Use: echo '\"postgres\" \"md5$(echo -n aegis_admin_dev_2024postgres | md5sum | cut -d' ' -f1)\"'"
```

For the demo, use MD5 format:
```
"postgres" "md5COMPUTED_HASH_HERE"
```
The hash is computed as: `md5(password + username)` where username is `postgres`.

A simpler alternative for the demo: configure pgbouncer to use `auth_type = plain` and use the plaintext password:
```
"postgres" "aegis_admin_dev_2024"
```

Update `pgbouncer.ini` to use `auth_type = plain` for the demo configuration.

---

## FILE 10: infrastructure/prometheus/prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

scrape_configs:
  - job_name: 'aegis-fastapi'
    static_configs:
      - targets: ['aegis-fastapi:8000']
    metrics_path: '/metrics'

  - job_name: 'aegis-bge'
    static_configs:
      - targets: ['aegis-bge:8002']
    metrics_path: '/metrics'

  - job_name: 'aegis-deberta'
    static_configs:
      - targets: ['aegis-deberta:8001']
    metrics_path: '/metrics'

  - job_name: 'aegis-qdrant'
    static_configs:
      - targets: ['aegis-qdrant:6333']
    metrics_path: '/metrics'

  - job_name: 'aegis-redis-session'
    static_configs:
      - targets: ['aegis-redis-session:6379']

  - job_name: 'aegis-redis-queue'
    static_configs:
      - targets: ['aegis-redis-queue:6379']
```

---

## FILE 11: infrastructure/grafana/provisioning/datasources.yml

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://aegis-prometheus:9090
    isDefault: true
    editable: false
```

---

## FILE 12: infrastructure/grafana/provisioning/dashboards.yml

```yaml
apiVersion: 1
providers:
  - name: AEGIS Dashboards
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
```

---

## VERIFICATION STEPS FOR THIS SESSION

### Step 1: Validate Docker Compose syntax
```bash
docker compose config
```
Expected: Outputs the full resolved configuration without errors.

### Step 2: Start all services
```bash
docker compose up -d
```
Expected: All 19 containers start without error.

### Step 3: Monitor startup progress
```bash
# Watch all containers reach healthy state
watch docker compose ps
```
Expected: All containers show "healthy" status. This will take 5-10 minutes for the full stack due to Ollama model loading (Qwen2.5-32B takes 2-4 minutes).

### Step 4: Verify each service individually
```bash
# Check all containers are running
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Verify specific critical services
curl -sf http://localhost:9090 | head -5         # Prometheus
curl -sf http://localhost:3000 | head -5         # Grafana
docker exec aegis-redis-session redis-cli ping   # Redis Session
docker exec aegis-redis-queue redis-cli ping     # Redis Queue
docker exec aegis-qdrant curl -sf http://localhost:6333/healthz  # Qdrant
docker exec aegis-opensearch curl -sf http://localhost:9200/_cluster/health  # OpenSearch
docker exec aegis-postgres-primary pg_isready -U postgres  # PostgreSQL
```

### Step 5: Verify Redis configuration
```bash
# Redis Instance 1: must have maxmemory=6gb, allkeys-lru, no appendonly
docker exec aegis-redis-session redis-cli config get maxmemory
docker exec aegis-redis-session redis-cli config get maxmemory-policy
docker exec aegis-redis-session redis-cli config get appendonly

# Redis Instance 2: must have maxmemory=1gb, noeviction, appendonly yes
docker exec aegis-redis-queue redis-cli config get maxmemory
docker exec aegis-redis-queue redis-cli config get maxmemory-policy
docker exec aegis-redis-queue redis-cli config get appendonly
```

Expected Redis Instance 1:
- maxmemory: 6442450944 (6GB in bytes)
- maxmemory-policy: allkeys-lru
- appendonly: no

Expected Redis Instance 2:
- maxmemory: 1073741824 (1GB in bytes)
- maxmemory-policy: noeviction
- appendonly: yes

### Step 6: Verify OpenSearch JVM heap
```bash
docker exec aegis-opensearch curl -sf http://localhost:9200/_nodes/stats/jvm | python3 -c "
import json, sys
data = json.load(sys.stdin)
for node_id, node in data['nodes'].items():
    heap = node['jvm']['mem']
    print(f'Heap max: {heap[\"heap_max_in_bytes\"] / (1024**3):.1f} GB')
"
```
Expected: Shows approximately 2.0 GB heap max.

### Step 7: Verify Ollama KEEP_ALIVE
```bash
docker exec aegis-ollama-main env | grep OLLAMA_KEEP_ALIVE
docker exec aegis-ollama-judge env | grep OLLAMA_KEEP_ALIVE
docker exec aegis-ollama-vision env | grep OLLAMA_KEEP_ALIVE
```
Expected: All three show `OLLAMA_KEEP_ALIVE=-1`

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-03: Docker infrastructure - all 19 services healthy"
```

Update DECISIONS_LOG.md with:
- All services started successfully
- PostgreSQL replica synchronisation confirmed
- Keycloak connected to PostgreSQL confirmed
- Redis configurations verified
- OpenSearch JVM heap verified
- Any services that required modified configuration

---

*Document version: 1.0 | AEGIS Specification Set*
