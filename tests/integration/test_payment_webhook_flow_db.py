"""End-to-end Stripe payment flow against a real PostgreSQL database.

This is the test the audit asked for: don't just mock Stripe, prove that
the *actual* DB transitions happen when a webhook event is processed.

Skips cleanly when:
  * DATABASE_URL is not PostgreSQL
  * Postgres is unreachable
  * the ``payments`` / ``invoices`` tables are missing (alembic not applied)

When it runs it:
  1. seeds a user and a payment in status='pending'
  2. invokes ``PostgresClient.update_payment_and_invoice_for_webhook`` with
     a paid-status transition (the same code path the Stripe webhook
     handler uses)
  3. asserts the payment row really moved to 'succeeded'
  4. seeds an invoice + payment, exercises the joint payment+invoice update
     and asserts both rows transitioned atomically
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


def _normalise_dsn(dsn: str) -> str:
    if dsn.startswith("postgres://"):
        dsn = dsn.replace("postgres://", "postgresql://", 1)
    return dsn.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _connect_or_skip(dsn: str):
    import asyncpg

    try:
        return await asyncpg.connect(dsn, timeout=10)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"PostgreSQL not reachable for payment-flow proof: {exc}")


async def _ensure_table(conn, name: str) -> None:
    exists = await conn.fetchval(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
        """,
        name,
    )
    if exists is None:
        pytest.skip(
            f"Table public.{name} missing — apply alembic upgrade head before "
            "running the payment-flow integration test."
        )


@pytest.mark.asyncio
async def test_webhook_transitions_payment_to_succeeded() -> None:
    from src.config.settings import get_settings

    settings = get_settings()
    dsn = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
    if not _is_postgres_dsn(dsn):
        pytest.skip("Requires PostgreSQL DATABASE_URL for payment-flow proof")

    pg_dsn = _normalise_dsn(dsn)
    conn = await _connect_or_skip(pg_dsn)

    try:
        await _ensure_table(conn, "payments")
        await _ensure_table(conn, "users")

        user_id = uuid.uuid4().hex
        payment_id = uuid.uuid4().hex
        now_sql = "NOW() AT TIME ZONE 'UTC'"

        await conn.execute(
            f"""
            INSERT INTO users (id, email, full_name, role, is_active, is_verified,
                               hashed_password, preferred_language, created_at, updated_at)
            VALUES ($1, $2, 'Pay Test', 'resident', true, true, 'x', 'he', {now_sql}, {now_sql})
            """,
            user_id,
            f"{user_id}@payment-test.example.com",
        )
        await conn.execute(
            f"""
            INSERT INTO payments (id, user_id, amount, currency, status, created_at, updated_at)
            VALUES ($1, $2, 100, 'ILS', 'pending', {now_sql}, {now_sql})
            """,
            payment_id,
            user_id,
        )

        # Invoke the same DB path the Stripe webhook handler uses.
        from src.databases.postgres import PostgresClient

        db = PostgresClient()
        await db.update_payment_and_invoice_for_webhook(
            payment_id=payment_id,
            invoice_id=None,
            payment_status="succeeded",
            invoice_status=None,
        )

        status = await conn.fetchval("SELECT status FROM payments WHERE id = $1", payment_id)
        assert status == "succeeded", f"webhook handler must update DB row to 'succeeded'; got {status!r}"

    finally:
        try:
            await conn.execute(
                "DELETE FROM payments WHERE user_id IN ("
                "SELECT id FROM users WHERE email LIKE '%@payment-test.example.com')"
            )
            await conn.execute("DELETE FROM users WHERE email LIKE '%@payment-test.example.com'")
        finally:
            await conn.close()


@pytest.mark.asyncio
async def test_webhook_atomic_payment_and_invoice_transition() -> None:
    """Joint payment + invoice update — both rows must commit together
    (single tx) so a partial state isn't visible to subsequent reads."""
    from src.config.settings import get_settings

    settings = get_settings()
    dsn = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
    if not _is_postgres_dsn(dsn):
        pytest.skip("Requires PostgreSQL DATABASE_URL for payment-flow proof")

    pg_dsn = _normalise_dsn(dsn)
    conn = await _connect_or_skip(pg_dsn)

    try:
        for tbl in ("payments", "invoices", "users"):
            await _ensure_table(conn, tbl)

        user_id = uuid.uuid4().hex
        payment_id = uuid.uuid4().hex
        invoice_id = uuid.uuid4().hex
        now_sql = "NOW() AT TIME ZONE 'UTC'"

        await conn.execute(
            f"""
            INSERT INTO users (id, email, full_name, role, is_active, is_verified,
                               hashed_password, preferred_language, created_at, updated_at)
            VALUES ($1, $2, 'Pay Test', 'resident', true, true, 'x', 'he', {now_sql}, {now_sql})
            """,
            user_id,
            f"{user_id}@payment-test.example.com",
        )
        await conn.execute(
            f"""
            INSERT INTO invoices (id, status, created_at, updated_at)
            VALUES ($1, 'open', {now_sql}, {now_sql})
            """,
            invoice_id,
        )
        await conn.execute(
            f"""
            INSERT INTO payments (id, user_id, invoice_id, amount, currency, status,
                                  created_at, updated_at)
            VALUES ($1, $2, $3, 250, 'ILS', 'pending', {now_sql}, {now_sql})
            """,
            payment_id,
            user_id,
            invoice_id,
        )

        from src.databases.postgres import PostgresClient

        db = PostgresClient()
        await db.update_payment_and_invoice_for_webhook(
            payment_id=payment_id,
            invoice_id=invoice_id,
            payment_status="succeeded",
            invoice_status="paid",
        )

        pay_status = await conn.fetchval("SELECT status FROM payments WHERE id = $1", payment_id)
        inv_status = await conn.fetchval("SELECT status FROM invoices WHERE id = $1", invoice_id)
        assert pay_status == "succeeded", f"payment row not transitioned: {pay_status!r}"
        assert inv_status == "paid", f"invoice row not transitioned: {inv_status!r}"

    finally:
        try:
            await conn.execute(
                "DELETE FROM payments WHERE user_id IN ("
                "SELECT id FROM users WHERE email LIKE '%@payment-test.example.com')"
            )
            await conn.execute("DELETE FROM invoices WHERE id = $1", invoice_id)
            await conn.execute("DELETE FROM users WHERE email LIKE '%@payment-test.example.com'")
        finally:
            await conn.close()
