# IMPL_08: DATA LAYER — REDIS
## Both Redis Instance Client Implementations
## Session 08 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 08: Implement both Redis client classes and verify configuration.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-07 complete. Both Redis instances must be running and healthy.

**Critical Redis requirements from AEGIS_MASTER_REFERENCE.md:**
- Redis Instance 1 (Session Store): maxmemory=6gb, allkeys-lru, NO persistence
- Redis Instance 2 (ARQ Queue): maxmemory=1gb, noeviction, AOF persistence

These must be verified at the end of this session.

---

## FILE 1: backend/app/infrastructure/redis_client.py

This is the complete Redis client implementation. Create it at `backend/app/infrastructure/redis_client.py`.

```python
"""
AEGIS Redis Client
Provides typed interfaces to both Redis instances.

Redis Instance 1 (Session Store — aegis-redis-session):
  - Session state hashes
  - Semantic cache (via Qdrant cache_queries collection, NOT stored here)
  - JWT revocation set
  - Rate limiting counters
  - DiagnosticObjects from vision processing
  - Redis Pub/Sub channels for streaming

Redis Instance 2 (ARQ Queue — aegis-redis-queue):
  - ARQ task queues (managed by ARQ library)
  - ARQ task state hashes

All key formats follow the patterns in AEGIS_DATA_CONTRACTS.md.
All TTL values come from AEGIS_CONFIGURATION_CONSTANTS.md.
"""
import json
import hashlib
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from redis.asyncio import Redis, BlockingConnectionPool
from redis.asyncio.client import PubSub

from app.config import (
    REDIS_SESSION_URL,
    REDIS_QUEUE_URL,
    SESSION_TTL_SECONDS,
    DIAGNOSTIC_OBJECT_TTL_SECONDS,
    RATE_LIMIT_REQUESTS_PER_MINUTE,
    RATE_LIMIT_WINDOW_SECONDS,
    ACCESS_TOKEN_TTL_SECONDS,
)

logger = logging.getLogger(__name__)


class RedisSessionClient:
    """
    Client for Redis Instance 1 (Session Store).
    Handles: session state, JWT revocation, rate limiting,
             DiagnosticObjects, Pub/Sub channels.
    """

    def __init__(self):
        self._redis: Optional[Redis] = None

    async def connect(self):
        """Create connection pool to Redis Instance 1."""
        pool = BlockingConnectionPool.from_url(
            REDIS_SESSION_URL,
            max_connections=50,
            timeout=5,
            decode_responses=True,  # All keys/values as strings
        )
        self._redis = Redis(connection_pool=pool)
        # Test connection
        await self._redis.ping()
        logger.info("Connected to Redis Session Instance 1")

    async def close(self):
        if self._redis:
            await self._redis.aclose()

    @property
    def redis(self) -> Redis:
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
        """
        Create a new session with initial state.
        All fields are strings because Redis hashes store strings.
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
        """
        Update specific fields in session state.
        Also resets the 2-hour TTL.
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
        """
        Store DiagnosticObject from vision processing.
        Called by ARQ vision task when Qwen2.5-VL-7B completes.
        Also sets diagnostic_object_ready=true in session state.
        """
        key = self._diagnostic_key(session_id)
        await self.redis.setex(
            key,
            DIAGNOSTIC_OBJECT_TTL_SECONDS,
            json.dumps(diagnostic_data)
        )
        # Update session state flag
        session_key = self._session_key(session_id)
        await self.redis.hset(session_key, "diagnostic_object_ready", "true")
        logger.info(f"DiagnosticObject stored for session {session_id}")

    async def get_diagnostic_object(self, session_id: str) -> Optional[Dict]:
        """Retrieve DiagnosticObject if it exists and is not expired."""
        raw = await self.redis.get(self._diagnostic_key(session_id))
        if raw:
            return json.loads(raw)
        return None

    # ============================================================
    # JWT Token Revocation
    # Key format: revoked_tokens (Redis Set)
    # Member TTL: set per-member using EXPIREAT (not supported natively for set members)
    # Implementation: Store jti as member, clean up via periodic job
    # ============================================================

    REVOKED_TOKENS_KEY = "revoked_tokens"

    async def revoke_token(self, jti: str) -> None:
        """
        Add a JWT jti to the revocation set.
        The set has no global TTL — individual members don't expire.
        Entries are cleaned up by the nightly_cleanup ARQ task.
        For the demo, the set stays small since users are few.
        """
        await self.redis.sadd(self.REVOKED_TOKENS_KEY, jti)

    async def is_token_revoked(self, jti: str) -> bool:
        """
        Check if a JWT jti has been revoked.
        O(1) SISMEMBER operation — under 0.1ms.
        Called on every authenticated request.
        """
        return bool(await self.redis.sismember(self.REVOKED_TOKENS_KEY, jti))

    # ============================================================
    # Rate Limiting
    # Key format: ratelimit:{user_id_hash}:{minute_window}
    # minute_window: int(unix_timestamp / 60)
    # TTL: RATE_LIMIT_WINDOW_SECONDS * 2 (120 seconds — keeps two windows)
    # ============================================================

    def _rate_limit_key(self, user_id_hash: str) -> str:
        """Generate rate limit key for the current minute window."""
        import time
        minute_epoch = int(time.time() / 60)
        return f"ratelimit:{user_id_hash}:{minute_epoch}"

    async def check_and_increment_rate_limit(self, user_id_hash: str) -> tuple[int, bool]:
        """
        Atomically increment rate limit counter and check if limit exceeded.
        Returns (current_count, is_exceeded).
        Uses Redis pipeline for atomicity.
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
    # Pub/Sub for Token Streaming and Vision Push
    # stream:{session_id} — token streaming
    # vision_complete:{session_id} — vision processing done
    # These are ephemeral channels, not persisted keys
    # ============================================================

    async def publish_token(self, session_id: str, token: str) -> None:
        """Publish a generated token to the streaming channel."""
        message = json.dumps({"type": "token", "token": token, "session_id": session_id})
        await self.redis.publish(f"stream:{session_id}", message)

    async def publish_stream_complete(self, session_id: str) -> None:
        """Signal that token streaming is complete."""
        message = json.dumps({"type": "stream_complete", "session_id": session_id})
        await self.redis.publish(f"stream:{session_id}", message)

    async def publish_vision_complete(self, session_id: str) -> None:
        """
        Signal from ARQ vision worker that DiagnosticObject is ready.
        The WebSocket handler subscribed to this channel triggers the
        proactive refined response generation.
        """
        message = json.dumps({"type": "vision_complete", "session_id": session_id})
        await self.redis.publish(f"vision_complete:{session_id}", message)

    async def publish_validation_result(self, session_id: str, validation_data: Dict) -> None:
        """Publish validation result (confidence badge, attribution panel) after generation."""
        message = json.dumps({
            "type": "validation_result",
            "session_id": session_id,
            **validation_data
        })
        await self.redis.publish(f"stream:{session_id}", message)

    async def get_pubsub(self) -> PubSub:
        """
        Get a Pub/Sub client for subscribing to channels.
        Used by WebSocket handler to subscribe to stream:{session_id}
        and vision_complete:{session_id} channels.
        """
        return self.redis.pubsub()

    # ============================================================
    # Health Check
    # ============================================================

    async def health_check(self) -> Dict:
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
    """
    Client for Redis Instance 2 (ARQ Queue Store).
    This is primarily managed by the ARQ library directly.
    This class provides helper methods for monitoring and dead letter queue management.
    """

    def __init__(self):
        self._redis: Optional[Redis] = None

    async def connect(self):
        pool = BlockingConnectionPool.from_url(
            REDIS_QUEUE_URL,
            max_connections=20,
            timeout=5,
            decode_responses=True,
        )
        self._redis = Redis(connection_pool=pool)
        await self._redis.ping()
        logger.info("Connected to Redis Queue Instance 2")

    async def close(self):
        if self._redis:
            await self._redis.aclose()

    @property
    def redis(self) -> Redis:
        if not self._redis:
            raise RuntimeError("Redis Queue client not connected.")
        return self._redis

    # ============================================================
    # Task Queue Monitoring
    # ============================================================

    async def get_queue_depths(self) -> Dict[str, int]:
        """Get the current depth (pending tasks) for all task queues."""
        task_types = ["vision", "audit", "feedback_diagnosis", "cache_write",
                      "knowledge_gap", "mock_ticket", "nightly_cleanup"]
        depths = {}
        for task_type in task_types:
            key = f"arq:queue:{task_type}"
            depth = await self.redis.llen(key)
            depths[task_type] = depth
        return depths

    async def get_dead_letter_counts(self) -> Dict[str, int]:
        """Get the count of failed tasks in dead letter queues."""
        task_types = ["vision", "audit", "feedback_diagnosis", "cache_write",
                      "knowledge_gap", "mock_ticket"]
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
        try:
            await self.redis.ping()
            # Verify AOF is enabled
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


# Singleton instances (initialised in FastAPI startup)
redis_session = RedisSessionClient()
redis_queue = RedisQueueClient()
```

