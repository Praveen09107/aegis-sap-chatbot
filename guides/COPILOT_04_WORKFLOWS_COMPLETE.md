# COPILOT_04 — AEGIS COMPLETE SYSTEM WORKFLOWS
## Every major flow traced step by step from trigger to completion

---

## WORKFLOW 1 — EMPLOYEE CHAT REQUEST (16 stages)

This is the primary workflow. Every employee question goes through all 16 stages.

**Trigger:** Employee types a question in the Next.js chat interface and presses Send.

---

**Stage 1: WebSocket Message Received**
- Frontend sends JSON over WebSocket connection: `{session_id, query, attachments: []}`
- chat_handler.py receives the message on the /ws/chat endpoint
- A unique request_id (UUID) and trace_id are generated and attached to all subsequent log entries

**Stage 2: Authentication Validation**
- authentication middleware already validated the WebSocket upgrade request
- The user_id and role extracted from JWT are available on the connection state
- If session is expired (JWT revoked, found in Redis Queue revocation set), WebSocket is closed with 4001 code
- The employee role is confirmed — admin-only queries are not accepted here

**Stage 3: Input Governance**
- input_governance middleware inspects the query text
- Blocked patterns: attempts to extract system prompts, questions about database credentials or Vault paths, injections attempting to override instructions, off-topic requests (not SAP-related)
- If blocked: WebSocket sends `{type: "error", code: "GOVERNANCE_BLOCKED", message: "..."}` and does not proceed
- Rate limiting: sliding window check in Redis Instance 1. If employee exceeds limit, send `{type: "error", code: "RATE_LIMITED"}`

**Stage 4: Session State Retrieval**
- session_service.py retrieves conversation state from Redis Instance 1 by session_id
- ConversationState contains: message history (last N turns), entity context (SAP entities mentioned in this session), session metadata
- If no session exists (new conversation), a new ConversationState is created

**Stage 5: Semantic Cache Check**
- query_intelligence.py normalises the query (lowercase, remove filler words, standardise SAP entity spelling)
- BGE embedding service called: POST aegis-bge:8002/embed-single, body: {text: normalised_query}
- Returns: 768-dimensional float32 vector
- Qdrant searched against cache_queries collection with this vector, threshold: 0.88 cosine similarity
- If cache HIT: the cached answer is retrieved from Qdrant payload and returned directly via WebSocket as `{type: "cached_response", response: {...}, confidence: ...}`
- **If cache hit, stages 6–14 are skipped**
- If cache MISS: continue to Stage 6

**Stage 6: Query Intelligence — Entity Extraction**
- query_intelligence.py analyses the query for SAP entities:
  * T-codes: regex pattern `[A-Z]{1,4}[0-9]{1,2}[A-Z]?` matches VL01N, FB50, ME21N
  * Error codes: patterns like VL150, M7007, F5263
  * Transaction names: "delivery order", "purchase requisition", "goods issue"
  * Field names: "plant", "storage location", "posting key"
- Context resolution: if query references "this transaction" or "this error", resolve to entity from session history
- Synonym expansion: map "goods receipt" → MB1C, MB01; "invoice" → VF01, VF02

**Stage 7: Query Intelligence — Content Type Routing**
- Based on extracted entities, determines which Qdrant collections to search:
  * Error codes present → search meridian_errors
  * Procedure keywords present ("how to", "steps to") → search meridian_procedures
  * Config keywords ("setting", "field value", "configuration") → search meridian_configs
  * Ambiguous → search all three collections in parallel
- Complexity classification: determines Tier 1 (judge model, faster) or Tier 2 (main model, thorough)
  * Tier 1: simple lookup ("what does VL150 mean?")
  * Tier 2: multi-step or analytical ("why does VL150 happen only in plant 1001?")

**Stage 8: Tri-Modal Retrieval — Parallel Search**
- All three searches execute concurrently via asyncio.gather:

  **8a. Dense vector search (Qdrant HNSW):**
  - Query vector (from Stage 5) searched against appropriate collections
  - Algorithm: HNSW (Hierarchical Navigable Small World) approximate nearest neighbour
  - Returns top_k=20 most similar chunks with cosine similarity scores

  **8b. Sparse vector search (Qdrant sparse):**
  - Same query text passed to Qdrant sparse vector search
  - BGE-M3 sparse representation captures term-level precision
  - Returns top_k=20 with BM25-like relevance scores

  **8c. BM25 keyword search (OpenSearch):**
  - Query text searched against aegis_knowledge index
  - SAP-specific analyzer: tokenises T-codes, error codes correctly
  - Boolean query with field boosting: error_codes field boosted 3x, title boosted 2x, content 1x
  - Returns top_k=20 documents

  **8d. Knowledge graph traversal (PostgreSQL):**
  - For any document IDs already found in 8a/8b/8c that have related_document_ids in document_relationships table
  - Fetches related chunks that provide additional context
  - Example: error guide for VL150 linked to the procedure for creating delivery documents

