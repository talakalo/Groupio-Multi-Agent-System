"""Unit tests for the onboarding API route."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    building_id: str | None = None,
    contractor_id: str | None = None,
    role: UserRole = UserRole.RESIDENT,
) -> UserInDB:
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
        contractor_id=contractor_id,
        created_at=now,
        updated_at=now,
    )


def _resident_request():
    return {
        "role": "resident",
        "categories": [],
        "building": {
            "buildingAddress": "123 Main St",
            "city": "Tel Aviv",
            "region": "center",
            "apartmentNumber": "4A",
            "buildingType": "new_residential",
        },
    }


def _contractor_request():
    return {
        "role": "contractor",
        "categories": ["plumbing"],
        "business": {
            "businessName": "Best Plumber Ltd",
            "licenseNumber": "LIC-12345",
            "yearsInBusiness": 5,
            "regions": ["center"],
            "description": "Professional plumbing services",
        },
    }


# ---------------------------------------------------------------------------
# Already onboarded (idempotent) paths
# ---------------------------------------------------------------------------


class TestAlreadyOnboarded:
    def test_resident_already_has_building(self):
        user = _make_user(building_id="b-existing")
        db = AsyncMock()
        db.get_user = AsyncMock(return_value=user)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 200
            assert resp.json()["success"] is True
        finally:
            app.dependency_overrides.clear()

    def test_contractor_already_has_contractor_id(self):
        user = _make_user(contractor_id="c-existing")
        db = AsyncMock()
        db.get_user = AsyncMock(return_value=user)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_contractor_request())
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Resident onboarding - new building
# ---------------------------------------------------------------------------


class TestResidentOnboarding:
    def test_resident_creates_new_building(self):
        user = _make_user()
        updated_user = _make_user(building_id="b-new")
        db = AsyncMock()
        db.list_buildings = AsyncMock(return_value=([], 0))  # no existing building
        db.create_building = AsyncMock(return_value={"id": "b-new", "name": "Test Building"})
        db.is_user_in_building = AsyncMock(return_value=False)
        db.add_resident_to_building = AsyncMock()
        db.update_user = AsyncMock(return_value=updated_user)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 200
            db.create_building.assert_called_once()
            db.add_resident_to_building.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_resident_joins_existing_building(self):
        user = _make_user()
        updated_user = _make_user(building_id="b-existing")
        db = AsyncMock()
        db.list_buildings = AsyncMock(
            return_value=([{"id": "b-existing", "address": "123 Main St", "city": "Tel Aviv"}], 1)
        )
        db.is_user_in_building = AsyncMock(return_value=False)
        db.add_resident_to_building = AsyncMock()
        db.update_user = AsyncMock(return_value=updated_user)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 200
            db.create_building.assert_not_called()
        finally:
            app.dependency_overrides.clear()

    def test_resident_already_in_building_skips_add(self):
        user = _make_user()
        updated_user = _make_user(building_id="b-existing")
        db = AsyncMock()
        db.list_buildings = AsyncMock(
            return_value=([{"id": "b-existing", "address": "123 Main St", "city": "Tel Aviv"}], 1)
        )
        db.is_user_in_building = AsyncMock(return_value=True)
        db.update_user = AsyncMock(return_value=updated_user)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 200
            db.add_resident_to_building.assert_not_called()
        finally:
            app.dependency_overrides.clear()

    def test_resident_missing_building_info(self):
        user = _make_user()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/onboarding",
                json={"role": "resident", "categories": []},
            )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_resident_create_building_fails(self):
        user = _make_user()
        db = AsyncMock()
        db.list_buildings = AsyncMock(return_value=([], 0))
        db.create_building = AsyncMock(side_effect=RuntimeError("DB error"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 500
        finally:
            app.dependency_overrides.clear()

    def test_resident_add_to_building_fails(self):
        user = _make_user()
        db = AsyncMock()
        db.list_buildings = AsyncMock(return_value=([], 0))
        db.create_building = AsyncMock(return_value={"id": "b-new"})
        db.is_user_in_building = AsyncMock(return_value=False)
        db.add_resident_to_building = AsyncMock(side_effect=RuntimeError("DB error"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 500
        finally:
            app.dependency_overrides.clear()

    def test_resident_update_user_fails(self):
        user = _make_user()
        db = AsyncMock()
        db.list_buildings = AsyncMock(return_value=([], 0))
        db.create_building = AsyncMock(return_value={"id": "b-new"})
        db.is_user_in_building = AsyncMock(return_value=False)
        db.add_resident_to_building = AsyncMock()
        db.update_user = AsyncMock(side_effect=RuntimeError("DB error"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_resident_request())
            assert resp.status_code == 500
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Contractor onboarding
# ---------------------------------------------------------------------------


class TestContractorOnboarding:
    def test_contractor_ok(self):
        user = _make_user()
        updated_user = _make_user(contractor_id="c-new")
        db = AsyncMock()
        db.update_user = AsyncMock(return_value=updated_user)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.onboarding.get_postgres_client", return_value=db):
                with patch("src.api.routes.onboarding._insert_contractor_row", new=AsyncMock()):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/onboarding", json=_contractor_request())
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_contractor_missing_business_info(self):
        user = _make_user()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/onboarding",
                json={"role": "contractor", "categories": []},
            )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_contractor_insert_fails(self):
        user = _make_user()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch(
                "src.api.routes.onboarding._insert_contractor_row",
                new=AsyncMock(side_effect=RuntimeError("DB error")),
            ):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/onboarding", json=_contractor_request())
            assert resp.status_code == 500
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def test_floor_from_apartment_numeric():
    from src.api.routes.onboarding import _floor_from_apartment

    assert _floor_from_apartment("4") == 1  # 4 // 4 = 1
    assert _floor_from_apartment("8") == 2  # 8 // 4 = 2
    assert _floor_from_apartment("12A") == 3  # 12 // 4 = 3
    assert _floor_from_apartment("A1") == 1  # no leading digit → 1


def test_floor_from_apartment_nonnumeric():
    from src.api.routes.onboarding import _floor_from_apartment

    assert _floor_from_apartment("GF") == 1  # no digits at start
