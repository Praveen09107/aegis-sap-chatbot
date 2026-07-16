# COPILOT_02 — RULES, STANDARDS, AND QUALITY GATES
## These rules are non-negotiable. Every rule applies to every session.

---

## SECTION 1 — THE FIVE ABSOLUTE RULES

These five rules override everything else. If following the spec would violate one of these rules, stop and report before proceeding.

**Rule 1: Spec paths are exact, not approximate.**
If the spec says create `backend/app/services/retrieval_engine.py`, that is the exact path. Not `backend/services/retrieval_engine.py`. Not `backend/app/retrieval_engine.py`. The exact path. The directory structure was built specifically to match these paths.

**Rule 2: All verifications must pass before session is complete.**
Every IMPL document ends with verification commands. Every one must return the expected output. A session where one verification fails is not a complete session. Fix the failure first.

**Rule 3: Never write placeholder code.**
No TODO comments. No `pass` statements in real functions. No `raise NotImplementedError`. No stub functions that return hardcoded values. All code must be real, working implementation.

**Rule 4: Never invent architecture.**
If something is not specified in the IMPL document, it does not get added. Do not add helpful extra endpoints, extra fields, extra middleware, extra logging. Build what is specified. Add nothing else.

**Rule 5: Apply the Ubuntu Ollama patch in IMPL_03.**
For aegis-ollama-main, aegis-ollama-judge, and aegis-ollama-vision Docker services, use bind mount `/home/pal/.ollama:/root/.ollama` — not the named volume. This is mandatory. See COPILOT_01 Section 8 and guides/UBUNTU_OLLAMA_PATCH.md.

---

## SECTION 2 — SPEC READING PROTOCOL

**Before writing a single line of code, read the entire spec document from top to bottom.**

This is not optional. Spec documents have dependencies within them — later sections explain constraints that affect earlier code. Reading partially leads to rewrites.

**Reading order within a spec:**
1. Read the session overview (what this session builds)
2. Read all file specifications (every FILE section) without writing anything
3. Read the verification section at the end to understand what success looks like
4. Read any IMPORTANT or CRITICAL notes scattered through the document
5. Now begin writing files, in the order the spec lists them

**Cross-references:**
When a spec says "see IMPL_XX for this component," it means that component was built in a previous session and must not be recreated. Reference it, import it, call it.

**Conflicts with existing code:**
If a spec file references existing code that does not match what the spec expects, report the discrepancy before writing. Do not silently modify existing files from previous sessions without noting what changed and why.

---

## SECTION 3 — FILE CREATION RULES

**The directory structure exists.** Do not create new directories unless the spec explicitly specifies a new directory. All required directories were created by create_aegis_structure.sh.

**Python files in backend/app/ sub-packages require __init__.py.** These already exist. Do not delete or overwrite them.

**Import discipline:** In Python files, imports follow this order:
1. Standard library imports (alphabetical)
2. Third-party imports (alphabetical)
3. Local application imports (alphabetical, relative imports for same-package)
No star imports. No unused imports.

**File headers:** Every Python file starts with its module docstring explaining what the module contains and its role in the system. No copyright headers. No date stamps. No author names. Just a clean module docstring.

**File creation verification:** After creating each file, confirm it exists at the correct path:
```bash
ls -la backend/app/services/model_gateway.py  # example
```

---

## SECTION 4 — ARCHITECTURE DRIFT DEFINITION AND PREVENTION

**Architecture drift** is when implemented code makes decisions that differ from the specification without explicit justification. It compounds — one drift in session 5 causes confusion in session 16. These are the patterns to watch for:

**Drift type 1: Wrong service communication pattern.**
FastAPI must not call DeBERTa, BGE, or Ollama directly via their Docker hostnames without going through the service client files in backend/app/infrastructure/ or backend/app/clients/. All external service calls go through these client wrappers which handle retries, circuit breakers, and timeout.

**Drift type 2: Bypassing the Settings class.**
All environment variables are accessed through the Settings class in backend/app/config.py. If any service file contains `os.environ.get("SOMETHING")` or `os.getenv("SOMETHING")`, that is drift. All config must come from `from app.config import settings` then `settings.SOMETHING`.

**Drift type 3: Synchronous code in async context.**
All FastAPI route handlers and service methods are async. Using `requests.get()` instead of `httpx.AsyncClient().get()`, or using `time.sleep()` instead of `asyncio.sleep()`, is drift that will cause the entire application to block.