**Stage 9: RRF Fusion**
- Reciprocal Rank Fusion merges the four result lists into a single ranked list
- Formula: RRF_score = Σ (1 / (k + rank)) where k=60, sum over all lists where document appears
- Higher RRF score = appeared consistently near the top across multiple retrieval methods
- Produces unified ranked list of unique chunks

**Stage 10: CRAG Self-Reflection**
- CRAG (Corrective Retrieval Augmented Generation) assessor evaluates retrieval quality
- model_gateway.py called with tier="judge", a prompt that asks:
  * "Given this query and these retrieved chunks, rate the relevance on a scale of HIGH/MEDIUM/LOW"
  * "Are the retrieved chunks actually answering what was asked?"
- If HIGH relevance: proceed to Stage 11 with current chunks
- If MEDIUM: expand retrieval with additional queries (rephrase and re-retrieve)
- If LOW: flag as "low confidence retrieval", add disclaimer to final response, still attempt answer

**Stage 11: Cross-Encoder Reranking**
- ms-marco-MiniLM-L-12-v2 cross-encoder reranks the CRAG-approved chunks
- Cross-encoder: unlike bi-encoder (BGE), it scores (query, chunk) pairs jointly for higher accuracy
- Final top_k=8 chunks selected after reranking
- These 8 chunks are the "gold chunks" used for answer generation

**Stage 12: Parent Chunk Hydration**
- Each of the 8 selected chunks has a parent_chunk_id in its Qdrant payload
- PostgreSQL queried for parent chunk text (section headers, document titles, overview paragraphs)
- Parent chunk text prepended to child chunk: `[SECTION: Delivery Processing > Error Handling]\n[CHUNK: VL150 occurs when...`
- This provides context that the child chunk alone might lack

**Stage 13: Answer Generation**
- Prompt assembled: conversation history + SAP entities + 8 hydrated chunks + current query
- model_gateway.py routes to correct model based on tier classification from Stage 7
  * Tier 1: OLLAMA_JUDGE_URL (qwen2.5:7b-instruct)
  * Tier 2: OLLAMA_MAIN_URL (qwen2.5:32b)
- Streaming generation: model response tokens streamed via async generator
- Each token sent to frontend immediately via WebSocket: `{type: "token", content: "..."}`
- Full response assembled as streaming completes

**Stage 14: Three-Tier Validation**
(Parallel to streaming — validation runs on completed response while user reads it)

  **Tier 1 — Deterministic (microseconds):**
  - Output leak check: response does not contain DB connection strings, Vault paths, internal hostnames, or other sensitive internal patterns (regex-based)
  - Scope boundary: response is SAP-related, not about unrelated topics
  - T-code policy: if response mentions sensitive T-codes (access to payroll, user administration), adds appropriate warning
  - If Tier 1 FAILS: response is replaced with governance block message

  **Tier 2 — DeBERTa NLI (seconds):**
  - Response decomposed into individual factual claims
  - Each claim: POST aegis-deberta:8001/nli with {premise: source_chunk_text, hypothesis: claim}
  - Claims with entailment score < 0.70 are flagged as "potentially unsupported"
  - Flagged claims added to attribution panel as warnings

  **Tier 3 — LLM Judge (seconds, runs after streaming completes):**
  - qwen2.5:7b-instruct evaluates the complete answer holistically
  - Assessment prompt: "Does this answer correctly address the question? Is it consistent with the provided sources? Rate: PASS/PARTIAL/FAIL with explanation"
  - PASS: confidence_score = 0.85–1.0
  - PARTIAL: confidence_score = 0.60–0.84, add caveat to response
  - FAIL: confidence_score < 0.60, response marked as low confidence, sent to review queue ARQ task

