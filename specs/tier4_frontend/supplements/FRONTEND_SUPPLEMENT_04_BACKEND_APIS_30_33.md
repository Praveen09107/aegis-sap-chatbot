# FRONTEND_SUPPLEMENT_04: BACKEND APIS 30–33 — COMPLETE SPECIFICATIONS
## Full depth replacement for the thin combined FRONTEND_29–33 document
## Covers: Metrics aggregation · Analytics bucketing · Health checks · Preferences + WS

---

# FRONTEND_30 COMPLETE: ADMIN METRICS ENDPOINT

## GET /api/admin/metrics

**Authorization:** `role = it-admin` required. Returns 403 for employees.
**Polling:** Frontend polls every 30 seconds. Backend must respond within 2 seconds.

### Aggregation logic

All time-based calculations use IST (Asia/Kolkata) for "today" boundaries:

```python
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')

def get_metrics(db: Session) -> dict:
    now_utc = datetime.now(timezone.utc)
    now_ist = now_utc.astimezone(IST)

    # "Today" = IST midnight to IST now
    ist_today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_today_start = ist_today_start.astimezone(timezone.utc)

    # Total queries today = all session_messages where role='user' and created_at >= utc_today_start
    total_queries_today = db.execute(
        "SELECT COUNT(*) FROM session_messages WHERE role='user' AND created_at >= :start",
        {"start": utc_today_start}
    ).scalar()

    # Average validation score = mean across all non-null scored responses today
    avg_score = db.execute(
        """SELECT AVG(validation_score) FROM session_messages
           WHERE role='assistant' AND validation_score IS NOT NULL
           AND created_at >= :start""",
        {"start": utc_today_start}
    ).scalar() or 0.0

    # Badge distribution today
    badge_counts = db.execute(
        """SELECT confidence_badge, COUNT(*) as cnt FROM session_messages
           WHERE role='assistant' AND created_at >= :start
           GROUP BY confidence_badge""",
        {"start": utc_today_start}
    ).fetchall()

    total_scored = sum(r.cnt for r in badge_counts) or 1
    badge_map = {r.confidence_badge: r.cnt for r in badge_counts}

    # ... (open_tickets, cache_hit_rate from Redis metrics, mode_a/b/c from CRAG logs)

    # 7-day trend data — last 7 IST days including today
    # Each element: {"date": "Mon", "score": 0.841}
    validation_7d = get_7d_trend(db, utc_today_start)
    confidence_7d = get_7d_confidence_dist(db, utc_today_start)

    return {
        "total_queries_today": total_queries_today,
        "avg_validation_score": round(avg_score, 4),
        "green_badge_rate": badge_map.get('green', 0) / total_scored,
        "amber_badge_rate": badge_map.get('amber', 0) / total_scored,
        "none_badge_rate":  badge_map.get('none',  0) / total_scored,
        "open_tickets": get_open_ticket_count(db),
        "cache_hit_rate": get_redis_cache_hit_rate(),   # from Redis INFO
        "mode_a_rate": get_crag_mode_rate('A'),
        "mode_b_rate": get_crag_mode_rate('B'),
        "mode_c_rate": get_crag_mode_rate('C'),
        "last_updated_at": now_utc.isoformat(),
        "validation_score_7d": validation_7d,
        "confidence_dist_7d": confidence_7d,
        "gap_events": get_top_gap_events(db, days=7, limit=5),
    }
```

### 7-day trend date labels

```python
def get_7d_trend(db, today_start_utc):
    """Returns 7 data points: last 7 IST days."""
    IST = ZoneInfo('Asia/Kolkata')
    results = []
    for days_ago in range(6, -1, -1):  # 6 days ago → today
        day_start = today_start_utc - timedelta(days=days_ago)
        day_end = day_start + timedelta(days=1)

        avg = db.execute(
            """SELECT AVG(validation_score) FROM session_messages
               WHERE role='assistant' AND validation_score IS NOT NULL
               AND created_at >= :start AND created_at < :end""",
            {"start": day_start, "end": day_end}
        ).scalar() or 0.0

        # Day label: abbreviated weekday in English
        day_label = day_start.astimezone(IST).strftime('%a')  # "Mon", "Tue", etc.
        results.append({"date": day_label, "score": round(avg, 4)})

    return results
```

### Cache-Control headers

```
Cache-Control: no-store, must-revalidate
```

The 30-second polling on the frontend makes HTTP caching counterproductive.
Always return fresh data.

### Degraded backend behaviour

If any data source is unavailable, return partial data rather than failing entirely:

```python
# If Qdrant is down: cache_hit_rate = null (not 0)
# If CRAG logging DB is down: mode_a/b/c rates = null
# If Redis is down: cache_hit_rate = null
# Always return total_queries_today and badge distribution (from main DB)
# Frontend MetricCard handles null values gracefully (shows "--")
```

