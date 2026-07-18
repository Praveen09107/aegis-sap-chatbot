"""
Unit tests for circuit breaker per-provider overrides (Phase 2). The
CircuitBreaker class and default-threshold behavior predate this plan;
these tests focus specifically on the registry's new override wiring.
"""
from app.infrastructure.circuit_breaker import CircuitBreaker, CircuitBreakerRegistry, CircuitState


class TestCircuitBreakerOverrides:
    def test_gemini_vision_has_tighter_threshold_than_default(self):
        registry = CircuitBreakerRegistry()
        cb = registry.get("gemini_vision")
        assert cb._failure_threshold == 2
        assert cb._cooldown == 90

    def test_sambanova_tiers_have_tighter_threshold_than_default(self):
        registry = CircuitBreakerRegistry()
        for name in ("sambanova_main", "sambanova_judge"):
            cb = registry.get(name)
            assert cb._failure_threshold == 3
            assert cb._cooldown == 60

    def test_other_providers_keep_global_default(self):
        registry = CircuitBreakerRegistry()
        cb = registry.get("groq_main")  # lazily created, not in _OVERRIDES
        assert cb._failure_threshold == 10  # CIRCUIT_BREAKER_WINDOW default
        assert cb._cooldown == 30  # CIRCUIT_BREAKER_COOLDOWN default

    def test_overridden_providers_pre_registered_not_lazy(self):
        registry = CircuitBreakerRegistry()
        # Confirmed present immediately after __init__, before any .get() call
        # that would otherwise lazily create it with the wrong (default) config.
        assert "gemini_vision" in registry._breakers
        assert registry._breakers["gemini_vision"]._failure_threshold == 2

    def test_gemini_vision_trips_after_two_failures(self):
        registry = CircuitBreakerRegistry()
        cb = registry.get("gemini_vision")
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_get_all_stats_includes_overridden_providers(self):
        registry = CircuitBreakerRegistry()
        stats = registry.get_all_stats()
        assert "gemini_vision" in stats
        assert stats["gemini_vision"]["state"] == "closed"
