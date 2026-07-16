"""
AEGIS Prometheus Metrics
Custom metrics exposed at GET /metrics.
These feed the Grafana 8-panel quality dashboard.
"""
from prometheus_client import Counter, Histogram, Gauge

# ── Request metrics ──────────────────────────────────────────
REQUEST_COUNTER = Counter(
    "aegis_requests_total",
    "Total HTTP/WebSocket requests",
    ["endpoint", "status"],
)

# ── Generation metrics ───────────────────────────────────────
GENERATION_LATENCY = Histogram(
    "aegis_generation_duration_seconds",
    "Time from first token to stream_complete",
    buckets=[5, 10, 20, 30, 60, 90, 120, 180],
)

GENERATION_TIER = Counter(
    "aegis_generation_tier_total",
    "Generation calls by model tier",
    ["tier"],
)

# ── Validation metrics ───────────────────────────────────────
VALIDATION_SCORE = Histogram(
    "aegis_validation_score",
    "ValidationScore distribution",
    ["classification"],
    buckets=[0.3, 0.5, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.0],
)

CONFIDENCE_BADGE = Counter(
    "aegis_confidence_badge_total",
    "Confidence badge assignments",
    ["badge"],  # green | amber | none
)

# ── Retrieval metrics ────────────────────────────────────────
CACHE_HITS = Counter(
    "aegis_cache_hits_total",
    "Semantic cache hits (requests that skipped retrieval)",
)

CRAG_ASSESSMENT = Counter(
    "aegis_crag_assessment_total",
    "CRAG self-reflection outcomes",
    ["assessment"],  # SUFFICIENT | INSUFFICIENT | SKIPPED
)

RETRIEVAL_MODE = Counter(
    "aegis_retrieval_mode_total",
    "Retrieval mode usage",
    ["mode"],  # A | B | C
)

CROSS_ENCODER_SCORE = Histogram(
    "aegis_cross_encoder_top_score",
    "Top cross-encoder score after reranking",
    buckets=[0.3, 0.5, 0.65, 0.70, 0.80, 0.82, 0.85, 0.90, 0.95, 1.0],
)

# ── Escalation metrics ───────────────────────────────────────
ESCALATIONS = Counter(
    "aegis_escalations_total",
    "Queries escalated (INSUFFICIENT CRAG → mock ticket)",
)

KNOWLEDGE_GAPS = Counter(
    "aegis_knowledge_gap_events_total",
    "Knowledge gap events recorded",
)

# ── Vision metrics ───────────────────────────────────────────
VISION_TASKS = Counter(
    "aegis_vision_tasks_total",
    "Screenshot processing tasks",
    ["status"],  # success | failed
)

# ── System metrics ───────────────────────────────────────────
# uvicorn runs 2 worker processes (UVICORN_WORKERS=2), each with its own
# prometheus_client registry — multiprocess_mode="livesum" tells the
# multiprocess collector (wired in main.py) to sum each worker's live gauge
# value instead of exposing per-pid series or a meaningless last-write-wins.
ACTIVE_SESSIONS = Gauge(
    "aegis_active_sessions",
    "Currently active WebSocket sessions",
    multiprocess_mode="livesum",
)


def record_pipeline_metrics(
    enriched_query,
    retrieval_result,
    validation_result,
    generation_seconds: float,
    cache_hit: bool,
) -> None:
    """
    Record all metrics for one completed query pipeline.
    Call this at the end of _handle_client_message in chat_handler.py.
    """
    if cache_hit:
        CACHE_HITS.inc()
        return  # Cache hits don't go through retrieval/validation

    RETRIEVAL_MODE.labels(mode=retrieval_result.retrieval_mode_used).inc()
    CRAG_ASSESSMENT.labels(assessment=retrieval_result.crag_assessment).inc()
    CROSS_ENCODER_SCORE.observe(retrieval_result.top_cross_encoder_score)

    VALIDATION_SCORE.labels(
        classification=enriched_query.classification
    ).observe(validation_result.validation_score)
    CONFIDENCE_BADGE.labels(badge=validation_result.confidence_badge).inc()

    GENERATION_LATENCY.observe(generation_seconds)

    if retrieval_result.crag_assessment == "INSUFFICIENT":
        ESCALATIONS.inc()
