"""
Unit tests for the generic KV v2 Vault client (DEC-060/DEC-061/OPEN-14's
repurposed vault_client.py — get_postgres_credentials removed, replaced by
get_secret/put_secret).
"""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.infrastructure.vault_client import VaultClient


def _mock_response(json_body: dict, status: int = 200):
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = json_body
    resp.raise_for_status = MagicMock()
    if status >= 400:
        import httpx
        resp.raise_for_status.side_effect = httpx.HTTPStatusError("error", request=MagicMock(), response=resp)
    return resp


def _mock_async_client(**method_returns):
    mock_client = AsyncMock()
    for method, ret in method_returns.items():
        getattr(mock_client, method).return_value = ret
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_caches_token_and_expiry(self):
        client = VaultClient()
        login_resp = _mock_response({"auth": {"client_token": "tok-1", "lease_duration": 21600}})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value = _mock_async_client(post=login_resp)
            token = await client._login()

        assert token == "tok-1"
        assert client._client_token == "tok-1"
        assert client._token_expires_at > time.monotonic()

    @pytest.mark.asyncio
    async def test_login_sends_role_id_and_secret_id(self):
        client = VaultClient()
        login_resp = _mock_response({"auth": {"client_token": "tok-1", "lease_duration": 21600}})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = _mock_async_client(post=login_resp)
            mock_cls.return_value = mock_client
            await client._login()

        call_kwargs = mock_client.post.call_args
        assert "auth/approle/login" in call_kwargs.args[0]
        assert "role_id" in call_kwargs.kwargs["json"]
        assert "secret_id" in call_kwargs.kwargs["json"]

    @pytest.mark.asyncio
    async def test_get_valid_token_reuses_cached_token_before_expiry(self):
        client = VaultClient()
        client._client_token = "cached-tok"
        client._token_expires_at = time.monotonic() + 3600

        with patch("httpx.AsyncClient") as mock_cls:
            token = await client._get_valid_token()

        assert token == "cached-tok"
        mock_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_valid_token_relogs_in_when_near_expiry(self):
        client = VaultClient()
        client._client_token = "stale-tok"
        client._token_expires_at = time.monotonic() + 10  # inside the safety margin
        login_resp = _mock_response({"auth": {"client_token": "fresh-tok", "lease_duration": 21600}})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value = _mock_async_client(post=login_resp)
            token = await client._get_valid_token()

        assert token == "fresh-tok"


class TestGetSecret:
    @pytest.mark.asyncio
    async def test_get_secret_returns_the_kv_v2_data_dict(self):
        client = VaultClient()
        client._client_token = "tok"
        client._token_expires_at = time.monotonic() + 3600
        secret_resp = _mock_response({
            "data": {"data": {"GROQ_API_KEY": "gsk-real", "CEREBRAS_API_KEY": "csk-real"}, "metadata": {"version": 3}}
        })

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value = _mock_async_client(get=secret_resp)
            result = await client.get_secret("aegis/inference-provider-keys")

        assert result == {"GROQ_API_KEY": "gsk-real", "CEREBRAS_API_KEY": "csk-real"}

    @pytest.mark.asyncio
    async def test_get_secret_requests_the_kv_v2_data_path(self):
        client = VaultClient()
        client._client_token = "tok"
        client._token_expires_at = time.monotonic() + 3600
        secret_resp = _mock_response({"data": {"data": {}, "metadata": {}}})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = _mock_async_client(get=secret_resp)
            mock_cls.return_value = mock_client
            await client.get_secret("aegis/inference-provider-keys")

        call_args = mock_client.get.call_args
        assert call_args.args[0].endswith("/v1/secret/data/aegis/inference-provider-keys")
        assert call_args.kwargs["headers"]["X-Vault-Token"] == "tok"

    @pytest.mark.asyncio
    async def test_get_secret_raises_on_failure_rather_than_swallowing(self):
        # No silent fallback in the generic client itself — that's a
        # caller-specific policy decision (see config_inference_chains.py).
        client = VaultClient()
        client._client_token = "tok"
        client._token_expires_at = time.monotonic() + 3600
        error_resp = _mock_response({"errors": ["not found"]}, status=404)

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value = _mock_async_client(get=error_resp)
            with pytest.raises(Exception):
                await client.get_secret("does/not/exist")


class TestPutSecret:
    @pytest.mark.asyncio
    async def test_put_secret_sends_data_wrapped_for_kv_v2(self):
        client = VaultClient()
        client._client_token = "tok"
        client._token_expires_at = time.monotonic() + 3600
        write_resp = _mock_response({})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = _mock_async_client(post=write_resp)
            mock_cls.return_value = mock_client
            await client.put_secret("aegis/inference-provider-keys", {"GROQ_API_KEY": "new-key"})

        call_kwargs = mock_client.post.call_args
        assert call_kwargs.args[0].endswith("/v1/secret/data/aegis/inference-provider-keys")
        assert call_kwargs.kwargs["json"] == {"data": {"GROQ_API_KEY": "new-key"}}


class TestHealthCheck:
    @pytest.mark.asyncio
    async def test_health_check_healthy_when_login_succeeds(self):
        client = VaultClient()
        login_resp = _mock_response({"auth": {"client_token": "tok", "lease_duration": 21600}})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value = _mock_async_client(post=login_resp)
            result = await client.health_check()

        assert result == {"status": "healthy"}

    @pytest.mark.asyncio
    async def test_health_check_unhealthy_when_login_fails(self):
        client = VaultClient()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.side_effect = RuntimeError("connection refused")
            result = await client.health_check()

        assert result["status"] == "unhealthy"
        assert "connection refused" in result["error"]
