"""Unit tests for the buildings API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role: UserRole = UserRole.RESIDENT, building_id: str | None = "b1") -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        building_id=building_id,
        created_at=now,
        updated_at=now,
    )


def _make_building(**kwargs) -> dict:
    now = datetime.now(UTC)
    base = {
        "id": "b1",
        "name": "Tower A",
        "address": "1 Main St",
        "city": "Tel Aviv",
        "region": "center",
        "total_units": 20,
        "floors": 5,
        "year_built": 2000,
        "admin_user_id": "user-1",
        "resident_count": 10,
        "active_offers": 2,
        "completed_offers": 5,
        "total_savings": 1000,
        "whatsapp_group_id": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    base.update(kwargs)
    return base


def _client(user, mock_db):
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.buildings.get_postgres_client", return_value=mock_db):
            yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /buildings/me
# ---------------------------------------------------------------------------


class TestGetMyBuilding:
    def test_get_my_building_ok(self):
        user = _make_user(building_id="b1")
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.get_building_residents = AsyncMock(
            return_value=([{"user_id": "user-1", "full_name": "Test", "unit_number": "1", "joined_at": None}], 1)
        )
        db.get_active_offers = AsyncMock(return_value=[])
        db.get_building_stats = AsyncMock(return_value={"total_savings": 500})

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/me")
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == "b1"
            assert "residents" in data
        finally:
            app.dependency_overrides.clear()

    def test_get_my_building_no_building(self):
        user = _make_user(building_id=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            db = AsyncMock()
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/me")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_my_building_not_found(self):
        user = _make_user(building_id="b-missing")
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/me")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /buildings/
# ---------------------------------------------------------------------------


class TestCreateBuilding:
    def test_create_building_ok(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.create_building = AsyncMock(return_value=_make_building())
        db.add_resident_to_building = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/",
                    json={
                        "name": "Tower A",
                        "address": "1 Main St",
                        "city": "Tel Aviv",
                        "region": "center",
                        "total_units": 20,
                        "floors": 5,
                        "year_built": 2000,
                    },
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /buildings/
# ---------------------------------------------------------------------------


class TestListBuildings:
    def test_list_buildings_admin(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.list_buildings = AsyncMock(return_value=([_make_building()], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/?city=Tel+Aviv")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
        finally:
            app.dependency_overrides.clear()

    def test_list_buildings_resident_filters_by_user(self):
        user = _make_user(role=UserRole.RESIDENT)
        db = AsyncMock()
        db.list_buildings = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/")
            assert resp.status_code == 200
            # Resident should have user_id filter applied
            call_kwargs = db.list_buildings.call_args[1]
            assert call_kwargs["filters"].get("user_id") == "user-1"
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /buildings/{building_id}
# ---------------------------------------------------------------------------


class TestGetBuilding:
    def test_get_building_admin_ok(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_building_not_found(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_building_resident_authorized(self):
        user = _make_user(role=UserRole.RESIDENT)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=True)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_building_resident_not_authorized(self):
        user = _make_user(role=UserRole.RESIDENT)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# PUT /buildings/{building_id}
# ---------------------------------------------------------------------------


class TestUpdateBuilding:
    def test_update_building_by_admin(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        updated = _make_building(name="Updated Tower")
        db.get_building = AsyncMock(return_value=_make_building())
        db.update_building = AsyncMock(return_value=updated)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/buildings/b1", json={"name": "Updated Tower"})
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_building_not_found(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/buildings/missing", json={"name": "Updated"})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_update_building_unauthorized_resident(self):
        user = _make_user(role=UserRole.RESIDENT)
        building = _make_building(admin_user_id="other-user")
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=building)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/buildings/b1", json={"name": "Updated"})
            # 403 because resident is not building admin and not system admin
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /buildings/{building_id}
# ---------------------------------------------------------------------------


class TestDeleteBuilding:
    def test_delete_building_ok(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.count_active_offers = AsyncMock(return_value=0)
        db.delete_building = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/b1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_delete_building_with_active_offers_blocked(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.count_active_offers = AsyncMock(return_value=3)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/b1")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_delete_building_resident_forbidden(self):
        user = _make_user(role=UserRole.RESIDENT)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        db = AsyncMock()
        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/b1")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_delete_building_not_found(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /{building_id}/residents
# ---------------------------------------------------------------------------


class TestGetBuildingResidents:
    def test_get_residents_ok_admin(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.get_building_residents = AsyncMock(return_value=([{"user_id": "user-1", "full_name": "A"}], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/residents")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
        finally:
            app.dependency_overrides.clear()

    def test_get_residents_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/missing/residents")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_residents_resident_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other"))
        db.is_user_in_building = AsyncMock(return_value=True)
        db.get_building_residents = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/residents")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_residents_unauthorized_resident(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other"))
        db.is_user_in_building = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/residents")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /{building_id}/residents
# ---------------------------------------------------------------------------


class TestAddResident:
    def test_add_resident_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=False)
        db.is_unit_taken = AsyncMock(return_value=False)
        from datetime import UTC
        from datetime import datetime as _dt

        db.add_resident_to_building = AsyncMock(
            return_value={
                "id": "res-1",
                "user_id": "user-1",
                "building_id": "b1",
                "unit_number": "4A",
                "floor": 4,
                "is_owner": True,
                "joined_at": _dt.now(UTC),
            }
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/b1/residents",
                    params={"unit_number": "4A", "floor": 4},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_add_resident_building_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/missing/residents",
                    params={"unit_number": "4A", "floor": 4},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_add_resident_already_resident(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=True)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/b1/residents",
                    params={"unit_number": "4A", "floor": 4},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_add_resident_unit_taken(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=False)
        db.is_unit_taken = AsyncMock(return_value=True)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/b1/residents",
                    params={"unit_number": "4A", "floor": 4},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /{building_id}/residents/{user_id}
# ---------------------------------------------------------------------------


class TestRemoveResident:
    def test_remove_self_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other"))
        db.remove_resident_from_building = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/b1/residents/user-1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_remove_cannot_remove_admin(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="admin-target"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/b1/residents/admin-target")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_remove_other_user_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other-admin"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/b1/residents/other-user")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_remove_building_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/buildings/missing/residents/user-1")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /{building_id}/stats
# ---------------------------------------------------------------------------


class TestGetBuildingStats:
    def test_get_stats_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=True)
        db.get_building_stats = AsyncMock(
            return_value={
                "total_residents": 10,
                "active_offers": 2,
                "completed_offers": 5,
                "total_savings": 5000,
                "average_participation_rate": 0.8,
            }
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/stats")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_stats_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/missing/stats")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_stats_unauthorized_resident(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other"))
        db.is_user_in_building = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/stats")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /{building_id}/offers
# ---------------------------------------------------------------------------


class TestGetBuildingOffers:
    def test_get_offers_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=True)
        db.list_offers = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/offers")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_offers_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/missing/offers")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_offers_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other"))
        db.is_user_in_building = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/offers")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_get_offers_with_status(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building())
        db.is_user_in_building = AsyncMock(return_value=True)
        db.list_offers = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/buildings/b1/offers?status=pending")
            assert resp.status_code == 200
            call_kwargs = db.list_offers.call_args[1]
            assert call_kwargs["filters"]["status"] == "pending"
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /{building_id}/invite
# ---------------------------------------------------------------------------


class TestInviteResidents:
    def test_invite_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="user-1"))
        db.create_invitation = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/b1/invite",
                    json=["invite@example.com", "other@example.com"],
                )
            assert resp.status_code == 200
            assert resp.json()["status"] == "invitations_sent"
            assert db.create_invitation.call_count == 2
        finally:
            app.dependency_overrides.clear()

    def test_invite_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/missing/invite",
                    json=["invite@example.com"],
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_invite_unauthorized(self):
        user = _make_user()  # resident, not admin of building
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=_make_building(admin_user_id="other-admin"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.buildings.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/buildings/b1/invite",
                    json=["invite@example.com"],
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()
