"""Prove migration 031 idempotency semantics on a real PostgreSQL database when available.

Skips cleanly when DATABASE_URL is not PostgreSQL, connection fails, or table
``stripe_webhook_events`` is missing (alembic upgrade head not applied).
"""

from __future__ import annotations

import os
import uuid
from urllib.parse import urlparse

import pytest


def _is_postgres_dsn(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url.replace("postgres://", "postgresql://", 1))
    return parsed.scheme in ("postgresql", "postgresql+asyncpg")


@pytest.mark.asyncio
async def test_stripe_webhook_event_insert_idempotent_on_postgres() -> None:
    import asyncpg

    from src.config.settings import get_settings

    settings = get_settings()
    dsn = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
    if not _is_postgres_dsn(dsn):
        pytest.skip("Requires PostgreSQL DATABASE_URL for stripe_webhook_events idempotency proof")

    if dsn.startswith("postgres://"):
        dsn = dsn.replace("postgres://", "postgresql://", 1)

    connect_dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

    try:
        conn = await asyncpg.connect(connect_dsn, timeout=10)
    except Exception as exc:  # noqa: BLE001 — skip with reason
        pytest.skip(f"PostgreSQL not reachable for idempotency test: {exc}")

    try:
        reg = await conn.fetchval("SELECT to_regclass('public.stripe_webhook_events')")
        if reg is None:
            pytest.skip(
                "Table public.stripe_webhook_events missing — apply alembic through revision 031 "
                "(031_stripe_webhook_idempotency)"
            )

        event_id = f"evt_idem_test_{uuid.uuid4().hex}"
        row1 = await conn.fetchrow(
            "INSERT INTO stripe_webhook_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id",
            event_id,
        )
        assert row1 is not None
        row2 = await conn.fetchrow(
            "INSERT INTO stripe_webhook_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id",
            event_id,
        )
        assert row2 is None

        await conn.execute("DELETE FROM stripe_webhook_events WHERE id = $1", event_id)
    finally:
        await conn.close()
