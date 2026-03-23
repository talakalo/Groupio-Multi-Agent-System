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
