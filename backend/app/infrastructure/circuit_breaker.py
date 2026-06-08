"""
AEGIS Circuit Breaker
Per-service failure tracking with automatic open/half-open/close transitions.
One circuit breaker per external service dependency.

State Machine:
  CLOSED -> normal operation
  OPEN   -> fast-fail, no calls attempted (after failure threshold exceeded)
  HALF_OPEN -> test call allowed, if succeeds -> CLOSED, if fails -> OPEN

Configuration from AEGIS_CONFIGURATION_CONSTANTS.md:
  Window: 10 calls, threshold: 50%, cooldown: 30 seconds
"""
import time
import logging
from enum import Enum
from collections import deque
from typing import Dict

from app.config import (
    CIRCUIT_BREAKER_WINDOW,
    CIRCUIT_BREAKER_FAIL_THRESHOLD,
    CIRCUIT_BREAKER_COOLDOWN,
)

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    Circuit breaker for a single external service dependency.
    Thread-safe for asyncio (single-threaded event loop).
    """

    def __init__(self, service_name: str, failure_threshold: int = None, timeout: int = None):
        self.service_name = service_name
        self._state = CircuitState.CLOSED
        # Support both direct threshold and window-based config
        self._failure_threshold = failure_threshold or CIRCUIT_BREAKER_WINDOW
        self._cooldown = timeout or CIRCUIT_BREAKER_COOLDOWN
        self._failure_window: deque = deque(maxlen=self._failure_threshold)
        self._opened_at: float = 0.0
        self._total_calls = 0
        self._total_failures = 0
        self._consecutive_failures = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if time.monotonic() - self._opened_at >= self._cooldown:
                self._state = CircuitState.HALF_OPEN
                logger.info(f"Circuit {self.service_name}: OPEN -> HALF_OPEN (cooldown expired)")
        return self._state

    @property
    def is_open(self) -> bool:
        return self.state == CircuitState.OPEN

    @property
    def allows_call(self) -> bool:
        """Returns True if a call should be attempted (CLOSED or HALF_OPEN)."""
        s = self.state
        return s == CircuitState.CLOSED or s == CircuitState.HALF_OPEN

    def record_success(self):
        """Record a successful call. Closes circuit if in HALF_OPEN state."""
        self._total_calls += 1
        self._failure_window.append(False)
        self._consecutive_failures = 0
        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.CLOSED
            self._opened_at = 0.0
            logger.info(f"Circuit {self.service_name}: HALF_OPEN -> CLOSED (test call succeeded)")

    def record_failure(self):
        """Record a failed call. Opens circuit if failure rate threshold exceeded."""
        self._total_calls += 1
        self._total_failures += 1
        self._failure_window.append(True)
        self._consecutive_failures += 1

        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.OPEN
            self._opened_at = time.monotonic()
            logger.warning(f"Circuit {self.service_name}: HALF_OPEN -> OPEN (test call failed)")
            return

        if self._state == CircuitState.CLOSED:
            # Open circuit if consecutive failures reach threshold
            if self._consecutive_failures >= self._failure_threshold:
                self._state = CircuitState.OPEN
                self._opened_at = time.monotonic()
                logger.warning(
                    f"Circuit {self.service_name}: CLOSED -> OPEN "
                    f"({self._consecutive_failures} consecutive failures >= {self._failure_threshold})"
                )
                return
            # Also check window-based failure rate
            window = list(self._failure_window)
            if len(window) >= CIRCUIT_BREAKER_WINDOW:
                failure_rate = sum(window) / len(window)
                if failure_rate >= CIRCUIT_BREAKER_FAIL_THRESHOLD:
                    self._state = CircuitState.OPEN
                    self._opened_at = time.monotonic()
                    logger.warning(
                        f"Circuit {self.service_name}: CLOSED -> OPEN "
                        f"(failure rate {failure_rate:.0%} >= {CIRCUIT_BREAKER_FAIL_THRESHOLD:.0%})"
                    )

    def get_stats(self) -> Dict:
        window = list(self._failure_window)
        return {
            "service": self.service_name,
            "state": self.state.value,
            "window_failures": sum(window),
            "window_size": len(window),
            "total_calls": self._total_calls,
            "total_failures": self._total_failures,
        }

    async def call(self, func):
        """Execute a callable through the circuit breaker."""
        if self.is_open:
            raise Exception(f"Circuit {self.service_name} is OPEN")
        try:
            result = func()
            if hasattr(result, '__anext__') or hasattr(result, '__await__'):
                result = await result
            self.record_success()
            return result
        except Exception:
            self.record_failure()
            raise


class CircuitBreakerRegistry:
    """
    Registry of all circuit breakers in AEGIS.
    One breaker per external service dependency.
    """

    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._initialize()

    def _initialize(self):
        services = [
            "qdrant",
            "opensearch",
            "postgres",
            "redis_session",
            "redis_queue",
            "vault",
            "keycloak",
            "ollama_main",
            "ollama_judge",
            "ollama_vision",
            "bge_service",
            "deberta_service",
        ]
        for service in services:
            self._breakers[service] = CircuitBreaker(service)

    def get(self, service_name: str) -> CircuitBreaker:
        """Get circuit breaker for a specific service."""
        if service_name not in self._breakers:
            self._breakers[service_name] = CircuitBreaker(service_name)
        return self._breakers[service_name]

    def get_all_stats(self) -> Dict:
        """Get status of all circuit breakers (for health endpoint)."""
        return {name: cb.get_stats() for name, cb in self._breakers.items()}

    def any_open(self) -> bool:
        """Check if any circuit breaker is open."""
        return any(cb.is_open for cb in self._breakers.values())

    async def qdrant_and_opensearch_both_open(self) -> bool:
        """Check if both retrieval services are unavailable (triggers fallback chain)."""
        return (self._breakers["qdrant"].is_open and
                self._breakers["opensearch"].is_open)


# Singleton registry
circuit_registry = CircuitBreakerRegistry()
