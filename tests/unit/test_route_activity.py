"""Unit tests for the /activity/recent route."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


def _make_user():
    now = datetime.now(UTC)
    return UserInDB(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=UserRole.RESIDENT,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _test_client(user, mock_db):
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    with patch("src.api.routes.activity.get_postgres_client", return_value=mock_db):
        yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.list_payments_for_user = AsyncMock(return_value=[])
    db.list_escalations = AsyncMock(return_value=([], 0))
    return db


def test_get_recent_activity_empty(mock_db):
    user = _make_user()
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.activity.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/activity/recent")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert "activities" in data
    assert isinstance(data["activities"], list)


def test_get_recent_activity_with_payments(mock_db):
    user = _make_user()
    now = datetime.now(UTC).isoformat()
    mock_db.list_payments_for_user = AsyncMock(
        return_value=[
            {"id": "pay-1", "amount": 1500, "status": "paid", "created_at": now},
            {"id": "pay-2", "amount": 800, "status": "pending", "created_at": now},
        ]
    )

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.activity.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/activity/recent")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data["activities"]) >= 2


def test_get_recent_activity_with_escalations(mock_db):
    user = _make_user()
    now = datetime.now(UTC).isoformat()
    mock_db.list_escalations = AsyncMock(
        return_value=(
            [{"id": "esc-1", "reason": "Broken pipe", "created_at": now}],
            1,
        )
    )

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.activity.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/activity/recent")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200


def test_get_recent_activity_db_exception_handled(mock_db):
    """DB failures are caught and return empty activities (not 500)."""
    user = _make_user()
    mock_db.list_payments_for_user = AsyncMock(side_effect=Exception("DB down"))
    mock_db.list_escalations = AsyncMock(side_effect=Exception("DB down"))

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.activity.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/activity/recent")
    finally:
        app.dependency_overrides.clear()

    # Exceptions are caught internally; should still return 200
    assert response.status_code == 200
    data = response.json()
    assert data["activities"] == []
