"""
AEGIS Redis Client — dual-instance interface.

Redis Instance 1 (Session Store — aegis-redis-session):
  - Session state hashes (key: session:{session_id}, TTL: 7200s)
  - JWT revocation set (key: revoked_tokens, type: Set)
  - Rate limiting counters (key: ratelimit:{hash}:{epoch}, TTL: 120s)
  - DiagnosticObjects (key: diagnostic:{session_id}, TTL: 600s)

Redis Instance 2 (ARQ Queue — aegis-redis-queue):
  - ARQ task queues (managed by ARQ library)
  - ARQ task state hashes

Semantic cache lives in Qdrant cache_queries collection — NOT in Redis.
Streaming uses in-process AsyncGenerator — NOT Redis Pub/Sub.

All key formats follow AEGIS_DATA_CONTRACTS.md.
All TTL values come from AEGIS_CONFIGURATION_CONSTANTS.md.
"""
import json
import hashlib
import logging
import time
from typing import Optional, Dict
from datetime import datetime, timedelta

from redis.asyncio import Redis, BlockingConnectionPool

from app.config import (
    REDIS_SESSION_URL,
    REDIS_QUEUE_URL,
    SESSION_TTL_SECONDS,
    DIAGNOSTIC_OBJECT_TTL_SECONDS,
    RATE_LIMIT_REQUESTS_PER_MINUTE,
    RATE_LIMIT_WINDOW_SECONDS,
)

logger = logging.getLogger(__name__)

# Channel name constants — defined for future production use, not implemented now.
# Streaming uses in-process AsyncGenerator in the demo phase.
CHANNEL_STREAM = "stream:{session_id}"
CHANNEL_VISION_COMPLETE = "vision_complete:{session_id}"