**Stage 15: Freshness Check and Attribution Construction**
- For each of the 8 source chunks, check payload.freshness_date against config snapshot thresholds
- Chunks older than staleness threshold (typically 90 days for config) flagged as potentially stale
- Attribution panel constructed:
  * Source list: [{chunk_id, document_title, section_name, chunk_type, content_preview, confidence, is_stale}]
  * Confidence badge: computed from Tier 2 + Tier 3 scores combined
  * Freshness indicators: warning icons on stale sources

**Stage 16: Response Delivery and Async Tasks**
- Final WebSocket message: `{type: "complete", response: full_text, attribution_panel: [...], confidence_score: 0.XX, warnings: [...]}`
- Three ARQ tasks dispatched to Redis Queue simultaneously (fire-and-forget):
  * audit_task: write to audit_log table (who asked what, when, what was the answer summary)
  * cache_task: if confidence_score > 0.80, store query+answer in cache_queries Qdrant collection
  * feedback_task: if Tier 3 was FAIL, create knowledge_gap_event and admin_notification
- Session state updated in Redis Instance 1 with this turn added to history

---

## WORKFLOW 2 — DOCUMENT INGESTION (11 stages)

**Trigger:** IT admin uploads a DOCX or PDF file via the admin portal Documents page.

---

**Stage 1: File Upload**
- Admin selects file in /admin/documents page
- Next.js /api/upload/document route receives multipart form data
- File streamed to FastAPI upload_handler.py
- Validation: file extension (.docx, .pdf), MIME type check via magic bytes, size limit (50MB)
- File stored to MinIO aegis-documents bucket with key: `uploads/{UUID}/{filename}`
- Record created in documents_registry table: status=QUEUED
- ARQ task ingest_document dispatched to Redis Queue with document_id

**Stage 2: Content Extraction**
- ingest_document ARQ task begins in aegis-arq container
- For DOCX: python-docx extracts paragraphs, headings, tables, preserving hierarchy
- For PDF: pdfplumber extracts text with position metadata, preserves tables as structured text
- Extracted content normalised: Windows line endings → Unix, multiple spaces → single, non-UTF-8 chars escaped

**Stage 3: Content Classification**
- Rule-based classifier determines document type:
  * error_guide: document title contains "error" or "VL" + number pattern, or document has "Error Code", "Resolution" sections
  * procedure: document has numbered steps, "How To" title pattern, or sequential step structure
  * config: document has field definitions table structure, or "Configuration", "Settings" in title
- Classification stored in documents_registry.content_type

**Stage 4: Template-Aware Chunking**
- Chunking strategy varies by content_type:
  * error_guide: one chunk per error code section (symptom + root cause + resolution kept together)
  * procedure: one chunk per 2-3 steps (steps kept together for context), plus overview chunk
  * config: one chunk per field definition row, plus grouped chunks by functional area
- Each chunk includes: text, chunk_type, parent section reference, position in document

**Stage 5: SAP Entity Extraction**
- Each chunk analysed for SAP entities:
  * T-codes: regex `\b[A-Z]{1,4}[0-9]{1,2}[A-Z]?\b` validated against known SAP T-code patterns
  * Error codes: `\b[A-Z]{1,2}[0-9]{3,5}\b` patterns
  * Field names: extracted from field definition patterns, table column headers
  * Module: inferred from T-codes (VL* → Logistics, FB* → Finance, ME* → Procurement)
- Entity metadata attached to each chunk for query routing

**Stage 6: Vision Processing (if screenshots present)**
- vision_integration.py checks if DOCX contains embedded images or if PDF has image pages
- If images found: vision_task ARQ task dispatched
- vision_task extracts images from document, calls ollama_vision.py classify_sap + extract_sap_content
- Extracted text from screenshots appended to the relevant surrounding chunk

**Stage 7: BGE Embedding**
- Each chunk text sent to aegis-bge:8002/embed
- Returns 768-dimensional float32 vector
- Batch embedding for efficiency: up to 32 chunks per API call

**Stage 8: Quality Scoring**
- Each chunk scored on:
  * length_score: penalise very short (<50 chars) or very long (>2000 chars) chunks
  * entity_score: bonus for chunks with verified SAP entities
  * structure_score: bonus for chunks that are well-structured (complete sentences, proper SAP formatting)
- Overall quality_score: weighted combination, range 0.0–1.0

**Stage 9: Semantic Deduplication**
- Each chunk's embedding compared against existing Qdrant entries in the same collection
- Cosine similarity threshold: 0.95 (near-identical content flagged as duplicate)
- Duplicate chunks: skipped (not indexed), older version marked for review

