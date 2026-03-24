"""Unit tests for the admin API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_admin() -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="admin-1",
        email="admin@example.com",
        full_name="Admin User",
        phone="0501234567",
        role=UserRole.ADMIN,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _make_user_dict(**kwargs) -> dict:
    now = datetime.now(UTC)
    base = {
        "id": "u1",
        "email": "user@test.com",
        "full_name": "Test",
        "role": "resident",
        "is_active": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    base.update(kwargs)
    return base


def _make_offer(**kwargs) -> dict:
    base = {
        "id": "o1",
        "title": "Solar Deal",
        "status": "pending",
        "created_by": "u1",
        "price": 1000,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    base.update(kwargs)
    return base


def _client(admin, mock_db, **patches):
    from src.api.main import app
    from src.api.middleware.auth import require_admin_only

    app.dependency_overrides[require_admin_only] = lambda: admin
    try:
        with patch("src.api.routes.admin.get_postgres_client", return_value=mock_db):
            yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/metrics
# ---------------------------------------------------------------------------


class TestGetMetrics:
    def test_get_metrics_ok(self):
        admin = _make_admin()
        mock_agent = MagicMock()
        mock_agent.get_metrics = AsyncMock(return_value={"calls": 5, "errors": 0})
        mock_orch = MagicMock()
        mock_orch.agents = {"support": mock_agent}
        mock_rag = AsyncMock()
        mock_rag.get_metrics = AsyncMock(return_value={})

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        db = AsyncMock()
        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_orchestrator", return_value=mock_orch):
                    with patch("src.api.routes.admin.get_rag_pipeline", return_value=mock_rag):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.get("/api/v1/admin/metrics")
            assert resp.status_code == 200
            assert "agents" in resp.json()
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/collections
# ---------------------------------------------------------------------------


class TestListCollections:
    def test_list_collections_ok(self):
        admin = _make_admin()
        vs = AsyncMock()
        vs.get_collection_info = AsyncMock(return_value={"count": 10})

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        db = AsyncMock()
        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_vector_store", return_value=vs):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.get("/api/v1/admin/collections")
            assert resp.status_code == 200
            data = resp.json()
            assert "collections" in data
        finally:
            app.dependency_overrides.clear()

    def test_list_collections_handles_unavailable(self):
        admin = _make_admin()
        vs = AsyncMock()
        vs.get_collection_info = AsyncMock(side_effect=RuntimeError("unavailable"))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        db = AsyncMock()
        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_vector_store", return_value=vs):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.get("/api/v1/admin/collections")
            assert resp.status_code == 200
            data = resp.json()
            for name in ["contractors", "buildings", "knowledge_base", "conversations"]:
                assert data["collections"][name]["status"] == "unavailable"
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/analytics
# ---------------------------------------------------------------------------


class TestGetAnalytics:
    def test_get_analytics_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_escalation_stats = AsyncMock(
            return_value={"total_open": 2, "total_in_progress": 1, "total_resolved_today": 4}
        )
        db.get_all_offers_admin = AsyncMock(return_value=([], 5))
        db.list_contractors = AsyncMock(return_value=([], 10))
        db.get_admin_analytics_aggregates = AsyncMock(return_value={})

        mock_agent = MagicMock()
        mock_agent.get_metrics = AsyncMock(return_value={"calls": 10, "errors": 0, "avg_duration_ms": 5})
        mock_orch = MagicMock()
        mock_orch.agents = {"support": mock_agent}

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_orchestrator", return_value=mock_orch):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.get("/api/v1/admin/analytics")
            assert resp.status_code == 200
            data = resp.json()
            assert "activeOffers" in data
            assert data["openTickets"] == 3
            assert data["resolvedToday"] == 4
            assert data.get("agentPerformance")
        finally:
            app.dependency_overrides.clear()

    def test_get_analytics_db_errors_handled_gracefully(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_escalation_stats = AsyncMock(side_effect=RuntimeError("db error"))
        db.get_all_offers_admin = AsyncMock(side_effect=RuntimeError("db error"))
        db.list_contractors = AsyncMock(side_effect=RuntimeError("db error"))
        db.get_admin_analytics_aggregates = AsyncMock(side_effect=RuntimeError("db error"))

        mock_orch = MagicMock()
        mock_orch.agents = {}

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_orchestrator", return_value=mock_orch):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.get("/api/v1/admin/analytics")
            assert resp.status_code == 200  # errors are caught and defaults used
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET/PUT /admin/users
# ---------------------------------------------------------------------------


class TestAdminUsers:
    def test_list_users_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_admin_users = AsyncMock(return_value=([_make_user_dict()], 1))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/users")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
        finally:
            app.dependency_overrides.clear()

    def test_get_user_found(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_user_profile = AsyncMock(return_value=_make_user_dict())

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/users/u1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_user_not_found(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_user_profile = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/users/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_update_user_ok(self):
        admin = _make_admin()
        mock_user = MagicMock()
        mock_user.id = "u1"
        mock_user.role = "admin"
        mock_user.is_active = True

        db = AsyncMock()
        db.update_user = AsyncMock(return_value=mock_user)
        db.create_audit_log = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/admin/users/u1", json={"is_active": False})
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_user_no_fields(self):
        admin = _make_admin()
        db = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/admin/users/u1", json={})
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_create_admin_user_ok(self):
        admin = _make_admin()
        mock_user = MagicMock()
        mock_user.id = "new-u1"
        mock_user.email = "new@test.com"
        mock_user.role = "admin"

        db = AsyncMock()
        db.create_user = AsyncMock(return_value=mock_user)
        db.create_audit_log = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/admin/users",
                    json={
                        "name": "New Admin",
                        "email": "new@test.com",
                        "phone": "0501234567",
                        "password": "securepassword123",
                        "role": "admin",
                    },
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/offers
# ---------------------------------------------------------------------------


class TestAdminOffers:
    def test_list_offers_admin_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_all_offers_admin = AsyncMock(return_value=([_make_offer()], 1))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/offers?status=pending")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
        finally:
            app.dependency_overrides.clear()

    def test_flag_offer_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.update_offer = AsyncMock(return_value=_make_offer(status="flagged"))
        db.create_audit_log = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/admin/offers/o1/flag")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_flag_offer_not_found(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/admin/offers/missing/flag")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_approve_offer_ok(self):
        admin = _make_admin()
        offer = _make_offer(created_by="u1")
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.update_offer = AsyncMock(return_value=_make_offer(status="active"))
        db.create_audit_log = AsyncMock()
        db.get_user_profile = AsyncMock(return_value={"email": "u@test.com", "full_name": "User"})

        email_svc = AsyncMock()
        email_svc.send_offer_approved = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_email_service", return_value=email_svc):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/admin/offers/o1/approve")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_approve_offer_not_found(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/admin/offers/missing/approve")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_cancel_offer_ok(self):
        admin = _make_admin()
        offer = _make_offer()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.get_offer_participants = AsyncMock(return_value=[{"email": "p@test.com", "full_name": "P"}])
        db.update_offer = AsyncMock(return_value=_make_offer(status="cancelled"))
        db.create_audit_log = AsyncMock()

        email_svc = AsyncMock()
        email_svc.send_offer_cancelled = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_email_service", return_value=email_svc):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/admin/offers/o1/cancel")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET/PUT /admin/settings
# ---------------------------------------------------------------------------


class TestAdminSettings:
    def test_get_settings_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_system_settings = AsyncMock(return_value=[{"key": "max_offers", "value": "100"}])

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/settings")
            assert resp.status_code == 200
            assert resp.json()["max_offers"] == "100"
        finally:
            app.dependency_overrides.clear()

    def test_update_settings_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.upsert_system_setting = AsyncMock()
        db.create_audit_log = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/admin/settings", json={"max_offers": "50", "theme": "dark"})
            assert resp.status_code == 200
            assert db.upsert_system_setting.call_count == 2
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/system-status
# ---------------------------------------------------------------------------


class TestSystemStatus:
    def test_system_status_ok(self):
        admin = _make_admin()
        mock_agent = MagicMock()
        mock_agent.config = MagicMock(model="claude-sonnet")
        mock_agent.get_metrics = AsyncMock(return_value={"calls": 1, "errors": 0})

        mock_orch = MagicMock()
        mock_orch.agents = {"support": mock_agent}

        vs = AsyncMock()
        vs.get_collection_info = AsyncMock(return_value={"count": 5})

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        db = AsyncMock()
        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_orchestrator", return_value=mock_orch):
                    with patch("src.api.routes.admin.get_vector_store", return_value=vs):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.get("/api/v1/admin/status")
            assert resp.status_code == 200
            data = resp.json()
            assert "agents" in data
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /admin/agents/{agent_name}/reload
# ---------------------------------------------------------------------------


class TestReloadAgent:
    def test_reload_agent_ok(self):
        admin = _make_admin()
        mock_agent = MagicMock()
        mock_agent.reload_config = AsyncMock()
        mock_orch = MagicMock()
        mock_orch.agents = {"support": mock_agent}

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        db = AsyncMock()
        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_orchestrator", return_value=mock_orch):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/admin/agents/support/reload")
            assert resp.status_code == 200
            assert resp.json()["status"] == "reloaded"
        finally:
            app.dependency_overrides.clear()

    def test_reload_agent_not_found(self):
        admin = _make_admin()
        mock_orch = MagicMock()
        mock_orch.agents = {}

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        db = AsyncMock()
        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_orchestrator", return_value=mock_orch):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/admin/agents/ghost/reload")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/export/offers
# ---------------------------------------------------------------------------


class TestExportOffersCsv:
    def test_export_offers_csv_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_all_offers_admin = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/export/offers")
            assert resp.status_code == 200
            assert "text/csv" in resp.headers.get("content-type", "")
        finally:
            app.dependency_overrides.clear()

    def test_export_offers_csv_with_filters(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_all_offers_admin = AsyncMock(return_value=([{"id": "o1", "title": "Test", "status": "pending"}], 1))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/export/offers?status=pending")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/export/participants
# ---------------------------------------------------------------------------


class TestExportParticipantsCsv:
    def test_export_participants_for_offer(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value={"id": "o1", "title": "Deal"})
        db.get_offer_participants = AsyncMock(return_value=[{"user_id": "u1", "email": "a@b.com", "full_name": "A"}])

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/export/participants?offer_id=o1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_export_participants_all_offers(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_all_offers_admin = AsyncMock(return_value=([{"id": "o1", "title": "Deal"}], 1))
        db.get_offer_participants = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/export/participants")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/export/payments
# ---------------------------------------------------------------------------


class TestExportPaymentsCsv:
    def test_export_payments_csv_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.execute_query = AsyncMock(return_value=[{"id": "p1", "amount": 100, "status": "completed"}])

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/export/payments")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_export_payments_execute_query_unavailable(self):
        admin = _make_admin()
        db = AsyncMock()
        db.execute_query = AsyncMock(side_effect=AttributeError("no execute_query"))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/export/payments")
            assert resp.status_code == 200  # should return empty CSV, not fail
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/vetting/status
# ---------------------------------------------------------------------------


class TestVettingStatus:
    def test_vetting_status_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.list_contractors = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/vetting/status")
            assert resp.status_code == 200
            data = resp.json()
            assert "pendingReview" in data
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /admin/offers/{offer_id}/force-cancel
# ---------------------------------------------------------------------------


class TestForceCancelOffer:
    def test_force_cancel_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value={"id": "o1", "title": "Deal", "status": "pending"})
        db.update_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                with patch("src.api.routes.admin.get_email_service", return_value=AsyncMock()):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/admin/offers/o1/force-cancel",
                        json={"reason": "Policy violation"},
                    )
            assert resp.status_code == 200
            assert resp.json()["status"] == "cancelled"
        finally:
            app.dependency_overrides.clear()

    def test_force_cancel_not_found(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/admin/offers/missing/force-cancel",
                    json={"reason": "Test"},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_force_cancel_already_terminal(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value={"id": "o1", "status": "cancelled"})

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/admin/offers/o1/force-cancel",
                    json={"reason": "Test"},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# PATCH /admin/payments/{payment_id}/status
# ---------------------------------------------------------------------------


class TestOverridePaymentStatus:
    def test_override_status_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_payment = AsyncMock(return_value={"id": "pay-1", "status": "pending"})
        db.update_payment = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.patch(
                    "/api/v1/admin/payments/pay-1/status",
                    json={"status": "completed", "reason": "Manual fix"},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_override_status_invalid(self):
        admin = _make_admin()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.patch(
                "/api/v1/admin/payments/pay-1/status",
                json={"status": "invalid_status", "reason": "Test"},
            )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_override_payment_not_found(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_payment = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.patch(
                    "/api/v1/admin/payments/missing/status",
                    json={"status": "completed", "reason": "Test"},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /admin/outreach/queue
# ---------------------------------------------------------------------------


class TestOutreachQueue:
    def test_list_outreach_queue_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.list_outreach_queue = AsyncMock(return_value=[{"id": "oq-1", "status": "pending_approval"}])

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/admin/outreach/queue")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
        finally:
            app.dependency_overrides.clear()


class TestContractorMembershipAdminPatch:
    def test_patch_contractor_membership_ok(self):
        admin = _make_admin()
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value={"id": "c1", "membership_status": "canceled"})
        db.admin_update_contractor_membership = AsyncMock(
            return_value={"id": "c1", "membership_status": "active"},
        )
        db.create_audit_log = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import require_admin_only

        app.dependency_overrides[require_admin_only] = lambda: admin
        try:
            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.patch(
                    "/api/v1/admin/contractors/c1/membership",
                    json={"membership_status": "active"},
                )
            assert resp.status_code == 200
            assert resp.json()["membership_status"] == "active"
            db.admin_update_contractor_membership.assert_awaited_once()
            db.create_audit_log.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()
