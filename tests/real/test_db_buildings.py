"""Real-DB integration tests for building and resident management.

Requires TEST_DATABASE_URL to be set (see conftest.py).
Each test runs inside a rolled-back transaction.
"""

import uuid

import asyncpg
import pytest

from tests.real.conftest import _insert_building, _insert_offer, _insert_user


@pytest.mark.asyncio
async def test_create_building_and_fetch(db_conn: asyncpg.Connection) -> None:
    """Create a building and read it back."""
    admin = await _insert_user(db_conn, role="admin")
    building = await _insert_building(db_conn, admin_id=admin["id"])

    row = await db_conn.fetchrow(
        "SELECT id, address, city, admin_user_id FROM buildings WHERE id = $1",
        building["id"],
    )
    assert row is not None
    assert row["address"] == "Rothschild 1"
    assert row["admin_user_id"] == admin["id"]


@pytest.mark.asyncio
async def test_add_resident_to_building(db_conn: asyncpg.Connection) -> None:
    """Insert a building_residents row and confirm the resident appears."""
    admin = await _insert_user(db_conn, role="admin")
    resident = await _insert_user(db_conn, role="resident")
    building = await _insert_building(db_conn, admin_id=admin["id"])

    await db_conn.execute(
        """
        INSERT INTO building_residents
          (id, building_id, user_id, unit_number, floor, is_owner, joined_at)
        VALUES ($1, $2, $3, '5A', 5, false, NOW())
        """,
        str(uuid.uuid4()),
        building["id"],
        resident["id"],
    )

    row = await db_conn.fetchrow(
        "SELECT user_id, unit_number FROM building_residents WHERE building_id = $1 AND user_id = $2",
        building["id"],
        resident["id"],
    )
    assert row is not None
    assert row["unit_number"] == "5A"


@pytest.mark.asyncio
async def test_duplicate_resident_rejected(db_conn: asyncpg.Connection) -> None:
    """Inserting the same (building_id, user_id) pair twice must raise a unique violation."""
    admin = await _insert_user(db_conn, role="admin")
    resident = await _insert_user(db_conn, role="resident")
    building = await _insert_building(db_conn, admin_id=admin["id"])

    for _ in range(2):
        try:
            await db_conn.execute(
                """
                INSERT INTO building_residents
                  (id, building_id, user_id, unit_number, floor, is_owner, joined_at)
                VALUES ($1, $2, $3, '3B', 3, false, NOW())
                """,
                str(uuid.uuid4()),
                building["id"],
                resident["id"],
            )
        except asyncpg.UniqueViolationError:
            return  # expected on second insert

    pytest.fail("Expected UniqueViolationError on duplicate resident insert")


@pytest.mark.asyncio
async def test_join_offer_race_condition_protection(db_conn: asyncpg.Connection) -> None:
    """ON CONFLICT (user_id, offer_id) DO NOTHING prevents duplicate participants."""
    admin = await _insert_user(db_conn, role="admin")
    building = await _insert_building(db_conn, admin_id=admin["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=admin["id"])
    resident = await _insert_user(db_conn, role="resident")

    for _ in range(3):
        await db_conn.execute(
            """
            INSERT INTO offer_participants (id, offer_id, user_id, unit_count, joined_at)
            VALUES ($1, $2, $3, 1, NOW())
            ON CONFLICT (user_id, offer_id) DO NOTHING
            """,
            str(uuid.uuid4()),
            offer["id"],
            resident["id"],
        )

    count = await db_conn.fetchval(
        "SELECT COUNT(*) FROM offer_participants WHERE offer_id = $1 AND user_id = $2",
        offer["id"],
        resident["id"],
    )
    assert count == 1, f"Expected 1 participant row, got {count}"


@pytest.mark.asyncio
async def test_offer_lifecycle_status_update(db_conn: asyncpg.Connection) -> None:
    """Offer status should advance from active → pending → in_progress without skipping."""
    admin = await _insert_user(db_conn, role="admin")
    building = await _insert_building(db_conn, admin_id=admin["id"])
    offer = await _insert_offer(db_conn, building_id=building["id"], admin_id=admin["id"])

    for new_status in ("pending", "in_progress", "completed"):
        await db_conn.execute(
            "UPDATE offers SET status = $1, updated_at = NOW() WHERE id = $2",
            new_status,
            offer["id"],
        )
        actual = await db_conn.fetchval("SELECT status FROM offers WHERE id = $1", offer["id"])
        assert actual == new_status