---

## FILE 2: scripts/verify_redis.py

Create this verification script at `scripts/verify_redis.py`.

```python
#!/usr/bin/env python3
"""
AEGIS Redis Verification Script
Verifies both Redis instances have correct configuration.
Usage: python scripts/verify_redis.py
"""
import subprocess
import sys


def run_redis_command(container: str, *args) -> str:
    """Run a redis-cli command in a container."""
    result = subprocess.run(
        ["docker", "exec", container, "redis-cli"] + list(args),
        capture_output=True, text=True
    )
    return result.stdout.strip()


def verify_instance_1():
    """Verify Redis Session Instance (aegis-redis-session)."""
    print("\n=== Redis Instance 1 (Session Store) ===")
    container = "aegis-redis-session"

    checks = [
        ("PING", ["PING"], "PONG"),
        ("maxmemory = 6GB", ["config", "get", "maxmemory"], "6442450944"),
        ("maxmemory-policy = allkeys-lru", ["config", "get", "maxmemory-policy"], "allkeys-lru"),
        ("appendonly = no (NO persistence)", ["config", "get", "appendonly"], "no"),
    ]

    all_passed = True
    for check_name, cmd, expected in checks:
        output = run_redis_command(container, *cmd)
        if expected in output:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ✗ {check_name} — got: {output}, expected: {expected}")
            if "maxmemory" in check_name:
                print(f"    CRITICAL: This must be exactly 6442450944 bytes (6GB)")
            all_passed = False

    # Test session operations
    print("\n  Testing session operations...")
    run_redis_command(container, "hset", "test:session123",
                      "user_id_hash", "abc123",
                      "unresolved_count", "0",
                      "diagnostic_object_ready", "false")
    run_redis_command(container, "expire", "test:session123", "7200")
    ttl = run_redis_command(container, "ttl", "test:session123")
    field_val = run_redis_command(container, "hget", "test:session123", "user_id_hash")
    run_redis_command(container, "del", "test:session123")

    if field_val == "abc123" and int(ttl) > 7100:
        print(f"  ✓ Session hash operations work (TTL: {ttl}s)")
    else:
        print(f"  ✗ Session hash test failed (field={field_val}, ttl={ttl})")
        all_passed = False

    # Test token revocation
    print("\n  Testing JWT revocation set...")
    run_redis_command(container, "sadd", "revoked_tokens", "test-jti-12345")
    is_member = run_redis_command(container, "sismember", "revoked_tokens", "test-jti-12345")
    not_member = run_redis_command(container, "sismember", "revoked_tokens", "not-a-real-jti")
    run_redis_command(container, "srem", "revoked_tokens", "test-jti-12345")

    if is_member == "1" and not_member == "0":
        print(f"  ✓ JWT revocation set operations work (SISMEMBER O(1))")
    else:
        print(f"  ✗ JWT revocation test failed")
        all_passed = False

    return all_passed


def verify_instance_2():
    """Verify Redis Queue Instance (aegis-redis-queue)."""
    print("\n=== Redis Instance 2 (ARQ Queue) ===")
    container = "aegis-redis-queue"

    checks = [
        ("PING", ["PING"], "PONG"),
        ("maxmemory = 1GB", ["config", "get", "maxmemory"], "1073741824"),
        ("maxmemory-policy = noeviction", ["config", "get", "maxmemory-policy"], "noeviction"),
        ("appendonly = yes (AOF persistence)", ["config", "get", "appendonly"], "yes"),
        ("appendfsync = everysec", ["config", "get", "appendfsync"], "everysec"),
    ]

    all_passed = True
    for check_name, cmd, expected in checks:
        output = run_redis_command(container, *cmd)
        if expected in output:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ✗ {check_name} — got: {output}, expected: {expected}")
            if "appendonly" in check_name.lower():
                print(f"    CRITICAL: ARQ tasks MUST persist across restarts")
            all_passed = False

    # Test task queue operations
    print("\n  Testing task queue operations...")
    import json
    test_task = json.dumps({"task_type": "audit", "session_id": "test-session"})
    run_redis_command(container, "rpush", "arq:queue:audit", test_task)
    queue_len = run_redis_command(container, "llen", "arq:queue:audit")
    popped = run_redis_command(container, "lpop", "arq:queue:audit")

    if int(queue_len) >= 1 and "audit" in popped:
        print(f"  ✓ Task queue RPUSH/LPOP (FIFO) works correctly")
    else:
        print(f"  ✗ Task queue test failed (len={queue_len}, popped={popped[:50]})")
        all_passed = False

    return all_passed


def main():
    print("=" * 60)
    print("AEGIS Redis Configuration Verification")
    print("=" * 60)

    instance1_ok = verify_instance_1()
    instance2_ok = verify_instance_2()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  {'✓' if instance1_ok else '✗'} Redis Instance 1 (Session Store, 6GB, LRU, no persistence)")
    print(f"  {'✓' if instance2_ok else '✗'} Redis Instance 2 (ARQ Queue, 1GB, noeviction, AOF)")

    if instance1_ok and instance2_ok:
        print("\n✓ BOTH REDIS INSTANCES VERIFIED CORRECTLY")
        sys.exit(0)
    else:
        print("\n✗ REDIS VERIFICATION FAILED — Check docker-compose.yml configuration")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

---

## RUNNING THE VERIFICATION

```bash
python scripts/verify_redis.py
```

Expected final output: `✓ BOTH REDIS INSTANCES VERIFIED CORRECTLY`

---

## VERIFICATION STEPS

### Step 1: Run the verification script
```bash
python scripts/verify_redis.py
```

### Step 2: Confirm Instance 1 has NO persistence
```bash
docker exec aegis-redis-session redis-cli config get appendonly
```
Expected: `appendonly\nno`

### Step 3: Confirm Instance 2 HAS AOF persistence
```bash
docker exec aegis-redis-queue redis-cli config get appendonly
docker exec aegis-redis-queue redis-cli config get appendfsync
```
Expected: `appendonly\nyes` and `appendfsync\neverysec`

### Step 4: Confirm memory limits
```bash
# Instance 1: 6GB
docker exec aegis-redis-session redis-cli info memory | grep maxmemory

# Instance 2: 1GB
docker exec aegis-redis-queue redis-cli info memory | grep maxmemory
```
Expected Instance 1: `maxmemory:6442450944` (6GB in bytes)
Expected Instance 2: `maxmemory:1073741824` (1GB in bytes)

---

## WHEN VERIFICATION PASSES

```bash
git add -A
git commit -m "IMPL-08: Redis data layer - both instances correctly configured"
```

Update DECISIONS_LOG.md with:
- Redis Instance 1 verified: maxmemory 6GB, allkeys-lru, no persistence
- Redis Instance 2 verified: maxmemory 1GB, noeviction, AOF everysec
- Session hash operations verified
- JWT revocation set operations verified
- ARQ task queue RPUSH/LPOP verified

---

*Document version: 1.0 | AEGIS Specification Set*
