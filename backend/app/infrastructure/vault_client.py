"""
AEGIS Vault Client.

Fetches short-lived, dynamically-generated PostgreSQL credentials from
Vault's Database Secrets Engine (configured by scripts/setup_vault.py)
instead of using a static application user — there is no static Postgres
login role for the application; migration 004_initial_data.sql creates
only the non-login aegis_app_role group, with its own comment stating
"Vault will create actual users dynamically."

Two nested leases are cached and independently renewed:
  - The AppRole login token (6h TTL, from setup_vault.py's
    "token_ttl": "6h") — authenticates this client to Vault itself.
  - The dynamic Postgres credential (1h TTL, from setup_vault.py's
    "default_ttl": "1h") — a real, uniquely-named Postgres role granted
    aegis_app_role, auto-revoked by Vault at lease expiry.

Both are refreshed proactively (a safety margin before actual expiry),
never mid-use — a caller in the middle of a long-lived connection is
unaffected by a lease renewal that happens on the next call.
"""
import logging
import time
from typing import Optional, Tuple

import httpx

from app.config import VAULT_URL, VAULT_ROLE_ID, VAULT_SECRET_ID, VAULT_POSTGRES_ROLE

logger = logging.getLogger(__name__)

# Renew this many seconds before a lease's actual expiry, so a fetch never
# hands out a credential/token that could expire mid-use.
RENEWAL_SAFETY_MARGIN_SECONDS = 60


class VaultClient:
    """
    AppRole-authenticated Vault client, scoped to what this application
    actually needs: dynamic PostgreSQL credentials via the Database
    Secrets Engine. Transit and PKI engines (also configured by
    setup_vault.py) are out of scope here — nothing in the application
    currently calls them.
    """

    def __init__(self):
        self._client_token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._pg_username: Optional[str] = None
        self._pg_password: Optional[str] = None
        self._pg_lease_id: Optional[str] = None
        self._pg_expires_at: float = 0.0

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

    async def get_postgres_credentials(self) -> Tuple[str, str]:
        """
        Return a valid (username, password) pair for Postgres, fetching a
        fresh dynamic credential from Vault if the cached one is absent or
        within RENEWAL_SAFETY_MARGIN_SECONDS of its lease expiry.
        """
        if (
            self._pg_username
            and time.monotonic() < self._pg_expires_at - RENEWAL_SAFETY_MARGIN_SECONDS
        ):
            return self._pg_username, self._pg_password

        token = await self._get_valid_token()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{VAULT_URL}/v1/database/creds/{VAULT_POSTGRES_ROLE}",
                headers={"X-Vault-Token": token},
            )
            resp.raise_for_status()
            body = resp.json()

        data = body["data"]
        self._pg_username = data["username"]
        self._pg_password = data["password"]
        self._pg_lease_id = body["lease_id"]
        self._pg_expires_at = time.monotonic() + body["lease_duration"]
        logger.info(
            f"Vault issued dynamic Postgres credential '{self._pg_username}', "
            f"lease TTL={body['lease_duration']}s"
        )
        return self._pg_username, self._pg_password

    async def health_check(self) -> dict:
        """Confirm Vault is reachable and AppRole login succeeds."""
        try:
            await self._get_valid_token()
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


# Singleton instance
vault_client = VaultClient()