---

# FRONTEND_31 COMPLETE: ANALYTICS ENDPOINT

## GET /api/admin/analytics

**Authorization:** `role = it-admin` required.
**Response time:** May take up to 5 seconds for "all" range. Cache aggressively.

### Date bucketing strategy per range

```python
def get_analytics(range: str) -> dict:
    """
    Range → bucket size → date label format:
    7d  → 1-day buckets → abbreviated weekday "Mon"
    30d → 1-day buckets → "DD MMM" e.g. "28 Mar"
    90d → 7-day buckets → "DD MMM" of week start
    all → 30-day buckets → "MMM YY" e.g. "Mar 24"
    """

    IST = ZoneInfo('Asia/Kolkata')
    now_ist = datetime.now(IST)

    if range == '7d':
        bucket_days = 1
        num_buckets = 7
        date_fmt = lambda d: d.strftime('%a')         # "Mon"
    elif range == '30d':
        bucket_days = 1
        num_buckets = 30
        date_fmt = lambda d: d.strftime('%d %b')      # "28 Mar"
    elif range == '90d':
        bucket_days = 7
        num_buckets = 13  # 91 days ÷ 7
        date_fmt = lambda d: d.strftime('%d %b')      # "28 Mar"
    else:  # 'all' — from first session to now
        bucket_days = 30
        first_session = db.query("SELECT MIN(created_at) FROM sessions").scalar()
        days_total = (now_ist - first_session.astimezone(IST)).days
        num_buckets = max(1, days_total // 30)
        date_fmt = lambda d: d.strftime('%b %y')      # "Mar 24"
```

### Expensive query caching

```python
# Cache analytics responses in Redis with TTL based on range:
ANALYTICS_CACHE_TTL = {
    '7d':  5 * 60,     # 5 minutes
    '30d': 15 * 60,    # 15 minutes
    '90d': 30 * 60,    # 30 minutes
    'all': 60 * 60,    # 1 hour
}

# Cache key: f"analytics:{range}:{today_ist_date}"
# Bust on: new session completed (send invalidation event via Redis pub/sub)
```

### Complete response shape

```typescript
interface AnalyticsResponse {
  // Each array has `num_buckets` elements
  // All dates are formatted per the bucket strategy above

  validation_score_trend: Array<{
    date: string       // Day label per bucket strategy
    score: number      // Average ValidationScore (0–1) for the bucket, 0 if no data
  }>

  confidence_distribution: Array<{
    date: string
    green: number      // Percentage 0–100 (rounded to 1dp)
    amber: number
    none: number
  }>

  cache_performance: Array<{
    date: string
    hit_rate: number       // Fraction 0–1 (4dp)
    total_queries: number  // Integer — used for weighted averaging
  }>

  retrieval_mode_usage: Array<{
    date: string
    mode_a: number    // CRAG-corrected fraction 0–1
    mode_b: number    // Standard retrieval fraction
    mode_c: number    // Insufficient fraction
    // mode_a + mode_b + mode_c should sum to ~1.0
  }>

  query_volume: Array<{
    date: string
    value: number     // Integer query count for the bucket
  }>

  top_modules: Array<{
    module: string          // "SD", "FI", etc.
    query_count: number     // Total queries tagged with this module in the range
    avg_score: number       // Average validation_score for this module (0–1)
  }>
  // Sorted by query_count DESC, max 6 modules
}
```

---

# FRONTEND_32 COMPLETE: SYSTEM HEALTH ENDPOINT

## GET /api/admin/system-health

**Authorization:** `role = it-admin` required.
**Response time SLA:** Must respond within 5 seconds even if some services are slow.
**Polling:** Frontend polls every 30 seconds.

### Per-service health check implementation

