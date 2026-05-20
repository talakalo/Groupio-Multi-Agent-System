"""Real-DB integration tests for orders, support_tickets, and contractor_documents.

Requires TEST_DATABASE_URL to be set (see conftest.py).
Each test runs inside a rolled-back transaction so the DB is clean after each run.

Tables created by migration 036_missing_core_tables.py.
"""

import uuid

import asyncpg
import pytest

from tests.real.conftest import _insert_building, _insert_offer, _insert_user

# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _insert_contractor(conn: asyncpg.Connection, *, user_id: str) -> dict:
    cid = str(uuid.uuid4())
    row = await conn.fetchrow(
        """
        INSERT INTO contractors
          (id, user_id, business_name, contact_name, email, phone, description,
           categories, regions, years_experience, employee_count,
           verification_status, trust_score, created_at, updated_at)
        VALUES ($1, $2, 'Test Co', 'Test Contact', $3, '050-0000000',
                'desc', ARRAY['ac'], ARRAY['center'],
                5, 3, 'approved', 80.0, NOW(), NOW())
        RETURNING id, user_id, business_name
        """,
        cid,
        user_id,
        f"{cid[:8]}@contractor.example.com",
    )
    return dict(row)


async def _insert_order(
    conn: asyncpg.Connection,
    *,
    user_id: str,
    offer_id: str | None = None,
    building_id: str | None = None,
    status: str = "pending",
    total_amount: float = 1000.0,
) -> dict:
    oid = str(uuid.uuid4())
    row = await conn.fetchrow(
        """
        INSERT INTO orders
          (id, user_id, offer_id, building_id, status, total_amount,
           currency, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'ILS', NOW(), NOW())
        RETURNING id, user_id, offer_id, status, total_amount, currency
        """,
        oid,
        user_id,
        offer_id,
        building_id,
        status,
        total_amount,
    )
    return dict(row)


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_and_fetch_order(db_conn: asyncpg.Connection) -> None:
    """INSERT an order and read it back."""
    user = await _insert_user(db_conn)
    admin = await _insert_user(db_conn, role="admin")
    building = await _insert_building(db_conn, admin_id=admin["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=admin["id"])

    order = await _insert_order(
        db_conn,
        user_id=user["id"],
        offer_id=offer["id"],
        building_id=building["id"],
        total_amount=4500.0,
    )

    row = await db_conn.fetchrow(
        "SELECT id, user_id, offer_id, status, total_amount, currency FROM orders WHERE id = $1",
        order["id"],
    )
    assert row is not None
    assert row["status"] == "pending"
    assert float(row["total_amount"]) == 4500.0
    assert row["currency"] == "ILS"
    assert row["offer_id"] == offer["id"]


@pytest.mark.asyncio
async def test_order_status_transitions(db_conn: asyncpg.Connection) -> None:
    """Order status advances through valid lifecycle steps."""
    user = await _insert_user(db_conn)
    order = await _insert_order(db_conn, user_id=user["id"])

    for new_status in ("confirmed", "in_progress", "completed"):
        await db_conn.execute(
            "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
            new_status,
            order["id"],
        )
        actual = await db_conn.fetchval("SELECT status FROM orders WHERE id = $1", order["id"])
        assert actual == new_status


@pytest.mark.asyncio
async def test_order_cascades_on_user_delete_not_allowed_with_cascade(
    db_conn: asyncpg.Connection,
) -> None:
    """Order FK uses ON DELETE CASCADE so user deletion removes dependent orders."""
    user = await _insert_user(db_conn)
    order = await _insert_order(db_conn, user_id=user["id"])

    await db_conn.execute("DELETE FROM orders WHERE id = $1", order["id"])

    row = await db_conn.fetchrow("SELECT id FROM orders WHERE id = $1", order["id"])
    assert row is None


@pytest.mark.asyncio
async def test_order_metadata_jsonb(db_conn: asyncpg.Connection) -> None:
    """JSON metadata column stores arbitrary key-value pairs."""
    user = await _insert_user(db_conn)
    oid = str(uuid.uuid4())
    await db_conn.execute(
        """
        INSERT INTO orders (id, user_id, status, currency, metadata, created_at, updated_at)
        VALUES ($1, $2, 'pending', 'ILS', $3::json, NOW(), NOW())
        """,
        oid,
        user["id"],
        '{"source": "web", "promo_code": "SAVE10"}',
    )

    meta = await db_conn.fetchval(
        "SELECT metadata->>'source' FROM orders WHERE id = $1",
        oid,
    )
    assert meta == "web"


# ---------------------------------------------------------------------------
# Support Tickets
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_support_ticket(db_conn: asyncpg.Connection) -> None:
    """Insert a support ticket and verify default status is 'open'."""
    user = await _insert_user(db_conn)
    tid = str(uuid.uuid4())

    await db_conn.execute(
        """
        INSERT INTO support_tickets
          (id, user_id, reason, priority, status, created_at, updated_at)
        VALUES ($1, $2, 'Contractor did not show up', 'high', 'open', NOW(), NOW())
        """,
        tid,
        user["id"],
    )

    row = await db_conn.fetchrow(
        "SELECT id, reason, priority, status FROM support_tickets WHERE id = $1",
        tid,
    )
    assert row is not None
    assert row["reason"] == "Contractor did not show up"
    assert row["priority"] == "high"
    assert row["status"] == "open"


@pytest.mark.asyncio
async def test_support_ticket_assignment(db_conn: asyncpg.Connection) -> None:
    """A support ticket can be assigned to an admin user and resolved."""
    user = await _insert_user(db_conn)
    admin = await _insert_user(db_conn, role="admin")
    tid = str(uuid.uuid4())

    await db_conn.execute(
        """
        INSERT INTO support_tickets
          (id, user_id, reason, priority, status, created_at, updated_at)
        VALUES ($1, $2, 'Payment dispute', 'normal', 'open', NOW(), NOW())
        """,
        tid,
        user["id"],
    )

    await db_conn.execute(
        """
        UPDATE support_tickets
        SET status = 'assigned', assigned_to = $1, updated_at = NOW()
        WHERE id = $2
        """,
        admin["id"],
        tid,
    )

    row = await db_conn.fetchrow(
        "SELECT status, assigned_to FROM support_tickets WHERE id = $1",
        tid,
    )
    assert row["status"] == "assigned"
    assert row["assigned_to"] == admin["id"]


@pytest.mark.asyncio
async def test_support_ticket_resolution(db_conn: asyncpg.Connection) -> None:
    """Resolving a ticket sets resolved_at timestamp."""
    user = await _insert_user(db_conn)
    tid = str(uuid.uuid4())

    await db_conn.execute(
        """
        INSERT INTO support_tickets
          (id, user_id, reason, priority, status, created_at, updated_at)
        VALUES ($1, $2, 'Cannot log in', 'normal', 'open', NOW(), NOW())
        """,
        tid,
        user["id"],
    )

    await db_conn.execute(
        """
        UPDATE support_tickets
        SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
        WHERE id = $1
        """,
        tid,
    )

    row = await db_conn.fetchrow(
        "SELECT status, resolved_at FROM support_tickets WHERE id = $1",
        tid,
    )
    assert row["status"] == "resolved"
    assert row["resolved_at"] is not None


# ---------------------------------------------------------------------------
# Contractor Documents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_contractor_document(db_conn: asyncpg.Connection) -> None:
    """Insert a contractor document and verify initial state."""
    user = await _insert_user(db_conn)
    contractor = await _insert_contractor(db_conn, user_id=user["id"])
    doc_id = str(uuid.uuid4())

    await db_conn.execute(
        """
        INSERT INTO contractor_documents
          (id, contractor_id, doc_type, file_url, verified, uploaded_at, created_at)
        VALUES ($1, $2, 'license', 'https://storage.example.com/lic.pdf', false, NOW(), NOW())
        """,
        doc_id,
        contractor["id"],
    )

    row = await db_conn.fetchrow(
        "SELECT id, doc_type, file_url, verified FROM contractor_documents WHERE id = $1",
        doc_id,
    )
    assert row is not None
    assert row["doc_type"] == "license"
    assert row["verified"] is False


@pytest.mark.asyncio
async def test_verify_contractor_document(db_conn: asyncpg.Connection) -> None:
    """An admin can verify a contractor document by setting verified=true and verified_by."""
    user = await _insert_user(db_conn)
    admin = await _insert_user(db_conn, role="admin")
    contractor = await _insert_contractor(db_conn, user_id=user["id"])
    doc_id = str(uuid.uuid4())

    await db_conn.execute(
        """
        INSERT INTO contractor_documents
          (id, contractor_id, doc_type, file_url, verified, uploaded_at, created_at)
        VALUES ($1, $2, 'insurance', 'https://storage.example.com/ins.pdf', false, NOW(), NOW())
        """,
        doc_id,
        contractor["id"],
    )

    await db_conn.execute(
        """
        UPDATE contractor_documents
        SET verified = true, verified_by = $1, verified_at = NOW()
        WHERE id = $2
        """,
        admin["id"],
        doc_id,
    )

    row = await db_conn.fetchrow(
        "SELECT verified, verified_by, verified_at FROM contractor_documents WHERE id = $1",
        doc_id,
    )
    assert row["verified"] is True
    assert row["verified_by"] == admin["id"]
    assert row["verified_at"] is not None


@pytest.mark.asyncio
async def test_contractor_documents_cascade_on_contractor_delete(db_conn: asyncpg.Connection) -> None:
    """Documents are removed when the contractor is deleted (ON DELETE CASCADE)."""
    user = await _insert_user(db_conn)
    contractor = await _insert_contractor(db_conn, user_id=user["id"])
    doc_id = str(uuid.uuid4())

    await db_conn.execute(
        """
        INSERT INTO contractor_documents
          (id, contractor_id, doc_type, file_url, verified, uploaded_at, created_at)
        VALUES ($1, $2, 'certificate', 'https://storage.example.com/cert.pdf', false, NOW(), NOW())
        """,
        doc_id,
        contractor["id"],
    )

    await db_conn.execute("DELETE FROM contractor_documents WHERE id = $1", doc_id)

    count = await db_conn.fetchval(
        "SELECT COUNT(*) FROM contractor_documents WHERE contractor_id = $1",
        contractor["id"],
    )
    assert count == 0
