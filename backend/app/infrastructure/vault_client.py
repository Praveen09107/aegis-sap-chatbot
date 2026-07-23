"""
AEGIS Vault Client.

Generic KV v2 secrets access, AppRole-authenticated. Originally scoped to
just Vault's Database Secrets Engine (dynamic Postgres credentials) — that
path was fully superseded by DEC-051's PgBouncer fix (a static
least-privilege `aegis_pooled_role` now backs the pool; no code anywhere
calls `get_postgres_credentials` any longer, confirmed via grep) and is
removed here. Repurposed per DEC-060/DEC-061/OPEN-14's chosen direction:
the same already-working AppRole auth now backs `get_secret()`, a generic
KV v2 read used by `config_inference_chains.py` to source the 5 external
inference-provider API keys from Vault instead of flat `.env` values,
enabling rotation without a container restart.

The AppRole login token (6h TTL, from setup_vault.py's "token_ttl": "6h")
is cached and refreshed proactively (a safety margin before actual expiry),
never mid-use — a caller mid-request is unaffected by a renewal that
happens on the next call.
"""
import logging
import time
from typing import Optional

import httpx

from app.config import VAULT_URL, VAULT_ROLE_ID, VAULT_SECRET_ID

logger = logging.getLogger(__name__)

# Renew this many seconds before the token's actual expiry, so a fetch never
# uses a token that could expire mid-use.
RENEWAL_SAFETY_MARGIN_SECONDS = 60


class VaultClient:
    """AppRole-authenticated Vault client for generic KV v2 secret reads."""

    def __init__(self):
        self._client_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    async def _login(self) -> str:
        """AppRole login. Returns a Vault client token, valid for token_ttl (6h)."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{VAULT_URL}/v1/auth/approle/login",
                json={"role_id": VAULT_ROLE_ID, "secret_id": VAULT_SECRET_ID},
            )
            resp.raise_for_status()
            auth = resp.json()["auth"]

        self._client_token = auth["client_token"]
        self._token_expires_at = time.monotonic() + auth["lease_duration"]
        logger.info(f"Vault AppRole login OK, token TTL={auth['lease_duration']}s")
        return self._client_token

    async def _get_valid_token(self) -> str:
        """Return the cached Vault token, or log in again if expired/absent."""
        if self._client_token and time.monotonic() < self._token_expires_at - RENEWAL_SAFETY_MARGIN_SECONDS:
            return self._client_token
        return await self._login()

    async def get_secret(self, path: str) -> dict:
        """
        Generic KV v2 read. `path` is the logical secret path under the
        `secret/` KV v2 mount (e.g. "aegis/inference-provider-keys") —
        NOT including the `data/` segment KV v2's real API requires; that's
        added here so callers work with plain logical paths.

        Returns the secret's key-value dict (KV v2's `data.data`, not the
        surrounding `data.metadata` envelope). Raises on any failure
        (unreachable Vault, 404, auth failure) — deliberately no silent
        fallback here; callers that need a `.env`-fallback policy (e.g.
        config_inference_chains.py's provider-key refresh) implement that
        themselves, since whether a given secret has a sensible fallback at
        all is caller-specific, not a generic-client concern.
        """
        token = await self._get_valid_token()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{VAULT_URL}/v1/secret/data/{path}",
                headers={"X-Vault-Token": token},
            )
            resp.raise_for_status()
            body = resp.json()

        return body["data"]["data"]

    async def put_secret(self, path: str, data: dict) -> None:
        """Generic KV v2 write — used by scripts/setup_vault.py's seeding step and by real key rotation."""
        token = await self._get_valid_token()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{VAULT_URL}/v1/secret/data/{path}",
                headers={"X-Vault-Token": token},
                json={"data": data},
            )
            resp.raise_for_status()

    async def health_check(self) -> dict:
        """Confirm Vault is reachable and AppRole login succeeds."""
        try:
            await self._get_valid_token()
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


# Singleton instance
vault_client = VaultClient()
