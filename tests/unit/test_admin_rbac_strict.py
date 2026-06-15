"""Strict RBAC tests for /api/v1/admin/* — P0 security fix.

Verifies that after the P0 fix:
  - admin and super_admin retain full access to all admin routes.
  - buildings_manager is BLOCKED (403) from all /api/v1/admin/* routes.
  - resident and contractor are BLOCKED (403).

These tests use FastAPI dependency overrides so no real DB or JWT is needed.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user, require_admin_only
from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role: UserRole, user_id: str = "user-001") -> MagicMock:
    user = MagicMock(spec=UserInDB)
    user.id = user_id
    user.email = f"{role.value}@test.example.com"
    user.role = role
    user.is_active = True
    user.is_verified = True
    user.building_id = None
    user.contractor_id = None
    return user


def _override(user: MagicMock) -> None:
    """Override for ALLOWED roles: bypass both get_current_user AND require_admin_only.

    Use this only for roles that SHOULD pass (admin, super_admin). Overriding
    require_admin_only skips the real role check, so use _override_current_user_only
    for tests that expect a 403.
    """
    async def _dep():
        return user

    app.dependency_overrides[get_current_user] = _dep
    app.dependency_overrides[require_admin_only] = _dep


def _override_current_user_only(user: MagicMock) -> None:
    """Override only get_current_user; let the real require_admin_only enforce the role.

    Use this for tests that expect 403 — the real require_admin_only will inspect
    the user's role returned by get_current_user and raise HTTPException(403).
    """
    async def _dep():
        return user

    app.dependency_overrides[get_current_user] = _dep
    # Do NOT override require_admin_only — let the real dependency run.


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---------------------------------------------------------------------------
# Allowed roles: admin and super_admin
# ---------------------------------------------------------------------------


class TestAllowedRoles:
    """admin and super_admin must still have access after the P0 fix."""

    @pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.SUPER_ADMIN])
    def test_admin_roles_can_read_users(self, client, role):
        _override(_make_user(role))
        with patch("src.api.routes.admin.get_postgres_client") as mock_pg:
            db = AsyncMock()
            db.get_admin_users = AsyncMock(return_value=([], 0))
            mock_pg.return_value = db
            resp = client.get("/api/v1/admin/users")
        assert resp.status_code == 200

    @pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.SUPER_ADMIN])
    def test_admin_roles_can_read_settings(self, client, role):
        _override(_make_user(role))
        with patch("src.api.routes.admin.get_postgres_client") as mock_pg:
            db = AsyncMock()
            db.get_system_settings = AsyncMock(return_value=[])
            mock_pg.return_value = db
            resp = client.get("/api/v1/admin/settings")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Blocked role: buildings_manager
# ---------------------------------------------------------------------------


class TestBuildingsManagerBlocked:
    """buildings_manager must be denied (403) on ALL /api/v1/admin/* routes."""

    def test_blocked_from_admin_status(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/status")
        assert resp.status_code == 403, f"Expected 403 for buildings_manager on /admin/status, got {resp.status_code}"

    def test_blocked_from_admin_users_list(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/users")
        assert resp.status_code == 403

    def test_blocked_from_admin_settings_read(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/settings")
        assert resp.status_code == 403

    def test_blocked_from_admin_settings_write(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.put("/api/v1/admin/settings", json={"key": "value"})
        assert resp.status_code == 403

    def test_blocked_from_admin_metrics(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/metrics")
        assert resp.status_code == 403

    def test_blocked_from_admin_offers_list(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/offers")
        assert resp.status_code == 403

    def test_blocked_from_admin_analytics(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/analytics")
        assert resp.status_code == 403

    def test_blocked_from_payment_status_override(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.patch(
            "/api/v1/admin/payments/pay-001/status",
            json={"status": "completed", "reason": "test"},
        )
        assert resp.status_code == 403

    def test_blocked_from_agent_controls(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.get("/api/v1/admin/agents/audit")
        assert resp.status_code == 403

    def test_blocked_from_contractor_refresh_verification(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.post("/api/v1/admin/contractors/c-001/refresh-verification")
        assert resp.status_code == 403

    def test_blocked_from_contractor_request_docs(self, client):
        _override_current_user_only(_make_user(UserRole.BUILDINGS_MANAGER))
        resp = client.post("/api/v1/admin/contractors/c-001/request-docs")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Blocked roles: resident and contractor
# ---------------------------------------------------------------------------


class TestOtherRolesBlocked:
    """resident and contractor must be denied (403) on all admin routes."""

    @pytest.mark.parametrize("role", [UserRole.RESIDENT, UserRole.CONTRACTOR])
    def test_non_admin_blocked_from_admin_status(self, client, role):
        _override_current_user_only(_make_user(role))
        resp = client.get("/api/v1/admin/status")
        assert resp.status_code == 403

    @pytest.mark.parametrize("role", [UserRole.RESIDENT, UserRole.CONTRACTOR])
    def test_non_admin_blocked_from_admin_users(self, client, role):
        _override_current_user_only(_make_user(role))
        resp = client.get("/api/v1/admin/users")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Contractor verification endpoint tests (P1-1 fix)
# ---------------------------------------------------------------------------


class TestRefreshVerificationEndpoint:
    """POST /api/v1/admin/contractors/{id}/refresh-verification — new endpoint."""

    def test_refresh_verification_returns_not_found_for_missing_contractor(self, client):
        _override(_make_user(UserRole.ADMIN))
        with patch("src.api.routes.admin.get_postgres_client") as mock_pg:
            db = AsyncMock()
            db.get_contractor = AsyncMock(return_value=None)
            mock_pg.return_value = db
            resp = client.post("/api/v1/admin/contractors/nonexistent/refresh-verification")
        assert resp.status_code == 404

    def test_refresh_verification_no_enrichment_service(self, client):
        _override(_make_user(UserRole.ADMIN))
        with (
            patch("src.api.routes.admin.get_postgres_client") as mock_pg,
            patch("src.services.enrichment.get_enrichment_service") as mock_svc_factory,
        ):
            db = AsyncMock()
            db.get_contractor = AsyncMock(return_value={"id": "c-001", "business_name": ""})
            db.create_audit_log = AsyncMock()
            mock_pg.return_value = db
            svc = MagicMock(spec=[])  # no search_registered_company method
            mock_svc_factory.return_value = svc

            resp = client.post("/api/v1/admin/contractors/c-001/refresh-verification")
        assert resp.status_code == 200
        body = resp.json()
        assert body["found"] is False

    def test_refresh_verification_found_active_company(self, client):
        _override(_make_user(UserRole.ADMIN))
        with (
            patch("src.api.routes.admin.get_postgres_client") as mock_pg,
            patch("src.services.enrichment.get_enrichment_service") as mock_svc_factory,
        ):
            db = AsyncMock()
            db.get_contractor = AsyncMock(
                return_value={"id": "c-001", "business_name": "Rothschild Contractors Ltd"}
            )
            db.upsert_contractor_verification = AsyncMock()
            db.create_audit_log = AsyncMock()
            mock_pg.return_value = db

            svc = MagicMock()
            svc.search_registered_company = MagicMock(
                return_value=[{"company_id": "123", "status": "פעילה", "name": "Rothschild"}]
            )
            mock_svc_factory.return_value = svc

            resp = client.post("/api/v1/admin/contractors/c-001/refresh-verification")

        assert resp.status_code == 200
        body = resp.json()
        assert body["found"] is True
        assert body["verified"] is True
        assert body["confidence"] == pytest.approx(0.7)