**Drift type 4: Wrong data layer.**
Redis is used only for: session state, semantic cache, rate limiting (Redis Instance 1), and ARQ job queue, JWT revocation (Redis Instance 2). PostgreSQL is used for persistent data. Qdrant is used for vector search only. OpenSearch is used for BM25 keyword search only. MinIO is used for file storage only. Storing things in the wrong layer is drift.

**Drift type 5: Direct model calls from handlers.**
HTTP handlers (chat_handler.py, admin_handler.py) must not call Ollama directly. They call services. Services call model_gateway.py. model_gateway.py calls Ollama. This chain is mandatory.

**Drift type 6: Frontend bypassing the API proxy.**
The Next.js frontend must never call the FastAPI backend directly from the browser. All API calls go through the Next.js API routes (app/api/proxy/[...path]/route.ts) which add authentication headers. Direct browser-to-FastAPI calls bypass authentication.

**Self-check before finishing a file:** Ask "does this file call anything that should go through an intermediate layer?" and "does this file read config in a way the spec didn't specify?"

---

## SECTION 5 — CODE STANDARDS — PYTHON

**Type annotations:**
```python
# Correct
async def embed_text(text: str, model: str = "bge-base-en-v1.5") -> list[float]:

# Wrong — missing return type
async def embed_text(text: str):

# Wrong — using Any
async def embed_text(text: Any) -> Any:
```

**Async patterns:**
```python
# Correct — async context manager for HTTP
async with httpx.AsyncClient(timeout=30.0) as client:
    response = await client.post(url, json=payload)

# Wrong — sync requests in async function
response = requests.post(url, json=payload)  # BLOCKS THE EVENT LOOP
```

**Exception handling:**
```python
# Correct — specific exceptions with logging
try:
    result = await qdrant_client.search(...)
except QdrantException as e:
    logger.error("qdrant_search_failed", error=str(e), collection=collection_name)
    raise RetrievalError(f"Vector search failed: {e}") from e

# Wrong — bare except
try:
    result = await qdrant_client.search(...)
except:
    pass
```

**Logging:**
```python
# Correct — structlog with context
logger.info("retrieval_completed", query_id=query_id, chunks_found=len(chunks), duration_ms=elapsed)

# Wrong — print statement
print(f"Found {len(chunks)} chunks")

# Wrong — standard logging without context
logging.info(f"Found {len(chunks)} chunks")
```

**Pydantic models:**
```python
# Correct — Pydantic v2 with full types
class ChatRequest(BaseModel):
    session_id: str
    query: str
    user_id: str
    model_config = ConfigDict(str_strip_whitespace=True)

# Wrong — dict instead of Pydantic
def handle_chat(data: dict):
```

**Docstrings:**
```python
# Correct — Google style docstring
async def retrieve_chunks(query: EnrichedQuery, config: RetrievalConfig) -> list[RetrievedChunk]:
    """Execute tri-modal retrieval and return fused, reranked chunks.

    Runs dense vector search, sparse vector search, and BM25 keyword search in parallel,
    fuses results using Reciprocal Rank Fusion (k=60), applies CRAG self-reflection,
    and reranks with a cross-encoder model.

    Args:
        query: Enriched query with extracted SAP entities and expanded terms.
        config: Retrieval configuration including top-k and fusion weights.

    Returns:
        List of retrieved chunks sorted by final reranked score, with parent chunks hydrated.

    Raises:
        RetrievalError: If all three retrieval modalities fail simultaneously.
    """
```

---

## SECTION 6 — CODE STANDARDS — TYPESCRIPT/REACT

**Type safety:**
```typescript
// Correct — explicit interface
interface QuickEntryFormData {
  title: string;
  content_type: 'error_guide' | 'procedure' | 'config';
  module: string;
  form_data: ErrorGuideFormData | ProcedureFormData | ConfigFormData;
}

// Wrong — any type
const handleSubmit = (data: any) => {}
```

**TanStack Query:**
```typescript
// Correct — typed query with error handling
const { data, isLoading, error } = useQuery<QuickEntryListResponse, ApiError>({
  queryKey: queryKeys.quickEntry.list(filters),
  queryFn: () => api.quickEntry.list(filters),
  staleTime: 30_000,
});

// Wrong — fetch in useEffect
useEffect(() => {
  fetch('/api/quick-entry').then(r => r.json()).then(setData);
}, []);
```

**Component structure:**
```typescript
// Correct — typed props interface before component
interface QuickEntryListCardProps {
  entry: QuickEntryListItem;
  onArchive: (id: string) => void;
  isSelected: boolean;
}

export function QuickEntryListCard({ entry, onArchive, isSelected }: QuickEntryListCardProps) {
  // implementation
}

// Wrong — inline prop types or missing types
export function QuickEntryListCard(props) {
```

