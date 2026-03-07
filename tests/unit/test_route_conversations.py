"""Unit tests for conversations API route."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


def _make_user(role=UserRole.RESIDENT, user_id="user-1"):
    now = datetime.now(UTC)
    return UserInDB(
        id=user_id,
        email=f"{user_id}@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _client(user, mock_db):
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
        c = TestClient(app, raise_server_exceptions=False)
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.get_conversation_history = AsyncMock(return_value=([], 0))
    return db


def test_get_own_conversation_empty(mock_db):
    user = _make_user(user_id="user-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/user-1/messages")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["messages"] == []
    assert data["total"] == 0
    assert data["next_cursor"] is None


def test_get_other_user_conversation_denied(mock_db):
    """Regular user cannot access another user's conversation."""
    user = _make_user(user_id="user-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/other-user/messages")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_admin_can_access_any_conversation(mock_db):
    """Admin user can access another user's conversation."""
    admin = _make_user(role=UserRole.ADMIN, user_id="admin-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/other-user/messages")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200


def test_get_conversation_with_messages(mock_db):
    now = datetime.now(UTC)
    rows = [
        {
            "id": "log-1",
            "message": "Hello",
            "response": {"message": "Hi there!"},
            "created_at": now,
        }
    ]
    mock_db.get_conversation_history = AsyncMock(return_value=(rows, 1))

    user = _make_user(user_id="user-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/user-1/messages")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 2  # user + assistant
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"


def test_get_conversation_response_as_string(mock_db):
    """response field stored as JSON string is decoded."""
    import json

    now = datetime.now(UTC)
    rows = [
        {
            "id": "log-2",
            "message": "Question?",
            "response": json.dumps({"message": "Answer!"}),
            "created_at": now,
        }
    ]
    mock_db.get_conversation_history = AsyncMock(return_value=(rows, 1))

    user = _make_user(user_id="user-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/user-1/messages")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assistant_msgs = [m for m in data["messages"] if m["role"] == "assistant"]
    assert assistant_msgs[0]["content"] == "Answer!"


def test_get_conversation_db_error_returns_500(mock_db):
    mock_db.get_conversation_history = AsyncMock(side_effect=Exception("DB error"))

    user = _make_user(user_id="user-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/user-1/messages")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500


def test_get_conversation_with_pagination_cursor(mock_db):
    """When rows == limit, next_cursor should be set."""
    now = datetime.now(UTC)
    # Return limit=1 rows to trigger cursor
    rows = [{"id": "log-3", "message": "Msg", "response": {}, "created_at": now}]
    mock_db.get_conversation_history = AsyncMock(return_value=(rows, 5))

    user = _make_user(user_id="user-1")
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.conversations.get_postgres_client", return_value=mock_db):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/conversations/user-1/messages?limit=1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["next_cursor"] is not None
