# VERIFY_03: ARCHITECTURAL COMPLIANCE
## Final Checklist Before Demo

---

Run this checklist manually after all 20 implementation sessions are complete.

```bash
# ────────────────────────────────────────────────────────────
# RUN THE COMPLETE VERIFICATION SCRIPT:
# ────────────────────────────────────────────────────────────
cd backend && source venv/bin/activate
python scripts/verify_health.py
```

## CRITICAL REQUIREMENTS (must ALL be true)

### Data Layer
- [ ] All four Qdrant collections exist with vectors of exactly 768 dimensions
- [ ] Both Redis instances show correct maxmemory (6GB + 1GB)
- [ ] Redis Instance 1: appendonly=no (no persistence)
- [ ] Redis Instance 2: appendonly=yes (AOF persistence)
- [ ] OpenSearch index `sap_documents` exists with `sap_analyzer` custom analyzer
- [ ] All 13 PostgreSQL tables exist in the `aegis` database
- [ ] `audit_log` table: UPDATE and DELETE permissions revoked for aegis_app_role
- [ ] `keycloak` database exists on PostgreSQL primary
- [ ] PgBouncer connects and proxies correctly (pool_mode=transaction, pool=20)
- [ ] PostgreSQL replica replicating from primary (streaming replication active)

### AI Services
- [ ] BGE service returns 768-dim vectors from /embed-single
- [ ] DeBERTa NLI service returns entailment scores from /nli
- [ ] DeBERTa reranker returns scores from /rerank
- [ ] Qwen2.5-32B responds to test prompt on aegis-ollama-main
- [ ] Qwen2.5-7B responds to test prompt on aegis-ollama-judge
- [ ] Qwen2.5-VL-7B responds to image test on aegis-ollama-vision
- [ ] All three Ollama instances show KEEP_ALIVE=-1 (permanent model load)

### Security
- [ ] Keycloak realm `aegis-realm` exists with two clients and two roles
- [ ] ROPC flow works for employee1 (role=employee) and itadmin1 (role=it-admin)
- [ ] JWT verification working (authenticated request returns 200, unauthenticated returns 401)
- [ ] JWT revocation set working (revoked JTI rejected on next request)
- [ ] Nginx serves HTTPS on port 443 with TLS 1.3 only
- [ ] SAP injection patterns block "ignore your previous instructions"
- [ ] Output governance blocks 172.x.x.x IPs in generated text
- [ ] Rate limiting enforced (60 req/min per user)

### Pipeline Logic
- [ ] Mode A (registry hit): registry_result.linked_document_id used for direct fetch
- [ ] Mode B (default): standard Qdrant + OpenSearch search
- [ ] Mode C (complex): all three collections searched + diversity bonus applied
- [ ] CRAG skip: Mode A + score > 0.82 → SKIPPED
- [ ] CRAG skip: Mode B + score > 0.80 → SKIPPED
- [ ] CRAG no-skip: Mode C → assessment is SUFFICIENT or INSUFFICIENT (never SKIPPED)
- [ ] Stage 7 (reranking) executes BEFORE Stage 6 (CRAG) in the pipeline
- [ ] ValidationScore formula: (NLI*0.45 + faith*0.30 + complete*0.25) * freshness
- [ ] Freshness coefficient: 90 days → 1.00, 91 days → 0.95, 366 days → 0.75
- [ ] Green badge ≥ 0.85, amber 0.70-0.84, none < 0.70 (triggers regeneration)

### Frontend
- [ ] Login page accessible at /login
- [ ] Employee login redirects to chat interface
- [ ] Chat interface connects via WebSocket and shows "Connected"
- [ ] Typing a message shows it in the chat immediately
- [ ] Response streams token-by-token (progressive display)
- [ ] Confidence badge appears after streaming completes
- [ ] Attribution panel shows primary document ID
- [ ] Thumbs up/down buttons appear and submit feedback
- [ ] Screenshot upload button opens file picker (JPEG/PNG only)
- [ ] /admin/* redirects employees to / (chat), allows it-admin through

### Observability
- [ ] GET /metrics returns Prometheus metrics with aegis_* prefix
- [ ] Grafana at port 3000 shows AEGIS Quality Dashboard with 8 panels
- [ ] Panels show data after at least one query is processed

---
