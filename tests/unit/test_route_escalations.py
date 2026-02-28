"""Unit tests for the escalations API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role: UserRole = UserRole.ADMIN) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="admin-1",
        email="admin@example.com",
        full_name="Admin User",
        phone="0501234567",
        role=role,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _make_escalation(**kwargs) -> dict:
    base = {
        "id": "esc-1",
        "user_id": "user-1",
        "conversation_id": "conv-1",
        "source_agent": "support",
        "reason": "negative_sentiment",
        "priority": "medium",
        "summary": "User frustrated",
        "status": "open",
        "assigned_to": None,
        "resolution_notes": None,
        "resolved_at": None,
        "context": {},
        "agent_reasoning": None,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestListEscalations:
    def test_list_escalations_admin_ok(self):
        user = _make_user(UserRole.ADMIN)
        db = MagicMock()
        db.list_escalations = AsyncMock(return_value=([_make_escalation()], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 1
        finally:
            app.dependency_overrides.clear()

    def test_list_escalations_resident_forbidden(self):
        user = _make_user(UserRole.RESIDENT)
        db = MagicMock()
        db.list_escalations = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_list_escalations_with_status_filter(self):
        user = _make_user(UserRole.ADMIN)
        db = MagicMock()
        db.list_escalations = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/?status=open")
            assert resp.status_code == 200
            call_kwargs = db.list_escalations.call_args
            assert call_kwargs[1]["filters"]["status"] == "open"
        finally:
            app.dependency_overrides.clear()


class TestGetEscalation:
    def test_get_escalation_found(self):
        user = _make_user()
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation())

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/esc-1")
            assert resp.status_code == 200
            assert resp.json()["id"] == "esc-1"
        finally:
            app.dependency_overrides.clear()

    def test_get_escalation_not_found(self):
        user = _make_user()
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestResolveEscalation:
    def test_resolve_open_escalation(self):
        user = _make_user()
        esc = _make_escalation(status="open")
        resolved = _make_escalation(status="resolved", resolved_at=datetime.now(UTC).isoformat())
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=esc)
        db.update_escalation = AsyncMock(return_value=resolved)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/esc-1/resolve",
                    json={"resolution_notes": "Fixed"},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_resolve_already_resolved(self):
        user = _make_user()
        esc = _make_escalation(status="resolved")
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=esc)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/escalations/esc-1/resolve")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestReopenEscalation:
    def test_reopen_resolved_escalation(self):
        user = _make_user()
        esc = _make_escalation(status="resolved")
        reopened = _make_escalation(status="open")
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=esc)
        db.add_escalation_message = AsyncMock()
        db.update_escalation = AsyncMock(return_value=reopened)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/escalations/esc-1/reopen?reason=needs+more+work")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_reopen_non_resolved_blocked(self):
        user = _make_user()
        esc = _make_escalation(status="open")
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=esc)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/escalations/esc-1/reopen?reason=test")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestGetEscalationMessages:
    def test_get_messages_ok(self):
        user = _make_user()
        db = MagicMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation())
        db.get_escalation_messages = AsyncMock(
            return_value=[{"id": "msg-1", "content": "Hello", "sender_type": "admin"}]
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/esc-1/messages")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["messages"]) == 1
        finally:
            app.dependency_overrides.clear()


class TestEscalationStats:
    def test_get_stats_admin_ok(self):
        user = _make_user()
        db = MagicMock()
        db.get_escalation_stats = AsyncMock(
            return_value={
                "total_open": 5,
                "total_in_progress": 2,
                "total_resolved_today": 3,
                "average_resolution_time_hours": 4.5,
                "by_priority": {"high": 2, "medium": 3},
                "by_source": {"support": 5},
                "by_reason": {"negative_sentiment": 4},
            }
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/stats")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total_open"] == 5
        finally:
            app.dependency_overrides.clear()

    def test_get_stats_resident_forbidden(self):
        user = _make_user(UserRole.RESIDENT)
        db = MagicMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/stats")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()
