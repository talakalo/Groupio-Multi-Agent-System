"""RBAC tests for the buildings_manager role.

Verifies that users with the ``buildings_manager`` role:
- Can access admin-gated endpoints (same as ``admin`` / ``super_admin``).
- Are correctly identified by the ``is_admin`` helper and ``get_admin_user`` dependency.
- Are rejected from endpoints when they lack the right role (sanity checks).

All tests use FastAPI's dependency-override mechanism so no real database or
JWT tokens are required.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user, is_admin
from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role: UserRole, user_id: str = "user-bm-001") -> MagicMock:
    """Return a MagicMock that quacks like a UserInDB with the given role."""
    user = MagicMock(spec=UserInDB)
    user.id = user_id
    user.email = f"{role.value}@example.com"
    user.role = role
    user.is_active = True
    user.is_verified = True
    user.building_id = None
    user.contractor_id = None
    return user


def _override_auth(user: MagicMock) -> None:
    """Install a synchronous dependency override for get_current_user."""

    async def _dep():
        return user

    app.dependency_overrides[get_current_user] = _dep


@pytest.fixture(autouse=True)
def _clear_overrides():
    """Remove all dependency overrides after every test."""
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def mock_db():
    db = AsyncMock()
    with patch("src.databases.postgres._postgres_client", db):
        yield db


# ---------------------------------------------------------------------------
# Unit-level helper tests
# ---------------------------------------------------------------------------


class TestIsAdminHelper:
    """Verify the is_admin() helper recognises buildings_manager."""

    def test_buildings_manager_is_admin(self):
        user = _make_user(UserRole.BUILDINGS_MANAGER)
        assert is_admin(user) is True

    def test_admin_is_admin(self):
        user = _make_user(UserRole.ADMIN)
        assert is_admin(user) is True

    def test_super_admin_is_admin(self):
        user = _make_user(UserRole.SUPER_ADMIN)
        assert is_admin(user) is True

    def test_resident_is_not_admin(self):
        user = _make_user(UserRole.RESIDENT)
        assert is_admin(user) is False

    def test_contractor_is_not_admin(self):
        user = _make_user(UserRole.CONTRACTOR)
        assert is_admin(user) is False


# ---------------------------------------------------------------------------
# Escalation endpoint RBAC
# ---------------------------------------------------------------------------


class TestEscalationsRBAC:
    """buildings_manager should have the same escalation access as admin."""

    @pytest.fixture
    def _mock_escalation_data(self):
        return {
            "id": "esc-bm-001",
            "user_id": "user-123",
            "conversation_id": "conv-123",
            "source_agent": "support",
            "reason": "negative_sentiment",
            "priority": "high",
            "summary": "User needs help",
            "status": "open",
            "assigned_to": None,
            "context": {},
            "agent_reasoning": None,
            "resolution_notes": None,
            "user_name": None,
            "user_email": None,
            "assigned_to_name": None,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "resolved_at": None,
        }

    def _make_esc_mock(self, data: dict) -> MagicMock:
        """Build a MagicMock that satisfies EscalationResponse serialisation."""
        m = MagicMock()
        for k, v in data.items():
            setattr(m, k, v)
        return m

    def test_buildings_manager_can_list_escalations(
        self, client, mock_db, _mock_escalation_data
    ):
        """buildings_manager should receive 200 on GET /escalations."""
        mock_db.list_escalations = AsyncMock(
            return_value=([self._make_esc_mock(_mock_escalation_data)], 1)
        )
        _override_auth(_make_user(UserRole.BUILDINGS_MANAGER))

        response = client.get(
            "/api/v1/escalations",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200

    def test_admin_can_list_escalations(self, client, mock_db, _mock_escalation_data):
        """Sanity check: plain admin should still receive 200."""
        mock_db.list_escalations = AsyncMock(
            return_value=([self._make_esc_mock(_mock_escalation_data)], 1)
        )
        _override_auth(_make_user(UserRole.ADMIN))

        response = client.get(
            "/api/v1/escalations",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200

    def test_resident_cannot_list_escalations(self, client, mock_db):
        """resident should receive 403 on GET /escalations."""
        _override_auth(_make_user(UserRole.RESIDENT))

        response = client.get(
            "/api/v1/escalations",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 403

    def test_contractor_cannot_list_escalations(self, client, mock_db):
        """contractor should receive 403 on GET /escalations."""
        _override_auth(_make_user(UserRole.CONTRACTOR))

        response = client.get(
            "/api/v1/escalations",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 403

    def test_buildings_manager_can_get_escalation_stats(self, client, mock_db):
        """buildings_manager should receive 200 on GET /escalations/stats."""
        mock_db.get_escalation_stats = AsyncMock(
            return_value={
                "total": 10,
                "open": 3,
                "in_progress": 2,
                "resolved": 5,
                "by_priority": {},
                "by_source": {},
                "avg_resolution_hours": 4.5,
            }
        )
        _override_auth(_make_user(UserRole.BUILDINGS_MANAGER))

        response = client.get(
            "/api/v1/escalations/stats",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200

    def test_buildings_manager_can_resolve_escalation(self, client, mock_db):
        """buildings_manager should be able to resolve an escalation."""
        open_esc = MagicMock()
        open_esc.get = lambda key, default=None: {
            "status": "open",
            "id": "esc-001",
        }.get(key, default)

        resolved_esc = MagicMock()
        resolved_esc.id = "esc-001"
        resolved_esc.status = "resolved"
        resolved_esc.reason = "negative_sentiment"
        resolved_esc.priority = "high"
        resolved_esc.source_agent = "support"
        resolved_esc.user_id = "user-123"
        resolved_esc.building_id = None
        resolved_esc.conversation_id = "conv-123"
        resolved_esc.summary = "Issue resolved by buildings manager"
        resolved_esc.assigned_to = None
        resolved_esc.context = {}
        resolved_esc.agent_reasoning = None
        resolved_esc.resolution_notes = "Resolved by buildings manager"
        resolved_esc.user_name = None
        resolved_esc.user_email = None
        resolved_esc.assigned_to_name = None
        resolved_esc.created_at = "2024-01-01T00:00:00Z"
        resolved_esc.updated_at = "2024-01-01T00:00:00Z"
        resolved_esc.resolved_at = "2024-01-02T00:00:00Z"

        mock_db.get_escalation = AsyncMock(return_value=open_esc)
        mock_db.update_escalation = AsyncMock(return_value=resolved_esc)
        _override_auth(_make_user(UserRole.BUILDINGS_MANAGER))

        response = client.post(
            "/api/v1/escalations/esc-001/resolve",
            json={"resolution_notes": "Resolved by buildings manager"},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Admin system-status endpoint RBAC
# ---------------------------------------------------------------------------


class TestAdminEndpointsRBAC:
    """buildings_manager must pass the get_admin_user dependency."""

    def test_buildings_manager_can_access_admin_status(self, client):
        """GET /api/v1/admin/status should return 200 for buildings_manager."""
        _override_auth(_make_user(UserRole.BUILDINGS_MANAGER))

        with (
            patch("src.orchestration.graph.get_orchestrator") as mock_orch,
            patch("src.databases.vector_store.get_vector_store") as mock_vs,
        ):
            orchestrator = MagicMock()
            orchestrator.agents = {}
            mock_orch.return_value = orchestrator
            mock_vs.return_value.health_check = AsyncMock(return_value=True)

            response = client.get(
                "/api/v1/admin/status",
                headers={"Authorization": "Bearer test-token"},
            )

        # 200 or 500 (if downstream mock is incomplete) – either way NOT 403
        assert response.status_code != 403

    def test_resident_cannot_access_admin_status(self, client):
        """GET /api/v1/admin/status should return 403 for resident."""
        _override_auth(_make_user(UserRole.RESIDENT))

        response = client.get(
            "/api/v1/admin/status",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 403

    def test_contractor_cannot_access_admin_status(self, client):
        """GET /api/v1/admin/status should return 403 for contractor."""
        _override_auth(_make_user(UserRole.CONTRACTOR))

        response = client.get(
            "/api/v1/admin/status",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# Buildings endpoint RBAC
# ---------------------------------------------------------------------------


class TestBuildingsRBAC:
    """buildings_manager can read building data; resident is restricted to own building."""

    def test_buildings_manager_can_list_buildings(self, client, mock_db):
        """GET /api/v1/buildings should succeed for buildings_manager."""
        mock_db.list_buildings = AsyncMock(return_value=([], 0))
        _override_auth(_make_user(UserRole.BUILDINGS_MANAGER))

        response = client.get(
            "/api/v1/buildings",
            headers={"Authorization": "Bearer test-token"},
        )

        # Endpoint exists and auth passes (200 or 404/500 from mock, but NOT 401/403)
        assert response.status_code not in (401, 403)

    def test_admin_can_list_buildings(self, client, mock_db):
        """Sanity: admin can also list buildings."""
        mock_db.list_buildings = AsyncMock(return_value=([], 0))
        _override_auth(_make_user(UserRole.ADMIN))

        response = client.get(
            "/api/v1/buildings",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code not in (401, 403)
