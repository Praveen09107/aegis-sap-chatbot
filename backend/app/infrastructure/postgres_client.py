"""
AEGIS PostgreSQL Client
Centralized async connection pool. One pool per uvicorn worker process.
All application code uses this instead of raw asyncpg.connect().

There is no static Postgres login role for the application (see
vault_client.py) — credentials are dynamically issued by Vault with a 1h
TTL and revoked at expiry. A pool built once from a static user/password
would start failing requests the moment Vault revokes that lease, so the
pool is rebuilt transparently whenever Vault has rotated to a new
username. vault_client.get_postgres_credentials() itself is a cheap
in-memory cache read except when the cached lease is near expiry, so
checking it on every acquire() costs nothing in the common case.
"""
import logging
from typing import Optional, List, Any
from contextlib import asynccontextmanager
import asyncpg
from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB

logger = logging.getLogger(__name__)


class PostgresClient:
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None
        self._pool_username: Optional[str] = None

    async def connect(self):
        await self._ensure_pool()

    async def _ensure_pool(self):
        from app.infrastructure.vault_client import vault_client
        pg_user, pg_password = await vault_client.get_postgres_credentials()

        if self._pool is not None and pg_user == self._pool_username:
            return

        old_pool = self._pool
        self._pool = await asyncpg.create_pool(
            host=POSTGRES_HOST, port=POSTGRES_PORT, database=POSTGRES_DB,
            user=pg_user, password=pg_password,
            min_size=5, max_size=20, timeout=30, command_timeout=60,
        )
        self._pool_username = pg_user
        logger.info(f"PostgreSQL pool created: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB} (user={pg_user})")

        if old_pool is not None:
            await old_pool.close()

    async def close(self):
        if self._pool:
            await self._pool.close()

    @asynccontextmanager
    async def acquire(self):
        await self._ensure_pool()
        async with self._pool.acquire() as conn:
            yield conn

    async def fetch(self, query: str, *args) -> List[asyncpg.Record]:
        async with self.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args) -> Optional[asyncpg.Record]:
        async with self.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args) -> Any:
        async with self.acquire() as conn:
            return await conn.fetchval(query, *args)

    async def execute(self, query: str, *args) -> str:
        async with self.acquire() as conn:
            return await conn.execute(query, *args)

    async def health_check(self) -> dict:
        try:
            await self.fetchval("SELECT 1")
            return {"status": "healthy", "pool_size": self._pool.get_size()}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


postgres_client = PostgresClient()
