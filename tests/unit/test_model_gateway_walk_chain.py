"""
Unit tests for walk_chain() (Phase 4a) — the core N-tier cascade engine.
Dispatch (_dispatch_tier_nonstreaming) and quota checks (_check_tier_quota)
are mocked so these tests isolate walk_chain's own cascade/budget/skip
logic, not the real HTTP adapters (covered separately in
test_providers_cloudflare.py / test_providers_gemini.py) or the real Redis
quota tracker (covered in test_redis_quota_tracker.py). No live calls
anywhere in this file.
"""
import time
import pytest
from unittest.mock import AsyncMock, patch

from app.services.model_gateway import walk_chain, InferenceChainExhausted
from app.infrastructure.circuit_breaker import circuit_registry, CircuitState


def _reset_chain_circuits(role: str):
    """Test isolation — circuit_registry is a process-wide singleton, and
    walk_chain's own record_success/record_failure calls mutate real
    shared state across tests unless reset."""
    from app.config_inference_chains import INFERENCE_CHAINS
    for tier in INFERENCE_CHAINS[role]:
        cb = circuit_registry.get(tier["cb_name"])
        cb._state = CircuitState.CLOSED
        cb._opened_at = 0.0
        cb._consecutive_failures = 0
        cb._failure_window.clear()


class TestWalkChainHappyPath:
    @pytest.mark.asyncio
    async def test_primary_tier_success_returns_immediately(self):
        _reset_chain_circuits("judge")
        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(return_value="SUPPORTED")) as mock_dispatch:
            result = await walk_chain(role="judge", prompt="test", budget_seconds=20)

        assert result == "SUPPORTED"
        assert mock_dispatch.call_count == 1  # never touched tier 2+


class TestWalkChainCascade:
    @pytest.mark.asyncio
    async def test_primary_fails_second_tier_succeeds(self):
        _reset_chain_circuits("judge")
        call_results = [Exception("groq down"), "SUPPORTED"]

        async def dispatch_side_effect(*args, **kwargs):
            result = call_results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(side_effect=dispatch_side_effect)) as mock_dispatch:
            result = await walk_chain(role="judge", prompt="test", budget_seconds=20)

        assert result == "SUPPORTED"
        assert mock_dispatch.call_count == 2

    @pytest.mark.asyncio
    async def test_all_tiers_fail_raises_chain_exhausted(self):
        _reset_chain_circuits("judge")
        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(side_effect=Exception("down"))):
            with pytest.raises(InferenceChainExhausted) as exc_info:
                await walk_chain(role="judge", prompt="test", budget_seconds=20)

        assert exc_info.value.role == "judge"
        assert len(exc_info.value.attempted) == 4  # all 4 judge tiers attempted


class TestWalkChainSkipping:
    @pytest.mark.asyncio
    async def test_open_circuit_skips_tier_without_dispatch_call(self):
        _reset_chain_circuits("judge")
        from app.config_inference_chains import INFERENCE_CHAINS
        primary_cb = circuit_registry.get(INFERENCE_CHAINS["judge"][0]["cb_name"])
        primary_cb._state = CircuitState.OPEN
        primary_cb._opened_at = time.monotonic()  # just opened, cooldown not expired

        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(return_value="ok")) as mock_dispatch:
            result = await walk_chain(role="judge", prompt="test", budget_seconds=20)

        assert result == "ok"
        # First real dispatch call should be tier 2, not tier 1 (its circuit was open)
        assert mock_dispatch.call_count == 1

    @pytest.mark.asyncio
    async def test_quota_exhausted_skips_tier_without_dispatch_call(self):
        _reset_chain_circuits("judge")
        quota_results = [False, True, True, True]  # tier 1 exhausted, rest available

        async def quota_side_effect(*args, **kwargs):
            return quota_results.pop(0)

        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(side_effect=quota_side_effect)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(return_value="ok")) as mock_dispatch:
            result = await walk_chain(role="judge", prompt="test", budget_seconds=20)

        assert result == "ok"
        assert mock_dispatch.call_count == 1  # tier 1 skipped on quota, tier 2 succeeded


