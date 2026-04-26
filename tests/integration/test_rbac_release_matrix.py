"""Release RBAC checks: admin router vs buildings_manager, privilege escalation guards."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user
from src.models.user import UserInDB, UserRole


def _user(role: UserRole) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id=f"user-{role.value}",
        email=f"{role.value}@rbac-test.example.com",
        full_name="RBAC Test",
        phone="0500000000",
        preferred_language="he",
        role=role,
        is_active=True,
        is_verified=True,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.mark.usefixtures("clear_overrides")
def test_buildings_manager_denied_admin_only_router() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.BUILDINGS_MANAGER)
    with TestClient(app) as client:
        r = client.get("/api/v1/admin/status")
    assert r.status_code == 403
    assert "admin" in (r.json().get("detail") or "").lower()


@pytest.mark.usefixtures("clear_overrides")
def test_resident_denied_admin_only_router() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.RESIDENT)
    with TestClient(app) as client:
        r = client.get("/api/v1/admin/status")
    assert r.status_code == 403


@pytest.mark.usefixtures("clear_overrides")
def test_contractor_denied_admin_only_router() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.CONTRACTOR)
    with TestClient(app) as client:
        r = client.get("/api/v1/admin/status")
    assert r.status_code == 403


@pytest.mark.usefixtures("clear_overrides")
def test_admin_cannot_create_super_admin_user() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/admin/users",
            json={
                "name": "Super",
                "email": "super@rbac-test.example.com",
                "phone": "0500000001",
                "password": "SecurePass123!",
                "role": "super_admin",
            },
        )
    assert r.status_code == 403
    assert "super_admin" in (r.json().get("detail") or "").lower()


@pytest.mark.usefixtures("clear_overrides")
def test_admin_cannot_assign_super_admin_role_via_put() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
    with TestClient(app) as client:
        r = client.put(
            "/api/v1/admin/users/some-user-id",
            json={"role": "super_admin"},
        )
    assert r.status_code == 403


@pytest.mark.usefixtures("clear_overrides")
def test_super_admin_can_create_super_admin_user_with_mock_db() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.SUPER_ADMIN)

    created = MagicMock()
    created.id = "new-super-id"
    created.email = "newsuper@rbac-test.example.com"
    created.role = "super_admin"

    db = AsyncMock()
    db.create_user = AsyncMock(return_value=created)
    db.create_audit_log = AsyncMock()

    with patch("src.api.routes.admin.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/admin/users",
                json={
                    "name": "New Super",
                    "email": "newsuper@rbac-test.example.com",
                    "phone": "0500000002",
                    "password": "SecurePass123!",
                    "role": "super_admin",
                },
            )

    assert r.status_code == 200
    body = r.json()
    assert body.get("role") == "super_admin"
    db.create_user.assert_awaited_once()


# ---------------------------------------------------------------------------
# B1: POST /buildings/ is restricted to BM / admin / super_admin
# ---------------------------------------------------------------------------


_BUILDING_PAYLOAD = {
    "name": "Test Building",
    "address": "1 Main St",
    "city": "Tel Aviv",
    "region": "tel_aviv",
    "total_units": 10,
    "floors": 4,
}


@pytest.mark.usefixtures("clear_overrides")
def test_resident_cannot_create_building() -> None:
    """Before B1, any authenticated user could create a building and become
    its admin_user_id silently. The fix adds get_buildings_manager_user to
    the route dependency chain."""
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.RESIDENT)
    with TestClient(app) as client:
        r = client.post("/api/v1/buildings/", json=_BUILDING_PAYLOAD)
    assert r.status_code == 403


@pytest.mark.usefixtures("clear_overrides")
def test_contractor_cannot_create_building() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.CONTRACTOR)
    with TestClient(app) as client:
        r = client.post("/api/v1/buildings/", json=_BUILDING_PAYLOAD)
    assert r.status_code == 403


@pytest.mark.usefixtures("clear_overrides")
def test_buildings_manager_can_create_building() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.BUILDINGS_MANAGER)

    db = AsyncMock()
    db.create_building = AsyncMock(
        return_value={
            "id": "b-1",
            "name": "Test Building",
            "address": "1 Main St",
            "city": "Tel Aviv",
            "region": "tel_aviv",
            "admin_user_id": f"user-{UserRole.BUILDINGS_MANAGER.value}",
            "invite_code": "ABCDEFGH",
        }
    )
    db.add_resident_to_building = AsyncMock()

    with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post("/api/v1/buildings/", json=_BUILDING_PAYLOAD)
    assert r.status_code == 200
    db.create_building.assert_awaited_once()


@pytest.mark.usefixtures("clear_overrides")
def test_admin_can_create_building() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)

    db = AsyncMock()
    db.create_building = AsyncMock(
        return_value={
            "id": "b-1",
            "name": "Test Building",
            "address": "1 Main St",
            "city": "Tel Aviv",
            "region": "tel_aviv",
            "admin_user_id": f"user-{UserRole.ADMIN.value}",
            "invite_code": "ABCDEFGH",
        }
    )
    db.add_resident_to_building = AsyncMock()

    with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post("/api/v1/buildings/", json=_BUILDING_PAYLOAD)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# B2: POST /buildings/{id}/regenerate-invite — RBAC + ownership scope
# ---------------------------------------------------------------------------


@pytest.mark.usefixtures("clear_overrides")
def test_resident_cannot_regenerate_invite_code() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.RESIDENT)
    with TestClient(app) as client:
        r = client.post("/api/v1/buildings/b-1/regenerate-invite")
    assert r.status_code == 403


@pytest.mark.usefixtures("clear_overrides")
def test_buildings_manager_can_only_rotate_own_buildings() -> None:
    """A BM trying to rotate a building they don't admin must get 403, not 200."""
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.BUILDINGS_MANAGER)

    db = AsyncMock()
    db.get_building = AsyncMock(
        return_value={"id": "b-other", "admin_user_id": "someone-else"},
    )

    with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post("/api/v1/buildings/b-other/regenerate-invite")
    assert r.status_code == 403
    db.regenerate_building_invite_code.assert_not_called()


@pytest.mark.usefixtures("clear_overrides")
def test_buildings_manager_can_rotate_their_own_building() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.BUILDINGS_MANAGER)

    db = AsyncMock()
    db.get_building = AsyncMock(
        return_value={
            "id": "b-1",
            "admin_user_id": f"user-{UserRole.BUILDINGS_MANAGER.value}",
        }
    )
    db.regenerate_building_invite_code = AsyncMock(return_value="NEWCODE9")

    with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post("/api/v1/buildings/b-1/regenerate-invite")
    assert r.status_code == 200
    assert r.json() == {"building_id": "b-1", "invite_code": "NEWCODE9"}


@pytest.mark.usefixtures("clear_overrides")
def test_admin_can_rotate_any_building() -> None:
    """Admins are not subject to the BM ownership check."""
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)

    db = AsyncMock()
    db.get_building = AsyncMock(
        return_value={"id": "b-other", "admin_user_id": "someone-else"},
    )
    db.regenerate_building_invite_code = AsyncMock(return_value="ROTATED1")

    with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post("/api/v1/buildings/b-other/regenerate-invite")
    assert r.status_code == 200
    assert r.json()["invite_code"] == "ROTATED1"


@pytest.mark.usefixtures("clear_overrides")
def test_regenerate_returns_404_for_unknown_building() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
    db = AsyncMock()
    db.get_building = AsyncMock(return_value=None)
    with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
        with TestClient(app) as client:
            r = client.post("/api/v1/buildings/missing/regenerate-invite")
    assert r.status_code == 404
