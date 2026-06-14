"""Integration tests for the notifications table schema and endpoint contract.

These tests require a live PostgreSQL connection (Docker stack running).
Skip automatically when DATABASE_URL is not configured or DB is unreachable.

Run:
    pytest tests/integration/test_notifications_schema.py -v
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db_url() -> str:
    """Return the PostgreSQL connection URL suitable for asyncpg.

    Priority:
      1. TEST_DATABASE_URL  — explicit override for test environments
      2. DATABASE_URL       — standard app connection string
    SUPABASE_URL is intentionally excluded: it is an HTTPS API URL, not a
    PostgreSQL DSN, and would cause asyncpg.connect() to fail.
    """
    return os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")


def _db_available() -> bool:
    """True only when a real PostgreSQL DSN is available for asyncpg."""
    return bool(_db_url())


# ---------------------------------------------------------------------------
# Schema test: notifications.read_at column existence (migration 041)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _db_available(), reason="Requires live database (DATABASE_URL not set)")
@pytest.mark.asyncio
async def test_notifications_read_at_column_exists():
    """Verify that the read_at column exists on the notifications table.

    This proves migration 041_notifications_read_at was applied successfully.
    """
    import asyncpg

    db_url = _db_url()
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    conn = await asyncpg.connect(db_url)
    try:
        row = await conn.fetchrow(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'notifications'
              AND column_name  = 'read_at'
            """
        )
        assert row is not None, (
            "Column 'read_at' not found on notifications table. "
            "Run: alembic upgrade head"
        )
        assert row["data_type"] in ("timestamp with time zone", "timestamptz"), (
            f"Expected 'timestamp with time zone', got: {row['data_type']}"
        )
        assert row["is_nullable"] == "YES", (
            "notifications.read_at must be nullable (existing rows have no read_at)"
        )
    finally:
        await conn.close()


@pytest.mark.skipif(not _db_available(), reason="Requires live database (DATABASE_URL not set)")
@pytest.mark.asyncio
async def test_notifications_table_required_columns():
    """Verify all expected columns exist on the notifications table."""
    import asyncpg

    db_url = _db_url()
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    expected_columns = {"id", "user_id", "type", "title", "body", "data", "read", "read_at", "created_at"}

    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'notifications'
            """
        )
        actual = {row["column_name"] for row in rows}
        missing = expected_columns - actual
        assert not missing, (
            f"notifications table is missing columns: {missing}. "
            "Run: alembic upgrade head"
        )
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Endpoint contract tests: GET / and GET /unread-count must return 200 or 401
# These tests do NOT require a live DB — they use mocks.
# ---------------------------------------------------------------------------


def _make_user(role="resident", user_id="user-1"):
    from datetime import UTC, datetime

    from src.models.user import UserInDB, UserRole

    now = datetime.now(UTC)
    return UserInDB(
        id=user_id,
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=UserRole(role),
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _make_db():
    db = MagicMock()
    db._use_supabase_client = MagicMock(return_value=False)
    db.list_notifications = AsyncMock(return_value=([], 0))
    db.get_unread_notification_count = AsyncMock(return_value=0)
    db.mark_all_notifications_read = AsyncMock(return_value=None)
    db.mark_notification_read = AsyncMock(return_value=True)
    db._pg_fetch_one = AsyncMock(return_value=None)
    db._pg_fetch_all = AsyncMock(return_value=[])
    return db


def test_list_notifications_returns_200_not_500():
    """GET /api/v1/notifications/?limit=50&offset=0 must return 200, never 500."""
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    user = _make_user()
    db = _make_db()

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/?limit=50&offset=0")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}: {response.text}"
    )
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["limit"] == 50
    assert data["offset"] == 0


def test_unread_count_returns_200_not_500():
    """GET /api/v1/notifications/unread-count must return 200, never 500."""
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    user = _make_user()
    db = _make_db()
    db.get_unread_notification_count = AsyncMock(return_value=3)

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/unread-count")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}: {response.text}"
    )
    assert response.json() == {"count": 3}


def test_list_notifications_unauthenticated_returns_401_not_500():
    """GET /api/v1/notifications/ without auth must return 401, never 500."""
    from src.api.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/api/v1/notifications/?limit=50&offset=0")

    assert response.status_code == 401, (
        f"Expected 401 for unauthenticated request, got {response.status_code}: {response.text}"
    )


def test_unread_count_unauthenticated_returns_401_not_500():
    """GET /api/v1/notifications/unread-count without auth must return 401, never 500."""
    from src.api.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/api/v1/notifications/unread-count")

    assert response.status_code == 401, (
        f"Expected 401 for unauthenticated request, got {response.status_code}: {response.text}"
    )


def test_list_notifications_with_read_at_in_response():
    """Verify that notification items returned from the list endpoint can contain read_at."""
    from datetime import UTC, datetime

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    user = _make_user()
    db = _make_db()
    now_iso = datetime.now(UTC).isoformat()
    db.list_notifications = AsyncMock(
        return_value=(
            [
                {
                    "id": "n1",
                    "type": "offer_update",
                    "title": "הצעה עודכנה",
                    "body": None,
                    "data": None,
                    "read": True,
                    "read_at": now_iso,  # migration 041 column
                    "created_at": now_iso,
                }
            ],
            1,
        )
    )

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    # read_at is passed through — the endpoint does not strip it
    assert items[0].get("read_at") == now_iso