**Stage 10: Qdrant Insertion**
- New chunks upserted into appropriate Qdrant collection (meridian_errors/procedures/configs)
- Each point: {id: UUID, vectors: {dense: [...], sparse: [...]}, payload: {all metadata}}
- Sparse vectors calculated using keyword weighting (not BGE-M3 model, simplified sparse representation for this version)

**Stage 11: OpenSearch Indexing**
- Each chunk indexed in aegis_knowledge index
- Document body: {chunk_id, content_type, title, chunk_text, module, sap_entities, source_type, version}
- knowledge_graph_builder creates document_relationships edges between chunks from the same document
- documents_registry record updated: status=INDEXED, chunk_count=N, indexed_at=now()
- Admin notification created: "Document 'DOCX_name.docx' successfully indexed — N chunks available"

---

## WORKFLOW 3 — QUICK ENTRY FORM SUBMISSION (Stages A1–A13)

**Trigger:** IT admin submits a Quick Entry form in the admin portal.

---

**A1: API Request Received**
- POST /api/admin/knowledge-entries received by knowledge_entries.py router
- Request body: {content_type, title, module, form_data: {...}, tags: [...]}

**A2: Rate Limiting**
- Rate limiting dependency checks Redis Instance 1: admin endpoints allow 60 Quick Entry creations per hour per user
- Prevents accidental duplicate submissions through rapid clicking

**A3: Form Schema Validation**
- form_validator.py validates form_data against the content_type-specific schema:
  * error_guide requires: error_code (format validated), error_title, module, symptoms (non-empty array), root_causes (non-empty array), resolution_steps (non-empty array with is_verified boolean)
  * procedure requires: procedure_title, module, prerequisites (array), steps (array with step_number, description, sub_steps), expected_outcome
  * config requires: config_area, fields (array with field_name, current_value, allowed_values, impact_description, last_changed_date)
- Validation errors return 422 with field-specific error messages
- If valid: knowledge_form_entries record created with status=DRAFT, version=1

**A4: Coverage Search (Duplicate Check)**
- Before dispatching indexing task, check for near-duplicate existing entries
- form_validator extracts primary searchable text from form_data (error_code + title for error_guide, etc.)
- BGE embedding generated for this text
- Qdrant searched for cosine similarity > 0.92 in the appropriate collection
- If duplicates found: 200 response with {status: "POTENTIAL_DUPLICATE", similar_entries: [...]}
- Admin decides to proceed or discard in the frontend DuplicateCheckModal component
- If no duplicates: proceed to A5

**A5: SAP Entity Extraction**
- Same SAP entity extraction as document ingestion Stage 5
- Applied to all text fields in form_data
- Extracted entities stored in knowledge_form_entries.sap_entities (JSONB)
- Entities displayed in frontend SapEntityPanel component for admin review

**A6: Structure-Aware Chunking (form_chunker.py)**

For error_guide:
- Chunk 1 (overview): "{error_code}: {error_title}. {symptoms joined}."
- Chunk 2 (root_causes): "Root causes of {error_code}: {root_causes joined}."
- Chunk 3 (resolution): "To resolve {error_code}: Step 1: {step1}. Step 2: {step2}..."
- Each chunk typed as: overview_chunk, cause_chunk, resolution_chunk

For procedure:
- Chunk 1 (overview): "{procedure_title} overview. Prerequisites: {prerequisites}. Expected outcome: {expected_outcome}."
- Chunks 2–N: Groups of 3 steps each. "Steps {X}–{Y} of {procedure_title}: Step X: {description}..."
- chunk_type: overview_chunk, step_chunk

For config:
- One chunk per config field: "{field_name} (in {config_area}): Current value: {current_value}. Allowed values: {allowed_values}. Impact: {impact_description}."
- Plus grouped chunk: all fields in same config_area combined for broader search
- chunk_types: field_chunk, area_chunk

**A7: BGE Embedding**
- Each chunk embedded via aegis-bge:8002/embed
- 768-dimensional vectors returned

**A8: Quality Scoring**
- Same scoring as document ingestion Stage 8
- quality_score stored per chunk in knowledge_form_entry_chunks table

**A9: Semantic Deduplication**
- Embedding compared against existing Qdrant entries, threshold 0.95
- Duplicate detection at chunk level