---

## SECTION 7 — SECURITY RULES

These are non-negotiable. A single violation breaks the enterprise security model.

1. **No hardcoded credentials anywhere.** No passwords, API keys, secret keys, tokens in any source file. All through Settings class reading from environment variables.

2. **No JWT generation in application code.** JWTs are issued by Keycloak only. FastAPI validates them using the Keycloak public key. FastAPI never signs tokens.

3. **Vault for production secrets.** The vault_client.py provides a method to retrieve secrets. Any credential that changes between demo and production must come from Vault in production. For demo, environment variables are acceptable.

4. **mTLS for internal service communication.** Service-to-service calls within the Docker network use mutual TLS in production. The middleware/mtls.py handles this.

5. **Input governance always runs.** The input_governance middleware runs before any request reaches a handler. It is never disabled or bypassed. Same for output_governance.

6. **Rate limiting on all employee endpoints.** The rate_limiting middleware applies Redis sliding window rate limiting to all chat endpoints. This is not optional.

7. **MinIO presigned URLs for file access.** Files in MinIO are never served directly from MinIO's public port. They go through the Next.js screenshots proxy route which validates authentication first.

---

## SECTION 8 — VERIFICATION PROTOCOL

**After completing every file in a session:**

Step 1 — Syntax check (Python):
```bash
cd /home/pal/aegis-project
source .venv/bin/activate
python -m py_compile backend/app/services/model_gateway.py
echo "Syntax OK: $?"
```

Step 2 — Import check (Python):
```bash
cd backend
python -c "from app.services.model_gateway import ModelGateway; print('Import OK')"
```

Step 3 — Type check (Python, when mypy is configured):
```bash
mypy backend/app/services/model_gateway.py --ignore-missing-imports
```

Step 4 — Unit tests (when test files exist):
```bash
pytest tests/unit/test_model_gateway.py -v
```

Step 5 — Run all spec verification commands exactly as written.

**The spec verification commands are the final authority.** If they pass, the session is complete. If any fail, the session is not complete.

---

## SECTION 9 — WHEN TO STOP AND REPORT

Stop and report to Praveen (do not proceed) if any of the following occur:

1. A spec verification command fails and the cause cannot be identified after 2 diagnostic attempts
2. A spec requires a file that already exists from a previous session with different content
3. A spec references a constant or class that was not created in the session it was supposed to be
4. A Docker container fails to reach healthy status after 5 minutes
5. A database migration fails to apply
6. The IMPL_03 bind mount patch results in models not being visible inside Docker containers
7. Any session produces an import error that cascades across multiple files

In these cases: clearly describe what happened, what was attempted, what the exact error is, and wait for instruction.

---

## SECTION 10 — SESSION COMMIT FORMAT

Every session ends with a commit. The format is:

```
Session N: IMPL_XX — [session name from spec]

Files created:
- backend/app/services/model_gateway.py
- backend/app/services/reasoning_service.py

Files modified:
- backend/app/config.py (added OLLAMA_ settings)

Verifications passed:
- python -m pytest tests/unit/test_model_gateway.py ✓
- docker exec aegis-fastapi python -c "from app.services.model_gateway import ModelGateway" ✓
- curl http://localhost:8000/health ✓

Notes: [any environment-specific adjustments made, e.g., Ubuntu Ollama patch applied]
```

This format gives Praveen a clear record of every session and allows him to verify the git history matches what the specs required.

---

## SECTION 11 — IMPLEMENTATION SESSION ORDER

Sessions must be implemented in strict numerical order. Each session builds on infrastructure from previous sessions.

```
IMPL_01 → IMPL_02 → IMPL_03 → IMPL_04 → IMPL_05 → IMPL_06 → IMPL_07 →
IMPL_08 → IMPL_09 → IMPL_10 → IMPL_11 → IMPL_12 → IMPL_13 → IMPL_14 →
IMPL_15 → IMPL_16 → IMPL_17 → IMPL_18 → IMPL_19 → IMPL_20 → IMPL_21 →
IMPL_22 → IMPL_23 → IMPL_24 → IMPL_25 → IMPL_26 → IMPL_27 → IMPL_28 →
IMPL_29 → FRONTEND_01–11 → FRONTEND_12–15 → FRONTEND_16–22 →
FRONTEND_36–40
```

IMPL_21, IMPL_22, and all IMPL_PATCH documents are applied as patches on top of existing code. They modify specific files from previous sessions.

Never skip a session. Never implement sessions out of order.