class RedisSessionClient:
    """Client for Redis Instance 1 (Session Store).

    Handles: session state, JWT revocation, rate limiting, DiagnosticObjects.
    """

    def __init__(self) -> None:
        self._redis: Optional[Redis] = None

    async def connect(self) -> None:
        """Create connection pool to Redis Instance 1."""
        pool = BlockingConnectionPool.from_url(
            REDIS_SESSION_URL,
            max_connections=50,
            timeout=5,
            decode_responses=True,
        )
        self._redis = Redis(connection_pool=pool)
        await self._redis.ping()
        logger.info("Connected to Redis Session Instance 1")

    async def close(self) -> None:
        """Close the connection pool."""
        if self._redis:
            await self._redis.aclose()

    @property
    def redis(self) -> Redis:
        """Get the underlying Redis client, raising if not connected."""
        if not self._redis:
            raise RuntimeError("Redis Session client not connected.")
        return self._redis

    # ============================================================
    # Session State Operations
    # Key format: session:{session_id}
    # TTL: SESSION_TTL_SECONDS (7200 = 2 hours), reset on each request
    # ============================================================

    def _session_key(self, session_id: str) -> str:
        return f"session:{session_id}"

    async def get_session(self, session_id: str) -> Optional[Dict[str, str]]:
        """Load complete session state hash. Returns None if not found."""
        key = self._session_key(session_id)
        data = await self.redis.hgetall(key)
        return data if data else None

    async def create_session(self, session_id: str, user_id: str) -> Dict[str, str]:
        """Create a new session with initial state.

        All fields are strings because Redis hashes store strings.

        Args:
            session_id: Unique session identifier.
            user_id: JWT sub claim — hashed before storage.

        Returns:
            The initial session state dict.
        """
        now_iso = datetime.utcnow().isoformat() + "Z"
        initial_state = {
            "user_id_hash": hashlib.sha256(user_id.encode()).hexdigest(),
            "created_at": now_iso,
            "conversation_history": "[]",
            "active_retrieval_mode": "B",
            "last_entities": "[]",
            "last_document_ids": "[]",
            "model_tier_last": "1",
            "confidence_history": "[]",
            "unresolved_count": "0",
            "intent_label": "",
            "diagnostic_object_ready": "false",
            "last_updated_at": now_iso,
        }
        key = self._session_key(session_id)
        await self.redis.hset(key, mapping=initial_state)
        await self.redis.expire(key, SESSION_TTL_SECONDS)
        return initial_state

    async def update_session(self, session_id: str, updates: Dict[str, str]) -> None:
        """Update specific fields in session state.

        Also resets the 2-hour TTL.

        Args:
            session_id: Session to update.
            updates: Field-value pairs to set in the hash.
        """
        updates["last_updated_at"] = datetime.utcnow().isoformat() + "Z"
        key = self._session_key(session_id)
        await self.redis.hset(key, mapping=updates)
        await self.redis.expire(key, SESSION_TTL_SECONDS)

    async def get_session_field(self, session_id: str, field: str) -> Optional[str]:
        """Get a single field from session state."""
        return await self.redis.hget(self._session_key(session_id), field)

    async def increment_unresolved_count(self, session_id: str) -> int:
        """Increment the unresolved count and return new value."""
        key = self._session_key(session_id)
        new_count = await self.redis.hincrby(key, "unresolved_count", 1)
        await self.redis.expire(key, SESSION_TTL_SECONDS)
        return new_count

    async def delete_session(self, session_id: str) -> None:
        """Delete a session (on logout or explicit cleanup)."""
        await self.redis.delete(self._session_key(session_id))

    async def session_exists(self, session_id: str) -> bool:
        """Check if session exists."""
        return bool(await self.redis.exists(self._session_key(session_id)))

    # ============================================================
    # DiagnosticObject Operations (from vision processing)
    # Key format: diagnostic:{session_id}
    # TTL: DIAGNOSTIC_OBJECT_TTL_SECONDS (600 = 10 minutes)
    # ============================================================

    def _diagnostic_key(self, session_id: str) -> str:
        return f"diagnostic:{session_id}"

    async def set_diagnostic_object(self, session_id: str, diagnostic_data: Dict) -> None:
        """Store DiagnosticObject from vision processing.

        Called by ARQ vision task when Qwen2.5-VL-7B completes.
        Also sets diagnostic_object_ready=true in session state.

        Args:
            session_id: Session that owns this diagnostic.
            diagnostic_data: DiagnosticObject dict per AEGIS_DATA_CONTRACTS.md.
        """
        key = self._diagnostic_key(session_id)
        await self.redis.setex(
            key,
            DIAGNOSTIC_OBJECT_TTL_SECONDS,
            json.dumps(diagnostic_data),
        )
        session_key = self._session_key(session_id)
        await self.redis.hset(session_key, "diagnostic_object_ready", "true")
        logger.info("diagnostic_object_stored", extra={"session_id": session_id})

    async def get_diagnostic_object(self, session_id: str) -> Optional[Dict]:
        """Retrieve DiagnosticObject if it exists and is not expired."""
        raw = await self.redis.get(self._diagnostic_key(session_id))
        if raw:
            return json.loads(raw)
        return None

    # ============================================================
    # JWT Token Revocation
    # Key: revoked_tokens (Redis Set)
    # Cleanup via nightly_cleanup ARQ task
    # ============================================================

    REVOKED_TOKENS_KEY = "revoked_tokens"

    async def revoke_token(self, jti: str) -> None:
        """Add a JWT jti to the revocation set.

        Entries are cleaned up by the nightly_cleanup ARQ task.
        For the demo, the set stays small since users are few.

        Args:
            jti: JWT ID claim to revoke.
        """
        await self.redis.sadd(self.REVOKED_TOKENS_KEY, jti)

    async def is_token_revoked(self, jti: str) -> bool:
        """Check if a JWT jti has been revoked.

        O(1) SISMEMBER operation — under 0.1ms.
        Called on every authenticated request.

        Args:
            jti: JWT ID claim to check.

        Returns:
            True if the token has been revoked.
        """
        return bool(await self.redis.sismember(self.REVOKED_TOKENS_KEY, jti))

    # ============================================================
    # Rate Limiting
    # Key format: ratelimit:{user_id_hash}:{minute_epoch}
    # TTL: RATE_LIMIT_WINDOW_SECONDS * 2 (120 seconds)
    # ============================================================

    def _rate_limit_key(self, user_id_hash: str) -> str:
        """Generate rate limit key for the current minute window."""
        minute_epoch = int(time.time() / 60)
        return f"ratelimit:{user_id_hash}:{minute_epoch}"

    async def check_and_increment_rate_limit(self, user_id_hash: str) -> tuple[int, bool]:
        """Atomically increment rate limit counter and check if limit exceeded.

        Uses Redis pipeline for atomicity.

        Args:
            user_id_hash: SHA-256 hash of the user ID.

        Returns:
            Tuple of (current_count, is_exceeded).
        """
        key = self._rate_limit_key(user_id_hash)
        async with self.redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, RATE_LIMIT_WINDOW_SECONDS * 2)
            results = await pipe.execute()

        current_count = results[0]
        is_exceeded = current_count > RATE_LIMIT_REQUESTS_PER_MINUTE
        return current_count, is_exceeded

    # ============================================================
    # Inference Quota Tracker
    # Per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.4. Three
    # mechanisms, because the 5 inference providers genuinely don't share
    # one quota shape — see each method's docstring.
    #
    # Every method here FAILS OPEN on a Redis error (returns "quota
    # available") rather than failing closed, per the plan's Design
    # Principle 8 — matching the philosophy already established by
    # check_and_increment_rate_limit above and knowledge_entries_handler.py's
    # check_qe_rate_limit: Redis being unavailable should not block all
    # inference, the circuit breaker is the real backstop against a
    # genuinely unhealthy provider.
    # ============================================================

    # Lua script for atomic sliding-window check-and-reserve. Evicts expired
    # entries, checks the count, and reserves a slot in ONE round trip —
    # unlike check_qe_rate_limit's ZCARD-then-ZADD (not atomic, fine for a
    # soft in-app limit, not fine here where overshoot means genuinely
    # exceeding an external provider's documented rate limit under
    # concurrent load). Returns 1 if reserved, 0 if the window is full.
    _SLIDING_WINDOW_RESERVE_SCRIPT = """
        redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
        local current = redis.call('ZCARD', KEYS[1])
        if current >= tonumber(ARGV[3]) then
            return 0
        end
        redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5])
        redis.call('EXPIRE', KEYS[1], ARGV[4])
        return 1
    """

    async def reserve_sliding_window_quota(
        self, provider: str, model: str, window_seconds: int, max_requests: int,
    ) -> bool:
        """
        Atomic check-and-reserve for SambaNova (per-model RPD) and Gemini
        (per-model RPM) — providers with no rate-limit response headers.
        Key format: inference_quota:sliding:{provider}:{model}.

        Returns True if a slot was reserved (call should proceed), False if
        the window is genuinely full (caller should skip this tier). Fails
        open (returns True) on any Redis error.
        """
        key = f"inference_quota:sliding:{provider}:{model}"
        now = time.time()
        window_start = now - window_seconds
        member = f"{now}:{id(object())}"  # cheap uniqueness, no uuid import needed for a Lua ZADD member
        try:
            script = self.redis.register_script(self._SLIDING_WINDOW_RESERVE_SCRIPT)
            result = await script(keys=[key], args=[now, window_start, max_requests, window_seconds, member])
            return bool(result)
        except Exception as e:
            logger.error(f"Sliding-window quota check failed for {provider}/{model} (Redis unavailable, failing open): {e}")
            return True

    _PROVIDER_HEADER_KEY_PREFIX = "inference_quota:header"

    async def cache_header_quota(
        self, provider: str, model: str, remaining: int, reset_seconds: int,
    ) -> None:
        """
        Caches Groq's/Cerebras's own authoritative rate-limit-remaining
        value, parsed from real response headers (x-ratelimit-remaining-*)
        by the caller — this method just stores what was already parsed.
        TTL matches the header's own reset window, so a stale cached value
        expires around the same time the real provider-side window resets.
        Never raises — a caching failure should not break the call that
        already succeeded.
        """
        key = f"{self._PROVIDER_HEADER_KEY_PREFIX}:{provider}:{model}"
        try:
            await self.redis.setex(key, max(reset_seconds, 1), str(remaining))
        except Exception as e:
            logger.warning(f"Failed to cache header quota for {provider}/{model}: {e}")

    async def get_cached_header_quota(self, provider: str, model: str) -> Optional[int]:
        """Returns the last cached remaining-request count, or None if
        never cached / expired. Used by the admin inference-health endpoint
        to display a live value, distinct from has_header_quota's boolean
        gating check below."""
        key = f"{self._PROVIDER_HEADER_KEY_PREFIX}:{provider}:{model}"
        try:
            raw = await self.redis.get(key)
            return int(raw) if raw is not None else None
        except Exception as e:
            logger.warning(f"get_cached_header_quota failed for {provider}/{model}: {e}")
            return None

    async def has_header_quota(self, provider: str, model: str) -> bool:
        """
        Checks the last cached remaining-request count for a header-based
        provider. No cached value (never called yet, or the TTL expired —
        meaning the provider's own window has reset) or a Redis error both
        degrade to "assume available" — a missing/malformed header must
        never be able to take down a healthy tier, since Groq/Cerebras can
        change header formats without notice (this codebase has already
        observed one provider's public model catalog change shape mid-project).
        """
        key = f"{self._PROVIDER_HEADER_KEY_PREFIX}:{provider}:{model}"
        try:
            raw = await self.redis.get(key)
            if raw is None:
                return True
            return int(raw) > 0
        except Exception as e:
            logger.warning(f"Header quota check failed for {provider}/{model} (assuming available): {e}")
            return True

    _CLOUDFLARE_NEURON_KEY = "inference_quota:cloudflare_neurons"

    async def cloudflare_quota_available(self, daily_ceiling: float) -> bool:
        """
        Checks Cloudflare's shared, account-wide daily Neuron cost pool —
        NOT a per-model request count, a single counter shared across every
        Cloudflare-hosted tier in every role's chain, matching the platform's
        real accounting. Fails open on Redis error.
        """
        try:
            raw = await self.redis.get(self._CLOUDFLARE_NEURON_KEY)
            spent = float(raw) if raw is not None else 0.0
            return spent < daily_ceiling
        except Exception as e:
            logger.warning(f"Cloudflare quota check failed (assuming available): {e}")
            return True

    async def record_cloudflare_neuron_cost(self, cost: float) -> None:
        """
        Increments the shared daily Neuron counter by the real cost from
        that call's cf-ai-neurons response header. TTL of 26 hours (not a
        clean 24h) deliberately gives a small buffer past a UTC day
        boundary rather than a counter that could expire mid-day on a
        borderline timing race. Never raises.
        """
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.incrbyfloat(self._CLOUDFLARE_NEURON_KEY, cost)
                pipe.expire(self._CLOUDFLARE_NEURON_KEY, 26 * 3600)
                await pipe.execute()
        except Exception as e:
            logger.warning(f"Failed to record Cloudflare neuron cost: {e}")

    # ============================================================
    # Health Check
    # ============================================================

    # ============================================================
    # Redis Pub/Sub — Streaming Tokens to WebSocket
    # Channel format: stream:{session_id}
    # Used by reasoning_service to publish tokens for WS delivery
    # ============================================================

    def _stream_channel(self, session_id: str) -> str:
        return f"stream:{session_id}"

    async def publish_token(self, session_id: str, token: str) -> None:
        """Publish a single generation token to the stream channel."""
        await self.redis.publish(
            self._stream_channel(session_id),
            json.dumps({"type": "token", "token": token}),
        )

    async def publish_stream_complete(self, session_id: str) -> None:
        """Signal that generation is complete on the stream channel."""
        await self.redis.publish(
            self._stream_channel(session_id),
            json.dumps({"type": "stream_complete"}),
        )

    async def health_check(self) -> Dict:
        """Return health status including memory usage."""
        try:
            await self.redis.ping()
            info = await self.redis.info("memory")
            used_memory_gb = info["used_memory"] / (1024 ** 3)
            max_memory_bytes = await self.redis.config_get("maxmemory")
            max_memory_gb = int(max_memory_bytes.get("maxmemory", 0)) / (1024 ** 3)
            return {
                "status": "healthy",
                "used_memory_gb": round(used_memory_gb, 2),
                "max_memory_gb": round(max_memory_gb, 2),
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


class RedisQueueClient:
    """Client for Redis Instance 2 (ARQ Queue Store).

    Primarily managed by the ARQ library directly.
    This class provides helper methods for monitoring and dead letter queue management.
    """

    def __init__(self) -> None:
        self._redis: Optional[Redis] = None

    async def connect(self) -> None:
        """Create connection pool to Redis Instance 2."""
        pool = BlockingConnectionPool.from_url(
            REDIS_QUEUE_URL,
            max_connections=20,
            timeout=5,
            decode_responses=True,
        )
        self._redis = Redis(connection_pool=pool)
        await self._redis.ping()
        logger.info("Connected to Redis Queue Instance 2")

    async def close(self) -> None:
        """Close the connection pool."""
        if self._redis:
            await self._redis.aclose()

    @property
    def redis(self) -> Redis:
        """Get the underlying Redis client, raising if not connected."""
        if not self._redis:
            raise RuntimeError("Redis Queue client not connected.")
        return self._redis

    # ============================================================
    # Task Queue Monitoring
    # ============================================================

    async def get_queue_depths(self) -> Dict[str, int]:
        """Get the current depth (pending tasks) for all task queues."""
        task_types = [
            "vision", "audit", "feedback_diagnosis", "cache_write",
            "knowledge_gap", "mock_ticket", "nightly_cleanup",
        ]
        depths = {}
        for task_type in task_types:
            key = f"arq:queue:{task_type}"
            depth = await self.redis.llen(key)
            depths[task_type] = depth
        return depths

    async def get_dead_letter_counts(self) -> Dict[str, int]:
        """Get the count of failed tasks in dead letter queues."""
        task_types = [
            "vision", "audit", "feedback_diagnosis", "cache_write",
            "knowledge_gap", "mock_ticket",
        ]
        counts = {}
        for task_type in task_types:
            key = f"arq:dead_letter:{task_type}"
            count = await self.redis.llen(key)
            counts[task_type] = count
        return counts

    # ============================================================
    # Health Check
    # ============================================================

    async def health_check(self) -> Dict:
        """Return health status including AOF state and queue depths."""
        try:
            await self.redis.ping()
            appendonly = await self.redis.config_get("appendonly")
            aof_enabled = appendonly.get("appendonly") == "yes"
            queue_depths = await self.get_queue_depths()
            return {
                "status": "healthy",
                "aof_enabled": aof_enabled,
                "queue_depths": queue_depths,
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


class ARQTaskClient:
    """
    Proper ARQ task enqueueing using ARQ's native job format.
    Replaces all raw redis.rpush() calls for background task submission.
    """

    def __init__(self):
        self._pool = None

    async def connect(self):
        from arq.connections import create_pool, RedisSettings
        self._pool = await create_pool(RedisSettings.from_dsn(REDIS_QUEUE_URL))
        logger.info("Connected to ARQ task pool (Redis Instance 2)")

    async def close(self):
        if self._pool:
            await self._pool.close()

    async def enqueue_vision(self, *, session_id: str, file_path: str) -> str:
        job = await self._pool.enqueue_job("process_vision_task", session_id=session_id, file_path=file_path)
        return job.job_id

    async def enqueue_audit(self, *, audit_data: dict) -> str:
        job = await self._pool.enqueue_job("write_audit_log", audit_data=audit_data)
        return job.job_id

    async def enqueue_feedback_diagnosis(self, *, feedback_data: dict) -> str:
        job = await self._pool.enqueue_job("run_feedback_diagnosis", feedback_data=feedback_data)
        return job.job_id

    async def enqueue_cache_write(self, *, cache_data: dict) -> str:
        job = await self._pool.enqueue_job("write_semantic_cache", cache_data=cache_data)
        return job.job_id

    async def enqueue_knowledge_gap(self, *, gap_data: dict) -> str:
        job = await self._pool.enqueue_job("record_knowledge_gap", gap_data=gap_data)
        return job.job_id

    async def enqueue_ticket(self, *, ticket_data: dict) -> str:
        job = await self._pool.enqueue_job("create_mock_ticket", ticket_data=ticket_data)
        return job.job_id

    async def enqueue_process_form_entry(self, *, entry_id: str) -> str:
        """Enqueue Quick Entry processing (chunking, embedding, Qdrant/OpenSearch insertion)."""
        job = await self._pool.enqueue_job("process_form_entry", entry_id=entry_id)
        return job.job_id

    async def enqueue_retry_partial_indexing(self, *, entry_id: str, defer_seconds: int = 0) -> str:
        """Enqueue a retry pass for chunks that failed Qdrant/OpenSearch insertion."""
        kwargs = {"entry_id": entry_id}
        if defer_seconds:
            kwargs["_defer_by"] = timedelta(seconds=defer_seconds)
        job = await self._pool.enqueue_job("retry_partial_indexing", **kwargs)
        return job.job_id

    async def enqueue_screenshot_enrichment(self, *, entry_id: str, version: int, target_screenshot_id: str = None) -> str:
        """
        Enqueue screenshot vision enrichment. Bulk mode (target_screenshot_id
        omitted) merges already-extracted screenshot text into freshly
        created chunks after a publish. Retry mode (target_screenshot_id set,
        from the retry-vision endpoint) re-runs vision for one screenshot
        whose extraction previously failed.
        """
        kwargs = {"entry_id": entry_id, "version": version}
        if target_screenshot_id:
            kwargs["target_screenshot_id"] = target_screenshot_id
        job = await self._pool.enqueue_job("enrich_entry_screenshots", **kwargs)
        return job.job_id


# Singleton instances (initialised in FastAPI startup)
redis_session = RedisSessionClient()
redis_queue = RedisQueueClient()
arq_client = ARQTaskClient()
