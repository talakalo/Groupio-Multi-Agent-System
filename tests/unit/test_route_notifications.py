"""Unit tests for /api/v1/notifications route."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


def _make_user(role: UserRole = UserRole.RESIDENT, user_id: str = "user-1") -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id=user_id,
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _make_db() -> MagicMock:
    """Create a mock postgres client with sensible defaults."""
    db = MagicMock()
    db._use_supabase_client = MagicMock(return_value=False)
    db.list_notifications = AsyncMock(return_value=([], 0))
    db.get_unread_notification_count = AsyncMock(return_value=0)
    db.mark_all_notifications_read = AsyncMock(return_value=None)
    db.mark_notification_read = AsyncMock(return_value=True)
    db._pg_fetch_one = AsyncMock(return_value={"id": "notif-1"})
    db._pg_fetch_all = AsyncMock(return_value=[])
    return db


# ---------------------------------------------------------------------------
# GET / — list_notifications
# ---------------------------------------------------------------------------


def test_list_notifications_happy_path():
    user = _make_user()
    db = _make_db()
    now_str = datetime.now(UTC).isoformat()
    db.list_notifications = AsyncMock(
        return_value=(
            [{"id": "n1", "message": "Hello", "is_read": False, "created_at": now_str}],
            1,
        )
    )

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["limit"] == 50
    assert data["offset"] == 0


def test_list_notifications_empty():
    user = _make_user()
    db = _make_db()
    db.list_notifications = AsyncMock(return_value=([], 0))

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/?limit=10&offset=5&unread_only=true")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["limit"] == 10
    assert data["offset"] == 5


# ---------------------------------------------------------------------------
# GET /unread-count — unread_notification_count
# ---------------------------------------------------------------------------


def test_unread_notification_count_happy_path():
    user = _make_user()
    db = _make_db()
    db.get_unread_notification_count = AsyncMock(return_value=7)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/unread-count")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 7


def test_unread_notification_count_zero():
    user = _make_user()
    db = _make_db()
    db.get_unread_notification_count = AsyncMock(return_value=0)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/notifications/unread-count")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["count"] == 0


# ---------------------------------------------------------------------------
# POST /read-all — mark_all_notifications_read
# ---------------------------------------------------------------------------


def test_mark_all_notifications_read_happy_path():
    user = _make_user()
    db = _make_db()
    db.mark_all_notifications_read = AsyncMock(return_value=None)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post("/api/v1/notifications/read-all")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    db.mark_all_notifications_read.assert_called_once_with(user.id)


# ---------------------------------------------------------------------------
# POST /{notification_id}/read — mark_notification_read_route
# ---------------------------------------------------------------------------


def test_mark_notification_read_happy_path():
    user = _make_user()
    db = _make_db()
    db.mark_notification_read = AsyncMock(return_value=True)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post("/api/v1/notifications/notif-abc/read")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    db.mark_notification_read.assert_called_once_with("notif-abc", user.id)


def test_mark_notification_read_not_found():
    """DB returns falsy → 404."""
    user = _make_user()
    db = _make_db()
    db.mark_notification_read = AsyncMock(return_value=None)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post("/api/v1/notifications/missing-notif/read")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_mark_notification_read_false_returns_404():
    """DB returns False (falsy) → 404."""
    user = _make_user()
    db = _make_db()
    db.mark_notification_read = AsyncMock(return_value=False)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post("/api/v1/notifications/notif-gone/read")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /{notification_id} — delete_notification (pg path)
# ---------------------------------------------------------------------------


def test_delete_notification_happy_path_pg():
    """Postgres path: _use_supabase_client returns False, row found → 200."""
    user = _make_user()
    db = _make_db()
    db._use_supabase_client = MagicMock(return_value=False)
    db._pg_fetch_one = AsyncMock(return_value={"id": "notif-1"})

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.delete("/api/v1/notifications/notif-1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}


def test_delete_notification_not_found_pg():
    """Postgres path: row not found → 404."""
    user = _make_user()
    db = _make_db()
    db._use_supabase_client = MagicMock(return_value=False)
    db._pg_fetch_one = AsyncMock(return_value=None)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.delete("/api/v1/notifications/notif-missing")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE / — clear_notifications (pg path)
# ---------------------------------------------------------------------------


def test_clear_notifications_happy_path_pg_empty():
    """Postgres path: no rows deleted → {status: deleted, deleted: 0}."""
    user = _make_user()
    db = _make_db()
    db._use_supabase_client = MagicMock(return_value=False)
    db._pg_fetch_all = AsyncMock(return_value=[])

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.delete("/api/v1/notifications/")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deleted"
    assert data["deleted"] == 0


def test_clear_notifications_happy_path_pg_with_rows():
    """Postgres path: some rows deleted → correct count returned."""
    user = _make_user()
    db = _make_db()
    db._use_supabase_client = MagicMock(return_value=False)
    db._pg_fetch_all = AsyncMock(return_value=[{"id": "n1"}, {"id": "n2"}, {"id": "n3"}])

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.delete("/api/v1/notifications/")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deleted"
    assert data["deleted"] == 3


def test_clear_notifications_none_result_pg():
    """Postgres path: _pg_fetch_all returns None → deleted count is 0."""
    user = _make_user()
    db = _make_db()
    db._use_supabase_client = MagicMock(return_value=False)
    db._pg_fetch_all = AsyncMock(return_value=None)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.notifications.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.delete("/api/v1/notifications/")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["deleted"] == 0