class TestWalkChainBudget:
    @pytest.mark.asyncio
    async def test_budget_exhausted_stops_cascade_early(self):
        _reset_chain_circuits("judge")

        async def slow_failing_dispatch(*args, **kwargs):
            time.sleep(0.05)  # simulate a slow failing call
            raise Exception("timeout")

        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(side_effect=slow_failing_dispatch)) as mock_dispatch:
            with pytest.raises(InferenceChainExhausted):
                await walk_chain(role="judge", prompt="test", budget_seconds=0.12)

        # With a 0.12s budget and ~0.05s per failing attempt, the cascade
        # should stop well short of attempting all 4 tiers.
        assert mock_dispatch.call_count < 4


class TestWalkChainMinMaxTokensOverride:
    """
    Regression coverage for the judge-tier-2 (Groq openai/gpt-oss-20b) fix:
    that model spends its whole token budget on hidden reasoning before
    ever emitting SUFFICIENT/INSUFFICIENT, confirmed live to return empty
    content at the real CRAG_MAX_TOKENS=64 — 128 reliably reaches a real
    answer. config_inference_chains.py's judge tier 2 now declares
    "min_max_tokens": 128; walk_chain must use max(caller_max_tokens,
    tier's min_max_tokens) for that tier only, leaving every other tier
    (including tier 1, on the same CRAG call) at the caller's real budget.
    """

    @pytest.mark.asyncio
    async def test_tier_with_override_receives_bumped_max_tokens(self):
        _reset_chain_circuits("judge")
        call_results = [Exception("groq judge tier 1 down"), "SUFFICIENT"]

        async def dispatch_side_effect(*args, **kwargs):
            result = call_results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(side_effect=dispatch_side_effect)) as mock_dispatch:
            result = await walk_chain(role="judge", prompt="test", max_tokens=64, budget_seconds=20)

        assert result == "SUFFICIENT"
        assert mock_dispatch.call_count == 2
        tier2_call = mock_dispatch.call_args_list[1]
        assert tier2_call.args[2] == 128  # bumped from the caller's 64, not left at 64

    @pytest.mark.asyncio
    async def test_tier_without_override_keeps_callers_max_tokens(self):
        _reset_chain_circuits("judge")
        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(return_value="SUFFICIENT")) as mock_dispatch:
            result = await walk_chain(role="judge", prompt="test", max_tokens=64, budget_seconds=20)

        assert result == "SUFFICIENT"
        tier1_call = mock_dispatch.call_args_list[0]
        assert tier1_call.args[2] == 64  # tier 1 has no override — caller's value passes through unchanged

    @pytest.mark.asyncio
    async def test_override_never_lowers_a_larger_caller_budget(self):
        _reset_chain_circuits("judge")
        call_results = [Exception("groq judge tier 1 down"), "SUFFICIENT"]

        async def dispatch_side_effect(*args, **kwargs):
            result = call_results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(side_effect=dispatch_side_effect)) as mock_dispatch:
            # JUDGE_MAX_TOKENS-sized call (300) — already bigger than the 128 floor.
            await walk_chain(role="judge", prompt="test", max_tokens=300, budget_seconds=20)

        tier2_call = mock_dispatch.call_args_list[1]
        assert tier2_call.args[2] == 300  # max(300, 128) == 300 — override is a floor, not a ceiling


class TestWalkChainVisionRole:
    @pytest.mark.asyncio
    async def test_vision_chain_passes_through_image_params(self):
        _reset_chain_circuits("vision")
        with patch("app.services.model_gateway._check_tier_quota", new=AsyncMock(return_value=True)), \
             patch("app.services.model_gateway._dispatch_tier_nonstreaming", new=AsyncMock(return_value="Blue")) as mock_dispatch:
            result = await walk_chain(
                role="vision", prompt="what color", budget_seconds=60,
                image_b64="ZmFrZQ==", mime_type="image/png",
            )

        assert result == "Blue"
        call_kwargs = mock_dispatch.call_args
        assert call_kwargs.args[4] == "ZmFrZQ==" or call_kwargs.kwargs.get("image_b64") == "ZmFrZQ=="
