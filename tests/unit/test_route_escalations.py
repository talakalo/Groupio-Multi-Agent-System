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


def _make_contractor_user() -> UserInDB:
    base = _make_user(UserRole.CONTRACTOR)
    return base.model_copy(update={"id": "contractor-user-1", "contractor_id": "ctr-1"})


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

    def test_list_escalations_unknown_reason_coerced(self):
        """Unknown DB reason values must not break EscalationResponse validation."""
        user = _make_user(UserRole.ADMIN)
        db = MagicMock()
        db.list_escalations = AsyncMock(
            return_value=([_make_escalation(reason="legacy_unknown_reason")], 1),
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/")
            assert resp.status_code == 200
            assert resp.json()["items"][0]["reason"] == "other"
        finally:
            app.dependency_overrides.clear()

    def test_list_escalations_context_json_string_ok(self):
        """Drivers/seed may return context as a JSON string; response must still validate."""
        user = _make_user(UserRole.ADMIN)
        db = MagicMock()
        db.list_escalations = AsyncMock(
            return_value=(
                [
                    _make_escalation(
                        context='{"seed": true}',
                    )
                ],
                1,
            )
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/")
            assert resp.status_code == 200
            data = resp.json()
            assert data["items"][0]["context"] == {"seed": True}
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


class TestCreateEscalation:
    def test_create_ok(self):
        esc = _make_escalation()
        db = AsyncMock()
        db.create_escalation = AsyncMock(return_value=esc)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides.clear()
        app.dependency_overrides[get_current_user] = lambda: _make_user()
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/",
                    json={
                        "user_id": "user-1",
                        "conversation_id": "conv-1",
                        "source_agent": "support",
                        "reason": "negative_sentiment",
                        "priority": "medium",
                        "summary": "User is very frustrated and needs help",
                    },
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


class TestFilterEscalations:
    def test_filter_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.list_escalations = AsyncMock(return_value=([_make_escalation()], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/filter",
                    json={"status": ["open"], "priority": ["high"]},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_filter_resident_forbidden(self):
        user = _make_user(UserRole.RESIDENT)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/api/v1/escalations/filter", json={})
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestGetMyEscalations:
    def test_my_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.list_escalations = AsyncMock(return_value=([_make_escalation()], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/my")
            assert resp.status_code == 200
            call_kwargs = db.list_escalations.call_args[1]
            assert call_kwargs["filters"]["assigned_to"] == "admin-1"
        finally:
            app.dependency_overrides.clear()

    def test_my_resident_forbidden(self):
        user = _make_user(UserRole.RESIDENT)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/escalations/my")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_my_with_status_filter(self):
        user = _make_user()
        db = AsyncMock()
        db.list_escalations = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/my?status=open")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


class TestUpdateEscalation:
    def test_update_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation(status="open"))
        db.update_escalation = AsyncMock(return_value=_make_escalation(status="in_progress"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put(
                    "/api/v1/escalations/esc-1",
                    json={"status": "in_progress"},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/escalations/missing", json={"status": "resolved"})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_update_to_resolved_sets_resolved_at(self):
        user = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation(status="open"))
        db.update_escalation = AsyncMock(return_value=_make_escalation(status="resolved"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/escalations/esc-1", json={"status": "resolved"})
            assert resp.status_code == 200
            update_data = db.update_escalation.call_args[0][1]
            assert "resolved_at" in update_data
        finally:
            app.dependency_overrides.clear()

    def test_update_resident_forbidden(self):
        user = _make_user(UserRole.RESIDENT)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.put("/api/v1/escalations/esc-1", json={"status": "resolved"})
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestAssignEscalation:
    def test_assign_ok(self):
        admin = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation())
        db.get_user = AsyncMock(return_value=admin)
        db.update_escalation = AsyncMock(return_value=_make_escalation(assigned_to="admin-1"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/esc-1/assign",
                    json={"assigned_to": "admin-1"},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_assign_escalation_not_found(self):
        admin = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/missing/assign",
                    json={"assigned_to": "admin-1"},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_assign_invalid_admin(self):
        admin = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation())
        db.get_user = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/esc-1/assign",
                    json={"assigned_to": "nonexistent"},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestReplyEscalation:
    def test_reply_ok(self):
        admin = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation())
        db.add_escalation_message = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/esc-1/reply",
                    json={"content": "Looking into this issue", "resolve": False},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_reply_with_resolve(self):
        admin = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=_make_escalation())
        db.add_escalation_message = AsyncMock()
        db.update_escalation = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/esc-1/reply",
                    json={"content": "Resolved", "resolve": True, "resolution_notes": "Done"},
                )
            assert resp.status_code == 200
            db.update_escalation.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_reply_not_found(self):
        admin = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/missing/reply",
                    json={"content": "Hello", "resolve": False},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestGetEscalationMessagesExtra:
    def test_get_messages_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_escalation = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/escalations/missing/messages")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestContractorRequestReview:
    def test_contractor_request_review_creates_escalation(self):
        user = _make_contractor_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(
            return_value={"id": "offer-1", "contractor_id": "ctr-1", "status": "completed"},
        )
        created = _make_escalation(
            id="new-esc",
            user_id=user.id,
            conversation_id="contractor_offer:offer-1",
            source_agent="support",
            reason="manual_review",
            summary="Contractor requests manual review for completed offer offer-1.",
        )
        db.create_escalation = AsyncMock(return_value=created)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/contractor/request-review",
                    json={"offer_id": "offer-1"},
                )
            assert resp.status_code == 200
            assert resp.json()["id"] == "new-esc"
            db.create_escalation.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()

    def test_contractor_request_review_forbidden_for_resident(self):
        user = _make_user(UserRole.RESIDENT)
        db = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/contractor/request-review",
                    json={"offer_id": "offer-1"},
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_contractor_request_review_wrong_contractor(self):
        user = _make_contractor_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(
            return_value={"id": "offer-1", "contractor_id": "other-ctr", "status": "completed"},
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/contractor/request-review",
                    json={"offer_id": "offer-1"},
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_contractor_request_review_not_completed_offer(self):
        user = _make_contractor_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(
            return_value={"id": "offer-1", "contractor_id": "ctr-1", "status": "in_progress"},
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.escalations.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/escalations/contractor/request-review",
                    json={"offer_id": "offer-1"},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()
