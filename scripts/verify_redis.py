#!/usr/bin/env python3
"""
AEGIS Redis Verification Script
Verifies both Redis instances have correct configuration.
Usage: python scripts/verify_redis.py
"""
import json
import subprocess
import sys


def run_redis_command(container: str, *args: str) -> str:
    """Run a redis-cli command in a container."""
    result = subprocess.run(
        ["docker", "exec", container, "redis-cli"] + list(args),
        capture_output=True, text=True,
    )
    return result.stdout.strip()


def verify_instance_1() -> bool:
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
            print(f"  \u2713 {check_name}")
        else:
            print(f"  \u2717 {check_name} \u2014 got: {output}, expected: {expected}")
            if "maxmemory" in check_name:
                print("    CRITICAL: This must be exactly 6442450944 bytes (6GB)")
            all_passed = False

    # Test session operations
    print("\n  Testing session operations...")
    run_redis_command(
        container, "hset", "test:session123",
        "user_id_hash", "abc123",
        "unresolved_count", "0",
        "diagnostic_object_ready", "false",
    )
    run_redis_command(container, "expire", "test:session123", "7200")
    ttl = run_redis_command(container, "ttl", "test:session123")
    field_val = run_redis_command(container, "hget", "test:session123", "user_id_hash")
    run_redis_command(container, "del", "test:session123")

    if field_val == "abc123" and int(ttl) > 7100:
        print(f"  \u2713 Session hash operations work (TTL: {ttl}s)")
    else:
        print(f"  \u2717 Session hash test failed (field={field_val}, ttl={ttl})")
        all_passed = False

    # Test token revocation
    print("\n  Testing JWT revocation set...")
    run_redis_command(container, "sadd", "revoked_tokens", "test-jti-12345")
    is_member = run_redis_command(container, "sismember", "revoked_tokens", "test-jti-12345")
    not_member = run_redis_command(container, "sismember", "revoked_tokens", "not-a-real-jti")
    run_redis_command(container, "srem", "revoked_tokens", "test-jti-12345")

    if is_member == "1" and not_member == "0":
        print("  \u2713 JWT revocation set operations work (SISMEMBER O(1))")
    else:
        print("  \u2717 JWT revocation test failed")
        all_passed = False

    return all_passed


def verify_instance_2() -> bool:
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
            print(f"  \u2713 {check_name}")
        else:
            print(f"  \u2717 {check_name} \u2014 got: {output}, expected: {expected}")
            if "appendonly" in check_name.lower():
                print("    CRITICAL: ARQ tasks MUST persist across restarts")
            all_passed = False

    # Test task queue operations
    print("\n  Testing task queue operations...")
    test_task = json.dumps({"task_type": "audit", "session_id": "test-session"})
    run_redis_command(container, "rpush", "arq:queue:audit", test_task)
    queue_len = run_redis_command(container, "llen", "arq:queue:audit")
    popped = run_redis_command(container, "lpop", "arq:queue:audit")

    if int(queue_len) >= 1 and "audit" in popped:
        print("  \u2713 Task queue RPUSH/LPOP (FIFO) works correctly")
    else:
        print(f"  \u2717 Task queue test failed (len={queue_len}, popped={popped[:50]})")
        all_passed = False

    return all_passed


def main() -> None:
    print("=" * 60)
    print("AEGIS Redis Configuration Verification")
    print("=" * 60)

    instance1_ok = verify_instance_1()
    instance2_ok = verify_instance_2()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    mark1 = "\u2713" if instance1_ok else "\u2717"
    mark2 = "\u2713" if instance2_ok else "\u2717"
    print(f"  {mark1} Redis Instance 1 (Session Store, 6GB, LRU, no persistence)")
    print(f"  {mark2} Redis Instance 2 (ARQ Queue, 1GB, noeviction, AOF)")

    if instance1_ok and instance2_ok:
        print("\n\u2713 BOTH REDIS INSTANCES VERIFIED CORRECTLY")
        sys.exit(0)
    else:
        print("\n\u2717 REDIS VERIFICATION FAILED \u2014 Check docker-compose.yml configuration")
        sys.exit(1)


if __name__ == "__main__":
    main()