**A10: Qdrant Insertion**
- Chunks inserted into appropriate Qdrant collection (meridian_errors/procedures/configs)
- Point ID stored in knowledge_form_entry_chunks.qdrant_point_id

**A11: OpenSearch Indexing**
- Chunks indexed in aegis_knowledge index
- Same structure as document ingestion Stage 11

**A12: PostgreSQL Update**
- knowledge_form_entries.status updated to INDEXED
- indexed_at, chunk_count fields set
- If gap_id was present (entry created to fill a gap): knowledge_gap_events.status updated to FILLED

**A13: Response and Notifications**
- API returns: {entry_id, status: "INDEXED", chunk_count: N, processing_time_ms: ...}
- Admin notification created: "Quick Entry '{title}' is now searchable"
- If screenshots were attached: enrich_entry_screenshots ARQ task dispatched (see Workflow 4)
- Frontend ProcessingStatusDrawer shows completion status in real time via polling

---

## WORKFLOW 4 — SCREENSHOT VISION ENRICHMENT (Stages V1–V10)

**Trigger:** enrich_entry_screenshots ARQ task dispatched after Quick Entry submission with screenshots.

---

**V1: Task Starts in ARQ Worker**
- aegis-arq picks up enrich_entry_screenshots task from Redis Queue
- Task receives: entry_id, screenshot_ids list

**V2: Screenshot Retrieval from MinIO**
- For each screenshot_id, retrieve from MinIO knowledge-screenshots bucket
- Screenshot downloaded as bytes
- knowledge_form_screenshots.vision_status updated to PROCESSING

**V3: SAP Screenshot Classification**
- ollama_vision.py.classify_sap(image_base64) called
- Model: qwen2.5vl:7b via OLLAMA_VISION_URL
- Prompt: "This is a SAP system screenshot. Classify it as one of: error_dialog, transaction_screen, report_output, configuration_screen, list_display. Reply with only the classification label."
- Returns: SAPScreenshotType enum value

**V4: Content Extraction with Type-Specific Prompt**
- ollama_vision.py.extract_sap_content(image_base64, screen_type) called
- Prompt varies by screen_type:
  * error_dialog: "Extract from this SAP error dialog: error code, error message text, and any field names shown."
  * transaction_screen: "Extract from this SAP transaction screen: transaction code shown in top-left, all field labels and their values, and the screen title."
  * configuration_screen: "Extract configuration settings: parameter names, current values, and any visible descriptions."

**V5: Structured Data Parsing**
- Model response parsed into ExtractedSAPData structure:
  * error_codes: list of extracted error codes
  * t_codes: list of extracted T-codes
  * field_names: list of field labels
  * field_values: dict of {field_name: value}
  * screen_title: string
  * message_text: string

**V6: Text Assembly for Chunk Enrichment**
- Extracted data assembled into natural language text:
  * "Screenshot shows SAP error dialog. Error code: VL150. Message: 'No delivery quantity determined'. Transaction: VL01N."
- This text is appended to the chunk text that the screenshot was attached to

**V7: Re-Embedding of Enriched Chunk**
- Enriched chunk text (original + screenshot extracted text) re-embedded via BGE service
- New 768-dimensional vector computed

**V8: Qdrant Payload Update**
- Qdrant point updated:
  * chunk_text field: updated with enriched text
  * has_screenshots: true
  * screenshot_ids: [screenshot_uuid, ...]
  * dense vector: updated with new embedding of enriched text

**V9: OpenSearch Document Update**
- OpenSearch index document updated with enriched chunk_text
- Ensures BM25 search also benefits from extracted screenshot content

**V10: Status Update and Completion**
- knowledge_form_screenshots.vision_status updated to COMPLETED
- knowledge_form_screenshots.extracted_text saved
- knowledge_form_screenshots.ocr_confidence saved
- knowledge_form_entries updated: screenshot_count, vision_enriched=true
- Admin notification: "Vision enrichment completed for '{entry_title}' — {N} screenshots processed"

---

## WORKFLOW 5 — THREE-TIER VALIDATION (Detailed)

This workflow is Stage 14 of the Employee Chat workflow. Shown separately for clarity.

**Input:** Generated answer text, list of source chunk texts, original query

**Tier 1 — Deterministic Rules (runs first, synchronous, <10ms)**