```python
import asyncio
import aiohttp
from datetime import datetime, timezone

HEALTH_CHECK_TIMEOUT_SECONDS = 3.0   # Per-service timeout
PARALLEL_CHECK_TIMEOUT_SECONDS = 4.5  # Total timeout for all 19 services in parallel

# Service health check URLs (Docker internal network):
SERVICE_HEALTH_URLS = {
    "aegis-nginx":            "http://aegis-nginx/health",
    "aegis-keycloak":         "http://aegis-keycloak:8080/health/live",
    "aegis-vault":            "http://aegis-vault:8200/v1/sys/health",
    "aegis-fastapi":          "http://aegis-fastapi:8000/health",
    "aegis-arq":              "http://aegis-arq:8001/health",
    "aegis-ollama-main":      "http://aegis-ollama-main:11434/api/health",
    "aegis-ollama-judge":     "http://aegis-ollama-judge:11434/api/health",
    "aegis-ollama-vision":    "http://aegis-ollama-vision:11434/api/health",
    "aegis-bge":              "http://aegis-bge:8080/health",
    "aegis-deberta":          "http://aegis-deberta:8080/health",
    "aegis-qdrant":           "http://aegis-qdrant:6333/health",
    "aegis-opensearch":       "http://aegis-opensearch:9200/_cluster/health",
    "aegis-postgres-primary": "http://aegis-pgbouncer:5432/health",  # via pgbouncer
    "aegis-postgres-replica": None,   # Checked via SQL: SELECT pg_is_in_recovery()
    "aegis-pgbouncer":        None,   # Checked via pgbouncer SHOW POOLS
    "aegis-redis-session":    None,   # Checked via PING command
    "aegis-redis-queue":      None,   # Checked via PING command
    "aegis-prometheus":       "http://aegis-prometheus:9090/-/healthy",
    "aegis-grafana":          "http://aegis-grafana:3000/api/health",
}

async def check_service(
    session: aiohttp.ClientSession,
    name: str,
    url: str | None
) -> dict:
    checked_at = datetime.now(timezone.utc).isoformat()
    start = asyncio.get_event_loop().time()

    if url is None:
        # Use protocol-specific check (Redis PING, PG query, etc.)
        try:
            ok, error = await check_service_custom(name)
            elapsed = int((asyncio.get_event_loop().time() - start) * 1000)
            return {
                "name": name,
                "status": "healthy" if ok else "unhealthy",
                "response_time_ms": elapsed,
                "error_message": error,
                "last_checked_at": checked_at,
            }
        except Exception as e:
            return _unhealthy_result(name, str(e), checked_at)

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=HEALTH_CHECK_TIMEOUT_SECONDS)) as resp:
            elapsed = int((asyncio.get_event_loop().time() - start) * 1000)
            status = "healthy" if resp.status < 300 else "degraded"
            return {
                "name": name,
                "status": status,
                "response_time_ms": elapsed,
                "error_message": None if status == "healthy" else f"HTTP {resp.status}",
                "last_checked_at": checked_at,
            }
    except asyncio.TimeoutError:
        return _unhealthy_result(name, f"Timeout after {HEALTH_CHECK_TIMEOUT_SECONDS}s", checked_at)
    except Exception as e:
        return _unhealthy_result(name, str(e), checked_at)


async def get_all_service_health() -> dict:
    """Check all 19 services in parallel with total timeout."""
    async with aiohttp.ClientSession() as session:
        tasks = [
            check_service(session, name, url)
            for name, url in SERVICE_HEALTH_URLS.items()
        ]
        # Allow max PARALLEL_CHECK_TIMEOUT_SECONDS total
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=PARALLEL_CHECK_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            # Some services didn't respond — mark remaining as unknown
            results = [r if isinstance(r, dict) else _unknown_result(name)
                      for name, r in zip(SERVICE_HEALTH_URLS.keys(), results)]

    # Compute overall status
    statuses = [r.get('status', 'unknown') for r in results if isinstance(r, dict)]
    unhealthy_count = statuses.count('unhealthy')
    degraded_count = statuses.count('degraded')

    if unhealthy_count >= 2:
        overall = 'critical'
    elif unhealthy_count >= 1 or degraded_count >= 2:
        overall = 'degraded'
    else:
        overall = 'healthy'

    return {
        "overall_status": overall,
        "total_healthy": statuses.count('healthy'),
        "total_unhealthy": unhealthy_count + degraded_count,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "services": [r for r in results if isinstance(r, dict)],
    }
```

### overall_status rules (clarified for frontend)

| Condition | overall_status | Frontend banner |
|-----------|---------------|-----------------|
| All 19 healthy | `healthy` | Green "All services healthy" |
| 1 degraded OR 1 unknown | `degraded` | Amber "Some services degraded" |
| 2+ degraded OR 1+ unhealthy | `degraded` | Amber "Some services degraded" |
| 2+ unhealthy | `critical` | Red "Critical services down" |

---

# FRONTEND_33 COMPLETE: PREFERENCES + WEBSOCKET EXTENSION

## Preferences API

### Device sync behaviour

Preferences are **device-agnostic** — they sync across all devices:
- `PUT /api/preferences` replaces the entire preferences object
- There is no per-device preference tracking
- Exception: `panel_collapsed` is stored in localStorage only (FRONTEND_10 panelStore) because panel state is a per-device UX preference

