"""Real-DB integration tests for payment creation and retrieval.

Requires TEST_DATABASE_URL to be set (see conftest.py).
Each test runs inside a rolled-back transaction so the DB is clean after each run.
"""

import uuid

import asyncpg
import pytest

from tests.real.conftest import _insert_building, _insert_offer, _insert_user


@pytest.mark.asyncio
async def test_create_and_fetch_payment(db_conn: asyncpg.Connection) -> None:
    """INSERT a payment row and immediately SELECT it back."""
    user = await _insert_user(db_conn)
    building = await _insert_building(db_conn, admin_id=user["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=user["id"])

    payment_id = str(uuid.uuid4())
    idempotency_key = f"test-{payment_id}"

    await db_conn.execute(
        """
        INSERT INTO payments
          (id, user_id, offer_id, amount, currency, status,
           provider, idempotency_key, created_at, updated_at)
        VALUES ($1, $2, $3, 5000, 'ILS', 'pending', 'stripe', $4, NOW(), NOW())
        """,
        payment_id,
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

    key = f"idem-{uuid.uuid4()}"

    await db_conn.execute(
        """
        INSERT INTO payments (id, user_id, offer_id, amount, currency, status,
                              provider, idempotency_key, created_at, updated_at)
        VALUES ($1, $2, $3, 500, 'ILS', 'pending', 'stripe', $4, NOW(), NOW())
        """,
        str(uuid.uuid4()),
        user["id"],
        offer["id"],
        key,
    )

    with pytest.raises(asyncpg.UniqueViolationError):
        await db_conn.execute(
            """
            INSERT INTO payments (id, user_id, offer_id, amount, currency, status,
                                  provider, idempotency_key, created_at, updated_at)
            VALUES ($1, $2, $3, 500, 'ILS', 'pending', 'stripe', $4, NOW(), NOW())
            """,
            str(uuid.uuid4()),
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

    shared_key = "shared-key-ok"

    for user in (user_a, user_b):
        await db_conn.execute(
            """
            INSERT INTO payments (id, user_id, offer_id, amount, currency, status,
                                  provider, idempotency_key, created_at, updated_at)
            VALUES ($1, $2, $3, 100, 'ILS', 'pending', 'stripe', $4, NOW(), NOW())
            """,
            str(uuid.uuid4()),
            user["id"],
            offer["id"],
            shared_key,
        )

    count = await db_conn.fetchval(
        "SELECT COUNT(*) FROM payments WHERE idempotency_key = $1", shared_key
    )
    assert count == 2


@pytest.mark.asyncio
async def test_payment_status_transitions(db_conn: asyncpg.Connection) -> None:
    """UPDATE payment status and verify the change persists within the transaction."""
    user = await _insert_user(db_conn)
    building = await _insert_building(db_conn, admin_id=user["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=user["id"])

    pid = str(uuid.uuid4())
    await db_conn.execute(
        """
        INSERT INTO payments (id, user_id, offer_id, amount, currency, status,
                              provider, created_at, updated_at)
        VALUES ($1, $2, $3, 1000, 'ILS', 'pending', 'stripe', NOW(), NOW())
        """,
        pid, user["id"], offer["id"],
    )

    await db_conn.execute(
        "UPDATE payments SET status = 'succeeded', updated_at = NOW() WHERE id = $1",
        pid,
    )

    status = await db_conn.fetchval("SELECT status FROM payments WHERE id = $1", pid)
    assert status == "succeeded"
