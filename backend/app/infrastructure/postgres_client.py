"""
AEGIS PostgreSQL Client
Centralized async connection pool. One pool per uvicorn worker process.
All application code uses this instead of raw asyncpg.connect().

Connects through PgBouncer (POSTGRES_HOST/PORT point at aegis-pgbouncer:6432)
as the static, least-privilege aegis_pooled_role (aegis_app_role member
only, see migration 008) — not Vault's per-request dynamic credentials.
PgBouncer pools connections to one fixed backend identity per database
alias, so it structurally cannot pass through Vault's uniquely-named,
~hourly-rotating credentials; this was confirmed live (connecting through
PgBouncer with a real Vault-issued credential still resulted in queries
running as PgBouncer's own fixed backend user). A static, properly-scoped
role restores least-privilege while getting genuine pooling — the
trade-off is losing Vault's per-request unique/auto-expiring/individually-
revocable credential properties for pooled connections.
"""
import logging
from typing import Optional, List, Any
from contextlib import asynccontextmanager
import asyncpg
from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

logger = logging.getLogger(__name__)


class PostgresClient:
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        # statement_cache_size=0: asyncpg's default prepared-statement cache
        # is incompatible with PgBouncer's transaction pool_mode (a cached
        # statement can outlive the specific backend connection it was
        # prepared on, once PgBouncer hands that connection to a different
        # client) — confirmed live via DuplicatePreparedStatementError.
        self._pool = await asyncpg.create_pool(
            host=POSTGRES_HOST, port=POSTGRES_PORT, database=POSTGRES_DB,
            user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            min_size=5, max_size=20, timeout=30, command_timeout=60,
            statement_cache_size=0,
        )
        logger.info(f"PostgreSQL pool created: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB} (user={POSTGRES_USER})")

    async def close(self):
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if not self._pool:
            raise RuntimeError("PostgreSQL pool not initialized.")
        return self._pool

    @asynccontextmanager
    async def acquire(self):
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