Rule 1 — Output Leak Detection:
- Regex scan of response text for patterns:
  * Database URLs: `postgresql://`, `redis://`, `mongodb://`
  * Vault paths: `/v1/secret`, `/v1/pki`
  * Internal hostnames: `aegis-postgres`, `aegis-qdrant`, `aegis-redis`
  * Connection strings, JWT secrets, API keys
- If any pattern found: BLOCK — replace response with "I cannot provide that information."

Rule 2 — Scope Boundary:
- Check if response is SAP-related
- Block if response discusses: code execution, system commands, personal data, non-SAP topics
- Uses keyword whitelist + ML-free heuristics

Rule 3 — T-code Sensitivity Policy:
- Check if response mentions sensitive T-codes: SU01 (user administration), SE38 (ABAP editor), SM59 (RFC connections)
- If found: append standard warning "This transaction requires appropriate authorisation. Please verify you have the necessary access rights."

If Tier 1 PASS: continue to Tier 2 and 3 in parallel
If Tier 1 FAIL: stop, return governance message, audit the blocked response

**Tier 2 — DeBERTa NLI Entailment (runs in background, 2-5 seconds)**

Step 1 — Claim Decomposition:
- Response split into individual factual sentences
- Filter to keep only verifiable factual claims (not conversational filler)

Step 2 — Per-Claim NLI:
- For each claim: find the most relevant source chunk (by TF-IDF match)
- POST aegis-deberta:8001/nli: {premise: source_chunk_text, hypothesis: claim}
- Response: {label: "entailment"|"neutral"|"contradiction", score: 0.0–1.0}

Step 3 — Score Aggregation:
- claims_entailed: count where label=entailment AND score > 0.70
- claims_neutral: count where label=neutral (claim not verifiable from sources)
- claims_contradicted: count where label=contradiction (CRITICAL — claim contradicts sources)
- tier2_score = claims_entailed / total_claims

Step 4 — Contradiction Handling:
- If any claim contradicted: flag response as PARTIALLY_GROUNDED
- Contradicted claims highlighted in attribution panel

**Tier 3 — LLM Judge Holistic Assessment (runs after streaming completes, 5-15 seconds)**

Prompt to qwen2.5:7b-instruct (via OLLAMA_JUDGE_URL):
```
You are evaluating an AI-generated SAP helpdesk response.
Query: {original_query}
Generated response: {full_response}
Source documents used: {source_chunks joined}

Assess: 
1. Does the response correctly and completely answer the query?
2. Is every factual claim supported by the provided sources?
3. Is the response appropriate for an enterprise helpdesk context?

Rate: PASS (answer is correct and grounded), PARTIAL (minor issues), or FAIL (significant problems)
Provide one sentence of justification.
```

Response parsed:
- PASS: tier3_score = 0.90
- PARTIAL: tier3_score = 0.70, add "Note: Some aspects of this answer may need verification."
- FAIL: tier3_score = 0.50, trigger review_queue ARQ task

**Final Confidence Score:**
- confidence_score = (tier2_score * 0.4) + (tier3_score * 0.6)
- Displayed as ConfidenceBadge in frontend: HIGH (≥0.80), MEDIUM (0.60–0.79), LOW (<0.60)

---

## WORKFLOW 6 — SEMANTIC CACHE FLOW

**Cache Population (via cache_task ARQ):**
1. Employee chat response completed with confidence_score > 0.80
2. cache_task ARQ task receives: {query_text, normalised_query, query_vector, response_text, source_chunk_ids, confidence_score}
3. Qdrant upsert to cache_queries collection:
   - Vector: query_vector (768-dim)
   - Payload: {query_text, response_text, confidence_score, source_chunk_ids, expires_at: now+24h}
4. cache_queries entry TTL managed by expires_at field (checked at retrieval time)

**Cache Retrieval (Stage 5 of Employee Chat):**
1. Current query embedded via BGE
2. Qdrant ANN search against cache_queries with cosine threshold 0.88
3. If hit: check expires_at field — expired entries ignored
4. If valid hit: return cached response with {cache_hit: true, original_query: ...}
5. Cache hit logged to audit_task (same as regular queries)
6. Cache misses do NOT populate cache (only successful high-confidence answers do)

---

## WORKFLOW 7 — FEEDBACK LOOP

**Trigger:** Employee clicks thumbs down on a response.