```python
# preferences table in PostgreSQL:
CREATE TABLE user_preferences (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL DEFAULT 'light'
                          CHECK (theme IN ('light', 'dark', 'system')),
  onboarding_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_session_ids    UUID[] NOT NULL DEFAULT '{}',
  notification_prefs    JSONB NOT NULL DEFAULT '{"email_on_ticket_resolved": true}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Preference sync flow

```
1. On login: frontend calls GET /api/preferences
2. If onboarding_complete = false: show OnboardingModal
3. If theme is set: apply theme (overrides localStorage if different)
4. pinned_session_ids from server sync with localStorage STORAGE_KEYS.PINNED_SESSIONS
   → server is the source of truth; localStorage is a write-through cache

5. On pin/unpin session: frontend updates sessionStore AND calls PUT /api/preferences
   with updated pinned_session_ids array
```

**Conflict resolution:** Server wins. If a user pins a session on device A and
concurrently unpins it on device B, the last `PUT /api/preferences` wins.

---

## WebSocket Protocol Extension (FastAPI code changes)

FRONTEND_33 extends the IMPL_11 WebSocket handler with three new message types.
Here is the exact FastAPI code to add:

### 1. retrieval_progress messages

```python
# In aegis/ws/chat_handler.py — add to the CRAG pipeline execution:

async def send_retrieval_progress(ws: WebSocket, stage: str):
    """
    Stages to send:
    'retrieving' — Qdrant vector search started
    'crag'       — CRAG correction evaluation running
    'generating' — LLM prompt submitted to Ollama
    'validating' — Deberta ValidationScore running
    """
    await ws.send_json({"type": "retrieval_progress", "stage": stage})

# Insert into pipeline:
await send_retrieval_progress(ws, "retrieving")
documents = await qdrant_client.search(query_embedding, limit=5)

await send_retrieval_progress(ws, "crag")
correction_needed = await crag_evaluator.evaluate(query, documents)

await send_retrieval_progress(ws, "generating")
async for token in ollama_client.stream(prompt):
    await ws.send_json({"type": "token", "token": token})

await ws.send_json({"type": "stream_complete"})

await send_retrieval_progress(ws, "validating")
score = await deberta_validator.score(query, full_response)
```

### 2. related_questions in validation_result

```python
# In the validation_result dispatch — add related_questions generation:

async def generate_related_questions(
    query: str, response: str, module: str | None, ollama_client
) -> list[str]:
    """
    Generate 2-3 follow-up question suggestions for green-badge responses.
    Only called when validation_score >= GREEN_THRESHOLD (0.85).
    """
    prompt = f"""Given this SAP support exchange, suggest 2-3 natural follow-up questions
    an employee might ask next. Output ONLY a JSON array of question strings.

    User question: {query}
    Module: {module or 'unknown'}
    Response summary: {response[:300]}

    Example output: ["How do I check...", "What is the difference between..."]"""

    try:
        result = await ollama_client.generate(
            model="llama3.2:3b",      # Fast, small model for this task
            prompt=prompt,
            timeout=5.0,              # Don't block if Ollama is slow
        )
        questions = json.loads(result.response)
        return questions[:3] if isinstance(questions, list) else []
    except Exception:
        return []   # Silent failure — related questions are optional

# In validation_result dispatch:
related_questions = []
if confidence_badge == "green":
    related_questions = await generate_related_questions(
        query, full_response, sap_module, ollama_client
    )

await ws.send_json({
    "type": "validation_result",
    "validation_score": score,
    "confidence_badge": confidence_badge,
    "attribution_panel": attribution_panel,
    "related_questions": related_questions or None,  # null if empty
})
```

### 3. vision_refined_answer messages

```python
# When a screenshot is attached and the vision model refines the response:
if screenshot_url:
    vision_response = await ollama_client.generate_vision(
        model="llava:13b",
        prompt=f"Analyse this SAP screenshot and refine the answer to: {query}",
        image_url=screenshot_url,
    )
    await ws.send_json({
        "type": "vision_refined_answer",
        "message": vision_response.text,
        "diagnostic_summary": vision_response.error_codes_detected,
    })
```

---

## WebSocket Error Codes (for frontend useWebSocket.ts)

```python
# Standardised WS close codes used by the AEGIS backend:
WS_CLOSE_CODES = {
    1000: "Normal closure",
    1001: "Going away (server restart)",
    4000: "Invalid authentication token",     # useWebSocket: redirect to login
    4001: "Pong timeout",                     # useWebSocket: reconnect
    4003: "Session token expired",            # useWebSocket: toast + error state
    4004: "Session not found",               # useWebSocket: start new session
    4005: "Rate limit exceeded",             # useWebSocket: toast + wait
}
```

These are already handled in `useWebSocket.ts` (FRONTEND_12). This table
documents the server-side codes so the backend team implements the same values.

---

*FRONTEND_SUPPLEMENT_04 | Backend APIs 30-33 Complete | AEGIS Frontend Specification Set*
