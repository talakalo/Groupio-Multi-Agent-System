"""Fixtures for real-backend integration tests.

These tests require a live PostgreSQL instance. They are skipped automatically
when TEST_DATABASE_URL is not set, so environments without the DB service stay
green.

To run locally:
  docker compose -f docker/docker-compose.test.yml up -d
  TEST_DATABASE_URL=postgresql://groupio_test:groupio_test@localhost:5433/groupio_test \
  REDIS_URL=redis://localhost:6380 \
    pytest tests/real/ -v
"""

import os
import subprocess
from collections.abc import AsyncGenerator

import asyncpg
import pytest
import pytest_asyncio

_TEST_DSN = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://groupio_test:groupio_test@localhost:5433/groupio_test",
)

# Skip entire module when the env var is absent (CI without the DB service)
_DB_AVAILABLE = bool(os.getenv("TEST_DATABASE_URL"))


def pytest_collection_modifyitems(items, config):
    """Auto-skip every test in tests/real/ when TEST_DATABASE_URL is unset."""
    if _DB_AVAILABLE:
        return
    skip = pytest.mark.skip(reason="TEST_DATABASE_URL not set — start docker/docker-compose.test.yml")
    for item in items:
        if "tests/real" in str(item.fspath):
            item.add_marker(skip)


@pytest.fixture(scope="session")
def _run_migrations():
    """Apply all Alembic migrations to the test DB once per session."""
    env = {**os.environ, "DATABASE_URL": _TEST_DSN, "USE_LOCAL_POSTGRES": "1"}
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        pytest.fail(f"alembic upgrade head failed:\n{result.stderr}")
    return True


@pytest_asyncio.fixture
async def db_pool(_run_migrations) -> AsyncGenerator[asyncpg.Pool, None]:
    """Per-test asyncpg connection pool bound to the active event loop."""
    pool = await asyncpg.create_pool(
        _TEST_DSN,
        min_size=2,
        max_size=5,
        command_timeout=30,
    )
    yield pool
    await pool.close()


@pytest_asyncio.fixture
async def db_conn(db_pool: asyncpg.Pool) -> AsyncGenerator[asyncpg.Connection, None]:
    """Per-test connection with automatic rollback — each test runs in isolation."""
    async with db_pool.acquire() as conn:
        tr = conn.transaction()
        await tr.start()
        yield conn
        await tr.rollback()


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _insert_user(conn: asyncpg.Connection, *, role: str = "resident") -> dict:
    import uuid

    from src.api.middleware.auth import hash_password

    uid = str(uuid.uuid4())
    phone_suffix = str(uuid.uuid4().int % 100000000).zfill(8)
    row = await conn.fetchrow(
        """
        INSERT INTO users
          (id, email, hashed_password, full_name, phone, role, preferred_language,
           is_active, is_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'he', true, true, NOW(), NOW())
        RETURNING id, email, full_name, role, phone
        """,
        uid,
        f"{uid[:8]}@test.example.com",
        hash_password("test-password"),
        "Test User",
        f"05{phone_suffix}",
        role,
    )
    return dict(row)


async def _insert_building(conn: asyncpg.Connection, *, admin_id: str) -> dict:
    import uuid

    bid = str(uuid.uuid4())
    row = await conn.fetchrow(
        """
        INSERT INTO buildings
          (id, name, address, city, region, admin_user_id, total_units, floors, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 20, 5, NOW(), NOW())
        RETURNING id, name, address, city, admin_user_id
        """,
        bid,
        "Rothschild Towers",
        "Rothschild 1",
        "Tel Aviv",
        "center",
        admin_id,
    )
    return dict(row)


async def _insert_offer(conn: asyncpg.Connection, *, building_id: str, admin_id: str) -> dict:
    import uuid

    oid = str(uuid.uuid4())
    row = await conn.fetchrow(
        """
        INSERT INTO offers
          (id, title, description, category, building_id, status, base_price,
           pricing_tiers, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, 'ac', $4, 'active', 5000,
                '[]'::jsonb, $5, NOW(), NOW())
        RETURNING id, title, status, building_id
        """,
        oid,
        "AC Installation",
        "Install a new shared AC system",
        building_id,
        admin_id,
    )
    return dict(row)
