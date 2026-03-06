"""Integration tests for GET /api/v1/conversations/{userId}/messages."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_user(**overrides):
    defaults = dict(
        id="user-abc",
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role="resident",
        is_active=True,
        is_verified=True,
        building_id="bld-1",
        contractor_id=None,
    )
    defaults.update(overrides)
    return MagicMock(**defaults)


@pytest.fixture
def auth_user():
    return _make_user()


@pytest.fixture
def admin_user():
    return _make_user(id="admin-1", role="admin")


@pytest.fixture
def other_user():
    return _make_user(id="user-xyz")


@pytest.fixture
def client_user(auth_user):
    app.dependency_overrides[get_current_user] = lambda: auth_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_admin(admin_user):
    app.dependency_overrides[get_current_user] = lambda: admin_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_other(other_user):
    app.dependency_overrides[get_current_user] = lambda: other_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    with patch("src.api.routes.conversations.get_postgres_client") as mock_get:
        db = AsyncMock()
        mock_get.return_value = db
        yield db


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_log_row(idx: int, user_message: str, assistant_reply: str) -> dict:
    ts = datetime(2024, 1, idx + 1, 10, 0, 0, tzinfo=UTC)
    return {
        "id": f"log-{idx}",
        "user_id": "user-abc",
        "message": user_message,
        "response": {"message": assistant_reply},
        "metadata": {},
        "created_at": ts,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetConversationMessages:

    def test_empty_history_returns_200(self, client_user, mock_db):
        """No conversation logs → returns 200 with empty messages list."""
        mock_db.get_conversation_history = AsyncMock(return_value=([], 0))

        response = client_user.get(
            "/api/v1/conversations/user-abc/messages",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["messages"] == []
        assert body["total"] == 0
        assert body["next_cursor"] is None

    def test_history_contains_user_and_assistant_messages(self, client_user, mock_db):
        """Each log row expands to a user message and an assistant message."""
        rows = [
            _make_log_row(0, "How much does AC cost?", "It depends on the model."),
            _make_log_row(1, "What about installation?", "Around 500 ILS typically."),
        ]
        mock_db.get_conversation_history = AsyncMock(return_value=(rows, 2))

        response = client_user.get(
            "/api/v1/conversations/user-abc/messages",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        body = response.json()
        messages = body["messages"]
        # 2 log rows × 2 (user + assistant) = 4 messages
        assert len(messages) == 4
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "How much does AC cost?"
        assert messages[1]["role"] == "assistant"
        assert messages[1]["content"] == "It depends on the model."
        assert messages[2]["role"] == "user"
        assert messages[3]["role"] == "assistant"
        # All IDs must be unique
        ids = [m["id"] for m in messages]
        assert len(ids) == len(set(ids))

    def test_cross_user_access_denied(self, client_user, mock_db):
        """A regular user cannot fetch another user's history."""
        mock_db.get_conversation_history = AsyncMock(return_value=([], 0))

        response = client_user.get(
            "/api/v1/conversations/DIFFERENT-USER-ID/messages",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 403

    def test_admin_can_access_any_users_history(self, client_admin, mock_db):
        """Admins may fetch history for any userId."""
        rows = [_make_log_row(0, "Hello", "Hi!")]
        mock_db.get_conversation_history = AsyncMock(return_value=(rows, 1))

        response = client_admin.get(
            "/api/v1/conversations/user-abc/messages",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        assert len(response.json()["messages"]) == 2  # 1 log row → 2 messages

    def test_pagination_limit_respected(self, client_user, mock_db):
        """The limit query param is forwarded to the DB call."""
        mock_db.get_conversation_history = AsyncMock(return_value=([], 0))

        client_user.get(
            "/api/v1/conversations/user-abc/messages?limit=10",
            headers={"Authorization": "Bearer test-token"},
        )
        mock_db.get_conversation_history.assert_awaited_once()
        call_kwargs = mock_db.get_conversation_history.call_args
        assert call_kwargs.kwargs.get("limit") == 10 or call_kwargs.args[1] == 10

    def test_limit_above_max_rejected(self, client_user, mock_db):
        """limit > 200 should be rejected with 422."""
        mock_db.get_conversation_history = AsyncMock(return_value=([], 0))

        response = client_user.get(
            "/api/v1/conversations/user-abc/messages?limit=9999",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 422

    def test_next_cursor_returned_when_full_page(self, client_user, mock_db):
        """When exactly limit rows are returned, next_cursor is populated."""
        # Simulate exactly limit=1 row returned
        rows = [_make_log_row(0, "question", "answer")]
        mock_db.get_conversation_history = AsyncMock(return_value=(rows, 5))

        response = client_user.get(
            "/api/v1/conversations/user-abc/messages?limit=1",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        body = response.json()
        # next_cursor should be set because len(rows) == limit (1)
        assert body["next_cursor"] is not None

    def test_unauthenticated_request_returns_401_or_403(self):
        """No auth token → rejected before hitting the DB."""
        with TestClient(app) as c:
            response = c.get("/api/v1/conversations/user-abc/messages")
        assert response.status_code in (401, 403)