1. POST /api/feedback: {session_id, response_id, rating: "thumbs_down", category: "wrong_answer"|"incomplete"|"not_helpful", detail: optional string}
2. feedback_task ARQ dispatched
3. feedback_task diagnoses failure type:
   - Retrieve the original retrieval results for this response from audit_log
   - If retrieved chunks had low Tier 2 scores: diagnosis = RETRIEVAL_FAILURE
   - If retrieved chunks were good but answer was poor: diagnosis = GENERATION_FAILURE
   - If answer contradicted sources: diagnosis = HALLUCINATION
4. Based on diagnosis:
   - RETRIEVAL_FAILURE: create knowledge_gap_event (this query was not well-covered by current docs)
   - GENERATION_FAILURE: add to human_review_queue table for admin review
   - HALLUCINATION: add to human_review_queue with HIGH priority
5. Admin notification created: "New feedback requiring review: {diagnosis}"
6. feedback_events record created with diagnosis

---

## WORKFLOW 8 — KNOWLEDGE GAP CREATION AND RESOLUTION

**Gap Creation:**
1. feedback_task creates knowledge_gap_events record: {query_text, session_id, detected_at, status: "OPEN"}
2. Admin portal /admin/knowledge-gaps page shows all open gaps sorted by frequency
3. Admin clicks on a gap to see: what query triggered it, how many employees hit this gap

**Gap Resolution via Quick Entry:**
1. Admin clicks "Create Quick Entry to fill this gap" on the gap card
2. Quick Entry creation form pre-fills with gap context (gap_id attached to the new entry)
3. Admin completes form and submits
4. Quick Entry workflow (A1–A13) runs
5. At A12: knowledge_gap_events.status updated to FILLED, filled_by_entry_id set
6. Future similar queries will find the new Quick Entry content

---

## WORKFLOW 9 — SESSION STATE MACHINE

**States:** IDLE → ACTIVE → WAITING_FOR_FOLLOWUP → EXPIRED

**IDLE:** No active conversation. New session_id created when employee opens chat.

**IDLE → ACTIVE:** First message sent. ConversationState created in Redis:
```python
ConversationState(
    session_id=UUID,
    user_id=str,
    messages=[],  # empty list
    entity_context={},  # extracted entities accumulate here
    created_at=datetime,
    last_activity=datetime,
    ttl_seconds=3600
)
```

**ACTIVE:** Each turn: new message appended to messages list, entity_context updated with new entities extracted, last_activity refreshed, TTL reset to 3600 seconds.

**ACTIVE → WAITING_FOR_FOLLOWUP:** Response sent. State indicates system is waiting for employee's next input. No functional difference, used for analytics.

**WAITING_FOR_FOLLOWUP → ACTIVE:** Employee sends follow-up. Entity context from previous turns available for context resolution.

**ACTIVE → EXPIRED:** Redis TTL expires (no activity for 3600 seconds). ConversationState automatically removed by Redis. If employee returns, new session starts (no history recovery).

**Context Accumulation:**
- entity_context is the key stateful element: if employee asks "what is VL150?" then "how do I fix it?", the system knows "it" = VL150 from entity_context
- Maximum 10 turns kept in messages list (sliding window) to prevent context overflow

---

## WORKFLOW 10 — ADMIN PORTAL DATA FLOWS

**Dashboard Refresh:**
- /admin/dashboard page polls GET /api/admin/analytics every 30 seconds
- TanStack Query usePolling hook handles this
- API returns: {total_queries_today, cache_hit_rate, avg_confidence, active_gaps_count, pending_reviews_count}
- MetricCard components update with animation

**Document Ingestion Status:**
- Admin uploads document → IngestionProgressRow component shows status
- Component polls GET /api/admin/documents/{id}/status every 3 seconds
- Status transitions: QUEUED → EXTRACTING → CHUNKING → EMBEDDING → INDEXING → INDEXED
- On INDEXED: admin notification appears in AdminTopbar notification bell

**Quick Entry Real-Time Status:**
- ProcessingStatusDrawer polls GET /api/admin/knowledge-entries/{id}/processing-status every 2 seconds
- Shows: current stage (A1–A13), time elapsed, errors if any
- On completion: shows chunk count, quality score, link to entry

**System Health:**
- /admin/system-health fetches GET /api/admin/health/services
- FastAPI checks all 19 services via health endpoints
- Response: [{service_name, status: "healthy"|"degraded"|"down", latency_ms, last_checked}]
- ServiceTile components colour-coded: green/yellow/red
