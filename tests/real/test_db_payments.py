"""Real-DB integration tests for payment creation and retrieval.

Requires TEST_DATABASE_URL to be set (see conftest.py).
Each test runs inside a rolled-back transaction so the DB is clean after each run.
"""

import uuid

import asyncpg
import pytest

from tests.real.conftest import _insert_building, _insert_offer, _insert_user


async def _insert_invoice(
    conn: asyncpg.Connection,
    *,
    offer_id: str,
    subtotal: float,
    tax_rate: float = 0.17,
    status: str = "draft",
) -> dict:
    invoice_id = str(uuid.uuid4())
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax_amount, 2)
    row = await conn.fetchrow(
        """
        INSERT INTO invoices
          (id, offer_id, invoice_number, type, status, subtotal, tax_rate, tax_amount,
           total, currency, created_at, updated_at)
        VALUES ($1, $2, $3, 'group_offer', $4, $5, $6, $7, $8, 'ILS', NOW(), NOW())
        RETURNING id, offer_id, status, subtotal, tax_amount, total
        """,
        invoice_id,
        offer_id,
        f"INV-{invoice_id[:8]}",
        status,
        subtotal,
        tax_rate,
        tax_amount,
        total,
    )
    return dict(row)


@pytest.mark.asyncio
async def test_create_and_fetch_payment(db_conn: asyncpg.Connection) -> None:
    """INSERT a payment row and immediately SELECT it back."""
    user = await _insert_user(db_conn)
    building = await _insert_building(db_conn, admin_id=user["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=user["id"])
    invoice = await _insert_invoice(db_conn, offer_id=offer["id"], subtotal=5000)

    payment_id = str(uuid.uuid4())
    idempotency_key = f"test-{payment_id}"

    await db_conn.execute(
        """
        INSERT INTO payments
          (id, invoice_id, user_id, offer_id, amount, currency, status,
           provider, idempotency_key, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 5000, 'ILS', 'pending', 'stripe', $5, NOW(), NOW())
        """,
        payment_id,
        invoice["id"],
        user["id"],
        offer["id"],
        idempotency_key,
    )

    row = await db_conn.fetchrow(
        "SELECT id, user_id, amount, status, idempotency_key FROM payments WHERE id = $1",
        payment_id,
    )
    assert row is not None
    assert row["status"] == "pending"
    assert float(row["amount"]) == 5000.0
    assert row["idempotency_key"] == idempotency_key


@pytest.mark.asyncio
async def test_idempotency_key_unique_per_user(db_conn: asyncpg.Connection) -> None:
    """Two payments from the same user with the same idempotency_key must violate the unique index."""
    user = await _insert_user(db_conn)
    building = await _insert_building(db_conn, admin_id=user["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=user["id"])
    invoice_a = await _insert_invoice(db_conn, offer_id=offer["id"], subtotal=500)
    invoice_b = await _insert_invoice(db_conn, offer_id=offer["id"], subtotal=500)

    key = f"idem-{uuid.uuid4()}"

    await db_conn.execute(
        """
        INSERT INTO payments (id, invoice_id, user_id, offer_id, amount, currency, status,
                              provider, idempotency_key, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 500, 'ILS', 'pending', 'stripe', $5, NOW(), NOW())
        """,
        str(uuid.uuid4()),
        invoice_a["id"],
        user["id"],
        offer["id"],
        key,
    )

    with pytest.raises(asyncpg.UniqueViolationError):
        await db_conn.execute(
            """
            INSERT INTO payments (id, invoice_id, user_id, offer_id, amount, currency, status,
                                  provider, idempotency_key, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 500, 'ILS', 'pending', 'stripe', $5, NOW(), NOW())
            """,
            str(uuid.uuid4()),
            invoice_b["id"],
            user["id"],
            offer["id"],
            key,
        )


@pytest.mark.asyncio
async def test_different_users_can_reuse_same_idempotency_key(db_conn: asyncpg.Connection) -> None:
    """The partial unique index is (user_id, idempotency_key) so two different users
    may share the same key string without a constraint violation."""
    user_a = await _insert_user(db_conn)
    user_b = await _insert_user(db_conn)
    building = await _insert_building(db_conn, admin_id=user_a["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=user_a["id"])
    invoice_a = await _insert_invoice(db_conn, offer_id=offer["id"], subtotal=100)
    invoice_b = await _insert_invoice(db_conn, offer_id=offer["id"], subtotal=100)

    shared_key = "shared-key-ok"

    for user, invoice in ((user_a, invoice_a), (user_b, invoice_b)):
        await db_conn.execute(
            """
            INSERT INTO payments (id, invoice_id, user_id, offer_id, amount, currency, status,
                                  provider, idempotency_key, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 100, 'ILS', 'pending', 'stripe', $5, NOW(), NOW())
            """,
            str(uuid.uuid4()),
            invoice["id"],
            user["id"],
            offer["id"],
            shared_key,
        )

    count = await db_conn.fetchval("SELECT COUNT(*) FROM payments WHERE idempotency_key = $1", shared_key)
    assert count == 2


@pytest.mark.asyncio
async def test_payment_status_transitions(db_conn: asyncpg.Connection) -> None:
    """UPDATE payment status and verify the change persists within the transaction."""
    user = await _insert_user(db_conn)
    building = await _insert_building(db_conn, admin_id=user["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=user["id"])
    invoice = await _insert_invoice(db_conn, offer_id=offer["id"], subtotal=1000)

    pid = str(uuid.uuid4())
    await db_conn.execute(
        """
        INSERT INTO payments (id, invoice_id, user_id, offer_id, amount, currency, status,
                              provider, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1000, 'ILS', 'pending', 'stripe', NOW(), NOW())
        """,
        pid,
        invoice["id"],
        user["id"],
        offer["id"],
    )

    await db_conn.execute(
        "UPDATE payments SET status = 'succeeded', updated_at = NOW() WHERE id = $1",
        pid,
    )

    status = await db_conn.fetchval("SELECT status FROM payments WHERE id = $1", pid)
    assert status == "succeeded"
