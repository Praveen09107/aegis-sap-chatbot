"""
Unit tests for the inference quota tracker (Phase 3) on RedisSessionClient.
No real Redis server — the underlying `_redis` client is mocked. This
means these tests cannot prove Lua's server-side atomicity guarantee
directly (that's a property of Redis itself, not testable without a real
server), but they DO prove the two things that were actually broken in the
naive design this replaced: (1) the check-and-reserve happens via exactly
ONE call to the server (a single EVAL), not separate check-then-act calls
that could race under concurrency, and (2) every quota method fails open
(returns "available") when Redis itself is unreachable, per Design
Principle 8.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.infrastructure.redis_client import RedisSessionClient


def _client_with_mock_redis():
    client = RedisSessionClient()
    client._redis = MagicMock()
    return client


class TestSlidingWindowQuota:
    @pytest.mark.asyncio
    async def test_reserve_uses_a_single_atomic_script_call(self):
        client = _client_with_mock_redis()
        mock_script = AsyncMock(return_value=1)
        client._redis.register_script = MagicMock(return_value=mock_script)

        result = await client.reserve_sliding_window_quota("gemini", "gemini-3.5-flash", window_seconds=60, max_requests=5)

        assert result is True
        client._redis.register_script.assert_called_once()
        mock_script.assert_awaited_once()
        # Exactly one round trip to Redis for the whole check-and-reserve —
        # this is the property that closes the TOCTOU race a copy-pasted
        # check_qe_rate_limit-style ZCARD-then-ZADD would have had.
        assert mock_script.call_count == 1

    @pytest.mark.asyncio
    async def test_window_full_returns_false(self):
        client = _client_with_mock_redis()
        mock_script = AsyncMock(return_value=0)
        client._redis.register_script = MagicMock(return_value=mock_script)

        result = await client.reserve_sliding_window_quota("sambanova", "gpt-oss-120b", window_seconds=86400, max_requests=20)
        assert result is False

    @pytest.mark.asyncio
    async def test_redis_error_fails_open(self):
        client = _client_with_mock_redis()
        client._redis.register_script = MagicMock(side_effect=ConnectionError("redis down"))

        result = await client.reserve_sliding_window_quota("gemini", "gemini-3.5-flash", window_seconds=60, max_requests=5)
        assert result is True  # fails open, per Design Principle 8


class TestHeaderQuota:
    @pytest.mark.asyncio
    async def test_cache_and_retrieve(self):
        client = _client_with_mock_redis()
        client._redis.setex = AsyncMock()
        await client.cache_header_quota("groq", "openai/gpt-oss-120b", remaining=998, reset_seconds=86)
        client._redis.setex.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_cached_value_assumes_available(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(return_value=None)
        result = await client.has_header_quota("groq", "openai/gpt-oss-120b")
        assert result is True  # never called yet — assume available, not exhausted

    @pytest.mark.asyncio
    async def test_zero_remaining_reports_unavailable(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(return_value="0")
        result = await client.has_header_quota("groq", "openai/gpt-oss-120b")
        assert result is False

    @pytest.mark.asyncio
    async def test_redis_error_fails_open(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(side_effect=ConnectionError("redis down"))
        result = await client.has_header_quota("groq", "openai/gpt-oss-120b")
        assert result is True

    @pytest.mark.asyncio
    async def test_malformed_cached_value_fails_open(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(return_value="not-a-number")
        result = await client.has_header_quota("groq", "openai/gpt-oss-120b")
        assert result is True


class TestCloudflareNeuronPool:
    @pytest.mark.asyncio
    async def test_under_ceiling_is_available(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(return_value="500.0")
        result = await client.cloudflare_quota_available(daily_ceiling=10000)
        assert result is True

    @pytest.mark.asyncio
    async def test_at_or_over_ceiling_is_unavailable(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(return_value="10000.0")
        result = await client.cloudflare_quota_available(daily_ceiling=10000)
        assert result is False

    @pytest.mark.asyncio
    async def test_no_spend_yet_is_available(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(return_value=None)
        result = await client.cloudflare_quota_available(daily_ceiling=10000)
        assert result is True

    @pytest.mark.asyncio
    async def test_redis_error_fails_open(self):
        client = _client_with_mock_redis()
        client._redis.get = AsyncMock(side_effect=ConnectionError("redis down"))
        result = await client.cloudflare_quota_available(daily_ceiling=10000)
        assert result is True

    @pytest.mark.asyncio
    async def test_record_cost_uses_pipeline(self):
        client = _client_with_mock_redis()
        # redis.asyncio's Pipeline queues incrbyfloat/expire synchronously
        # (they return the pipe itself for chaining, not a coroutine) —
        # only .execute() is actually awaited. MagicMock for the queueing
        # calls, AsyncMock only where real awaiting happens.
        mock_pipe = MagicMock()
        mock_pipe.__aenter__ = AsyncMock(return_value=mock_pipe)
        mock_pipe.__aexit__ = AsyncMock(return_value=False)
        mock_pipe.execute = AsyncMock()
        client._redis.pipeline = MagicMock(return_value=mock_pipe)

        await client.record_cloudflare_neuron_cost(5.78)
        mock_pipe.incrbyfloat.assert_called_once()
        mock_pipe.expire.assert_called_once()
        mock_pipe.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_record_cost_never_raises_on_redis_error(self):
        client = _client_with_mock_redis()
        client._redis.pipeline = MagicMock(side_effect=ConnectionError("redis down"))
        await client.record_cloudflare_neuron_cost(5.78)  # must not raise
