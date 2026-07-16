# AEGIS Architecture Overview
## Adaptive Enterprise Grade Intelligence System — Sona Comstar

---

## System Description

AEGIS is an enterprise SAP helpdesk AI that answers employee questions about SAP
by retrieving information from internal documentation and generating validated answers.

All data stays on-premises (demo) or on a private cloud (production). No SAP data
leaves the Sona Comstar network at any point.

---

## Zone Architecture

```
Zone A — Security Perimeter
  Nginx (reverse proxy, TLS termination, rate limiting)
  Keycloak (OIDC/OAuth2 identity, JWT issuance)
  HashiCorp Vault (secrets, dynamic credentials, PKI)

Zone B — Orchestration (FastAPI + ARQ)
  FastAPI application (chat, admin, Quick Entry APIs)
  ARQ worker (async: vision enrichment, audit logs, cache, gaps)
  Content Governance Middleware (input + output filtering)

Zone C — AI Pipeline
  Query Intelligence (SAP entity extraction, context resolution)
  Retrieval Engine (dense + BM25 + CRAG + reranker)
  Model Gateway (Ollama demo / vLLM production — env var switch)
  Validation Engine (deterministic + NLI + LLM judge)
  Vision Integration (Ollama qwen2.5vl screenshot reading)

Zone D — Presentation
  Next.js (employee chat + admin portal — single application)

Zone E — Data Layer
  PostgreSQL primary + read replica + PgBouncer connection pool
  Qdrant vector DB (4 collections: errors, procedures, configs, cache)
  OpenSearch (BM25 keyword search, SAP-specific analyzer)
  Redis session store + Redis ARQ queue (two separate instances)
  MinIO object storage (documents, knowledge screenshots)

Zone F — Observability
  Prometheus (metrics from all 19 services)
  Grafana (dashboards: system health, LLM quality, retrieval quality)
```

---

## AI Models

| Model | Role | Demo | Production |
|-------|------|------|------------|
| Main generation | Writes answers | qwen2.5:32b CPU via Ollama | qwen2.5:72b GPU via vLLM |
| Judge model | Tier 3 validation | qwen2.5:7b CPU via Ollama | qwen2.5:14b GPU via vLLM |
| Vision model | Reads SAP screenshots | qwen2.5vl:7b CPU via Ollama | qwen2.5vl:72b GPU via vLLM |
| Dense embedding | 768-dim vectors | BGE-base-en-v1.5 CPU | BGE-base-en-v1.5 GPU |
| NLI validation | Tier 2 entailment | DeBERTa-v3-large-mnli CPU | same GPU |

---

## Qdrant Collections

| Collection | Content |
|------------|---------|
| meridian_errors | Error guide chunks (SAP error code documentation) |
| meridian_procedures | Procedure chunks (step-by-step SAP workflows) |
| meridian_configs | Configuration chunks (SAP settings, field values) |
| cache_queries | Semantic cache (previously answered queries) |

All vectors: 768-dimensional (BGE-base-en-v1.5)

---

## Implementation Sessions

Sessions 1–22: Base AEGIS system (IMPL_01 through IMPL_22)
Sessions 23–29: Quick Entry feature (IMPL_23 through IMPL_29)
Frontend 1–22: Employee chat + admin portal (FRONTEND_01 through FRONTEND_22)
Frontend 36–40: Quick Entry UI (FRONTEND_36 through FRONTEND_40)

---

## Production Migration

One environment variable change triggers the switch:
MODEL_BACKEND=ollama  →  MODEL_BACKEND=vllm

model_gateway.py reads this and routes all inference calls accordingly.
No Python code changes. No TypeScript changes. docker-compose.prod.yml
overrides service configs. The rest of the stack is identical.
