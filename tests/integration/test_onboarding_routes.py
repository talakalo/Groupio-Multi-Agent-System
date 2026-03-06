"""Integration tests for POST /api/v1/onboarding."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user
from src.models.user import UserInDB

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_user(**overrides):
    defaults = dict(
        id="user-123",
        email="test@example.com",
        full_name="Test User",
        phone="0501234567",
        role="resident",
        is_active=True,
        is_verified=True,
        building_id=None,
        contractor_id=None,
    )
    defaults.update(overrides)
    return MagicMock(**defaults)


@pytest.fixture
def resident_user():
    return _make_user()


@pytest.fixture
def contractor_user():
    return _make_user(role="contractor")


@pytest.fixture
def already_onboarded_resident():
    return _make_user(building_id="building-999")


@pytest.fixture
def client_resident(resident_user):
    app.dependency_overrides[get_current_user] = lambda: resident_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_contractor(contractor_user):
    app.dependency_overrides[get_current_user] = lambda: contractor_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_already_onboarded(already_onboarded_resident):
    app.dependency_overrides[get_current_user] = lambda: already_onboarded_resident
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    """Mock the DB client used by the onboarding route module."""
    with patch("src.api.routes.onboarding.get_postgres_client") as mock_get:
        db = AsyncMock()
        mock_get.return_value = db
        yield db


# ---------------------------------------------------------------------------
# Resident onboarding tests
# ---------------------------------------------------------------------------


class TestResidentOnboarding:
    RESIDENT_PAYLOAD = {
        "role": "resident",
        "categories": ["ac_installation", "electrical"],
        "building": {
            "buildingAddress": "10 Herzl Street",
            "city": "Tel Aviv",
            "region": "tel_aviv",
            "apartmentNumber": "5A",
            "buildingType": "new_residential",
        },
    }

    def test_resident_onboarding_creates_new_building(self, client_resident, mock_db, resident_user):
        """Happy path: no existing building → creates one, links user."""

        # No existing building found
        mock_db.list_buildings = AsyncMock(return_value=([], 0))
        mock_db.create_building = AsyncMock(
            return_value={"id": "bld-new", "name": "10 Herzl Street, Tel Aviv", "city": "Tel Aviv"}
        )
        mock_db.is_user_in_building = AsyncMock(return_value=False)
        mock_db.add_resident_to_building = AsyncMock()

        updated_user = MagicMock(spec=UserInDB)
        updated_user.model_dump.return_value = {
            "id": "user-123",
            "email": "test@example.com",
            "full_name": "Test User",
            "phone": "0501234567",
            "role": "resident",
            "is_active": True,
            "is_verified": True,
            "building_id": "bld-new",
            "contractor_id": None,
            "avatar_url": None,
            "preferred_language": "he",
            "last_login": None,
            "created_at": datetime(2024, 1, 1),
            "updated_at": datetime(2024, 1, 1),
        }
        mock_db.update_user = AsyncMock(return_value=updated_user)

        response = client_resident.post(
            "/api/v1/onboarding",
            json=self.RESIDENT_PAYLOAD,
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["user"]["building_id"] == "bld-new"
        mock_db.create_building.assert_awaited_once()
        mock_db.add_resident_to_building.assert_awaited_once()

    def test_resident_onboarding_finds_existing_building(self, client_resident, mock_db):
        """When a building at the same address already exists, reuse it."""

        existing_building = {"id": "bld-existing", "address": "10 Herzl Street", "city": "Tel Aviv"}
        mock_db.list_buildings = AsyncMock(return_value=([existing_building], 1))
        mock_db.is_user_in_building = AsyncMock(return_value=False)
        mock_db.add_resident_to_building = AsyncMock()

        updated_user = MagicMock(spec=UserInDB)
        updated_user.model_dump.return_value = {
            "id": "user-123",
            "email": "test@example.com",
            "full_name": "Test User",
            "phone": "0501234567",
            "role": "resident",
            "is_active": True,
            "is_verified": True,
            "building_id": "bld-existing",
            "contractor_id": None,
            "avatar_url": None,
            "preferred_language": "he",
            "last_login": None,
            "created_at": datetime(2024, 1, 1),
            "updated_at": datetime(2024, 1, 1),
        }
        mock_db.update_user = AsyncMock(return_value=updated_user)

        response = client_resident.post(
            "/api/v1/onboarding",
            json=self.RESIDENT_PAYLOAD,
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        # Building should NOT have been created
        mock_db.create_building.assert_not_awaited()
        assert response.json()["user"]["building_id"] == "bld-existing"

    def test_resident_onboarding_missing_building_payload(self, client_resident, mock_db):
        """Missing building info returns 422 (validation error)."""
        response = client_resident.post(
            "/api/v1/onboarding",
            json={"role": "resident", "categories": []},
            headers={"Authorization": "Bearer test-token"},
        )
        # Pydantic validates building=None is allowed; route returns 400
        assert response.status_code in (400, 422)

    def test_already_onboarded_resident_returns_200(self, client_already_onboarded, mock_db):
        """Re-submitting onboarding when building_id is already set is idempotent."""

        existing_user = MagicMock(spec=UserInDB)
        existing_user.model_dump.return_value = {
            "id": "user-123",
            "email": "test@example.com",
            "full_name": "Test User",
            "phone": "0501234567",
            "role": "resident",
            "is_active": True,
            "is_verified": True,
            "building_id": "building-999",
            "contractor_id": None,
            "avatar_url": None,
            "preferred_language": "he",
            "last_login": None,
            "created_at": datetime(2024, 1, 1),
            "updated_at": datetime(2024, 1, 1),
        }
        mock_db.get_user = AsyncMock(return_value=existing_user)

        response = client_already_onboarded.post(
            "/api/v1/onboarding",
            json=self.RESIDENT_PAYLOAD,
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True
        # Should not attempt to create or update anything
        mock_db.create_building.assert_not_awaited()
        mock_db.update_user.assert_not_awaited()


# ---------------------------------------------------------------------------
# Contractor onboarding tests
# ---------------------------------------------------------------------------


class TestContractorOnboarding:
    CONTRACTOR_PAYLOAD = {
        "role": "contractor",
        "categories": ["electrical", "plumbing"],
        "business": {
            "businessName": "Acme Electric",
            "licenseNumber": "LIC-12345",
            "yearsInBusiness": 10,
            "regions": ["center", "tel_aviv"],
            "description": "Professional electrical services",
        },
    }

    def test_contractor_onboarding_success(self, client_contractor, mock_db, contractor_user):
        """Happy path: contractor profile created and user updated."""

        updated_user = MagicMock(spec=UserInDB)
        updated_user.model_dump.return_value = {
            "id": "user-123",
            "email": "test@example.com",
            "full_name": "Test User",
            "phone": "0501234567",
            "role": "contractor",
            "is_active": True,
            "is_verified": True,
            "building_id": None,
            "contractor_id": "ctr-new",
            "avatar_url": None,
            "preferred_language": "he",
            "last_login": None,
            "created_at": datetime(2024, 1, 1),
            "updated_at": datetime(2024, 1, 1),
        }
        mock_db.update_user = AsyncMock(return_value=updated_user)

        with patch("src.api.routes.onboarding._insert_contractor_row", new_callable=AsyncMock):
            response = client_contractor.post(
                "/api/v1/onboarding",
                json=self.CONTRACTOR_PAYLOAD,
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["user"]["role"] == "contractor"

    def test_contractor_onboarding_missing_business_payload(self, client_contractor, mock_db):
        """Missing business info returns 400."""
        response = client_contractor.post(
            "/api/v1/onboarding",
            json={"role": "contractor", "categories": []},
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code in (400, 422)

    def test_invalid_role_returns_422(self, client_resident, mock_db):
        """An invalid role value is rejected at the validation layer."""
        response = client_resident.post(
            "/api/v1/onboarding",
            json={"role": "superuser", "categories": []},
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 422

    def test_unauthenticated_request_returns_401(self):
        """Calling the endpoint without a token returns 401."""
        # No auth override → real dependency → should fail auth
        with TestClient(app) as c:
            response = c.post("/api/v1/onboarding", json={"role": "resident", "categories": []})
        assert response.status_code in (401, 403)
