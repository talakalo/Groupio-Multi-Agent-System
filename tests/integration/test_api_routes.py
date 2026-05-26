"""Tests for API routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user


@pytest.fixture
def client():
    """Create test client."""
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    """Mock PostgreSQL client by patching the singleton."""
    db = AsyncMock()
    with patch("src.databases.postgres._postgres_client", db):
        yield db


@pytest.fixture
def mock_redis():
    """Mock Redis client by patching the singleton."""
    redis = AsyncMock()
    with patch("src.databases.redis_client._redis_client", redis):
        yield redis


@pytest.fixture
def mock_auth_user():
    """Mock authenticated user."""
    return {
        "id": "user-123",
        "email": "test@example.com",
        "full_name": "Test User",
        "phone": "0501234567",
        "role": "resident",
        "is_active": True,
        "is_verified": True,
        "building_id": "building-123",
    }


def override_auth(user_data: dict | MagicMock):
    """Override FastAPI auth dependency."""
    if isinstance(user_data, dict):
        mock_user = MagicMock(**user_data)
    else:
        mock_user = user_data

    async def _override():
        return mock_user

    app.dependency_overrides[get_current_user] = _override
    return mock_user


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check_all_healthy(self, client):
        """Test health check when all services are healthy."""
        with (
            patch("src.api.main.get_vector_store") as mock_vs,
            patch("src.api.main.get_graph_store") as mock_gs,
            patch("src.api.main.get_redis_client") as mock_redis,
            patch("src.api.main.get_postgres_client") as mock_db,
        ):
            mock_vs.return_value.health_check = AsyncMock(return_value=True)
            mock_gs.return_value.health_check = AsyncMock(return_value=True)
            mock_redis.return_value.health_check = AsyncMock(return_value=True)
            mock_db.return_value.health_check = AsyncMock(return_value=True)

            response = client.get("/api/v1/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"

    def test_health_check_degraded(self, client):
        """Test health check when some services are unhealthy."""
        with (
            patch("src.api.main.get_vector_store") as mock_vs,
            patch("src.api.main.get_graph_store") as mock_gs,
            patch("src.api.main.get_redis_client") as mock_redis,
            patch("src.api.main.get_postgres_client") as mock_db,
        ):
            mock_vs.return_value.health_check = AsyncMock(return_value=True)
            mock_gs.return_value.health_check = AsyncMock(return_value=False)
            mock_redis.return_value.health_check = AsyncMock(return_value=True)
            mock_db.return_value.health_check = AsyncMock(return_value=True)

            response = client.get("/api/v1/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "degraded"


class TestMessageEndpoint:
    """Tests for message processing endpoint."""

    def test_send_message_success(self, client, mock_db, mock_redis):
        """Test successful message processing."""
        override_auth({"id": "user-123", "role": "resident"})
        mock_redis.check_rate_limit = AsyncMock(return_value=True)
        mock_db.log_conversation = AsyncMock()
        with patch("src.api.main.get_orchestrator") as mock_orch:
            mock_orch.return_value.run = AsyncMock(
                return_value={
                    "conversation_id": "conv-123",
                    "response": {"message": "Hello!"},
                    "metadata": {"agent": "support"},
                }
            )

            response = client.post(
                "/api/v1/message",
                json={
                    "user_id": "user-123",
                    "message": "Hello, I need help",
                    "building_id": "building-123",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["conversation_id"] == "conv-123"

    def test_send_message_rate_limited(self, client, mock_db, mock_redis):
        """Test message rejected due to rate limiting."""
        override_auth({"id": "user-123", "role": "resident"})
        mock_redis.check_rate_limit = AsyncMock(return_value=False)

        response = client.post(
            "/api/v1/message",
            json={
                "user_id": "user-123",
                "message": "Hello",
            },
        )

        assert response.status_code == 429

    def test_send_message_invalid_input(self, client):
        """Test message validation fails."""
        override_auth({"id": "user-123", "role": "resident"})
        response = client.post(
            "/api/v1/message",
            json={
                "user_id": "",
                "message": "",
            },
        )

        assert response.status_code == 400


class TestOffersAPI:
    """Tests for offers API routes."""

    @pytest.fixture
    def mock_offer(self):
        """Sample offer data."""
        return {
            "id": "offer-123",
            "title": "AC Installation",
            "description": "Group AC installation for building",
            "category": "ac_installation",
            "base_price": 5000.0,
            "status": "pending",
            "building_id": "building-123",
            "created_by": "user-123",
            "current_participants": 5,
            "min_participants": 5,
            "max_participants": 20,
            "matched_contractor_id": None,
            "contractor_name": None,
            "building_name": "Tower A",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        }

    def test_list_offers(self, client, mock_db, mock_offer):
        """Test listing offers."""
        mock_db.list_offers = AsyncMock(return_value=([mock_offer], 1))
        mock_db.get_building_ids_for_user = AsyncMock(return_value=["building-123"])
        override_auth({"id": "user-123", "role": "resident"})

        response = client.get(
            "/api/v1/offers",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    def test_create_offer_success(self, client, mock_db, mock_offer):
        """Test creating an offer."""
        mock_db.get_building = AsyncMock(return_value={"id": "building-123"})
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.create_offer = AsyncMock(return_value=mock_offer)
        override_auth({"id": "user-123", "role": "resident"})

        with (
            patch("src.databases.vector_store._vector_store", AsyncMock()),
            patch("src.rag.embeddings._embedding_client", AsyncMock()),
        ):
            response = client.post(
                "/api/v1/offers",
                json={
                    "title": "AC Installation",
                    "description": "Group AC installation for building",
                    "category": "ac_installation",
                    "base_price": 5000.0,
                    "min_participants": 5,
                    "max_participants": 20,
                    "building_id": "building-123",
                    "created_by": "user-123",
                },
                headers={"Authorization": "Bearer test-token"},
            )

            assert response.status_code == 200

    def test_create_offer_403_when_not_resident(self, client, mock_db, mock_offer):
        """Test creating an offer when user is not a resident of the building."""
        mock_db.get_building = AsyncMock(return_value={"id": "building-123"})
        mock_db.is_user_in_building = AsyncMock(return_value=False)
        override_auth({"id": "user-123", "role": "resident"})

        response = client.post(
            "/api/v1/offers",
            json={
                "title": "AC Installation",
                "description": "Group AC installation for building",
                "category": "ac_installation",
                "base_price": 5000.0,
                "min_participants": 5,
                "max_participants": 20,
                "building_id": "building-123",
                "created_by": "user-123",
            },
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 403
        assert "resident" in response.json().get("detail", "").lower()

    def test_create_offer_validation_fails(self, client, mock_db):
        """Test create offer with invalid payload (validation error)."""
        override_auth({"id": "user-123", "role": "resident"})
        response = client.post(
            "/api/v1/offers",
            json={
                "title": "AB",
                "description": "Short",
                "category": "ac_installation",
                "base_price": -1,
                "building_id": "building-123",
                "created_by": "user-123",
            },
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 422

    def test_get_offer_success(self, client, mock_db, mock_offer):
        """Test getting an offer by ID."""
        mock_db.get_offer = AsyncMock(return_value=mock_offer)
        override_auth({"id": "user-123", "role": "resident"})
        response = client.get(
            "/api/v1/offers/offer-123",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        assert response.json()["id"] == "offer-123"

    def test_get_offer_not_found(self, client, mock_db):
        """Test get offer when offer does not exist."""
        mock_db.get_offer = AsyncMock(return_value=None)
        override_auth({"id": "user-123", "role": "resident"})
        response = client.get(
            "/api/v1/offers/nonexistent",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 404

    def test_join_offer_success(self, client, mock_db, mock_offer):
        """Test joining an offer."""
        mock_offer["status"] = "pending"
        mock_offer["current_participants"] = 3
        mock_offer["max_participants"] = 20
        mock_db.get_offer = AsyncMock(return_value=mock_offer)
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.has_user_joined_offer = AsyncMock(return_value=False)
        mock_db.join_offer = AsyncMock()
        override_auth({"id": "user-123", "role": "resident"})

        with (
            patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=AsyncMock()),
        ):
            response = client.post(
                "/api/v1/offers/offer-123/join",
                json={"user_id": "user-123", "unit_count": 1},
                headers={"Authorization": "Bearer test-token"},
            )
        assert response.status_code == 200
        assert response.json().get("status") == "joined"


class TestBuildingsAPI:
    """Tests for buildings API routes."""

    @pytest.fixture
    def mock_building(self):
        """Sample building data."""
        return {
            "id": "building-123",
            "name": "Tower A",
            "address": "123 Main St",
            "city": "Tel Aviv",
            "region": "center",
            "total_units": 50,
            "floors": 10,
            "admin_user_id": "admin-123",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        }

    def test_get_building_success(self, client, mock_db, mock_building):
        """Test getting a building by ID."""
        mock_db.get_building = AsyncMock(return_value=mock_building)
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        override_auth({"id": "user-123", "role": "resident"})
        response = client.get(
            "/api/v1/buildings/building-123",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        assert response.json()["id"] == "building-123"

    def test_get_building_403_when_not_resident(self, client, mock_db, mock_building):
        """Test get building when user is not a resident returns 403."""
        mock_db.get_building = AsyncMock(return_value=mock_building)
        mock_db.is_user_in_building = AsyncMock(return_value=False)
        override_auth({"id": "user-456", "role": "resident"})
        response = client.get(
            "/api/v1/buildings/building-123",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 403

    def test_get_building_admin_bypasses_resident_check(self, client, mock_db, mock_building):
        """Test admin can get any building without resident check."""
        mock_db.get_building = AsyncMock(return_value=mock_building)
        override_auth({"id": "admin-123", "role": "admin"})
        response = client.get(
            "/api/v1/buildings/building-123",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200

    def test_get_building_not_found(self, client, mock_db):
        """Test get building when building does not exist."""
        mock_db.get_building = AsyncMock(return_value=None)
        override_auth({"id": "user-123", "role": "resident"})
        response = client.get(
            "/api/v1/buildings/nonexistent",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 404

    def test_get_building_residents_success(self, client, mock_db, mock_building):
        """Test get building residents (admin or resident)."""
        mock_db.get_building = AsyncMock(return_value=mock_building)
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.get_building_residents = AsyncMock(
            return_value=(
                [{"user_id": "user-123", "unit_number": "1", "floor": 1}],
                1,
            )
        )
        override_auth({"id": "user-123", "role": "resident"})
        response = client.get(
            "/api/v1/buildings/building-123/residents",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert data["total"] == 1


class TestContractorsAPI:
    """Tests for contractors API routes."""

    @pytest.fixture
    def mock_contractor(self):
        """Sample contractor data."""
        return {
            "id": "contractor-123",
            "business_name": "AC Pro",
            "contact_name": "John Doe",
            "email": "john@acpro.com",
            "phone": "0501234567",
            "description": (
                "Professional AC installation and maintenance services "
                "for residential and commercial buildings in the Tel Aviv area"
            ),
            "categories": ["ac_installation"],
            "regions": ["center", "tel_aviv"],
            "verification_status": "verified",
            "trust_score": 85.0,
            "average_rating": 4.5,
            "years_experience": 10,
            "employee_count": 5,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        }

    def test_list_contractors(self, client, mock_db, mock_contractor):
        """Test listing contractors."""
        mock_db.list_contractors = AsyncMock(return_value=([mock_contractor], 1))

        response = client.get("/api/v1/contractors")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    def test_get_contractor(self, client, mock_db, mock_contractor):
        """Test getting contractor details."""
        mock_db.get_contractor = AsyncMock(return_value=mock_contractor)

        response = client.get("/api/v1/contractors/contractor-123")

        assert response.status_code == 200
        data = response.json()
        assert data["business_name"] == "AC Pro"

    def test_get_contractor_not_found(self, client, mock_db):
        """Test getting non-existent contractor."""
        mock_db.get_contractor = AsyncMock(return_value=None)

        response = client.get("/api/v1/contractors/invalid-id")

        assert response.status_code == 404


class TestAuthAPI:
    """Tests for authentication API routes."""

    def test_register_success(self, client, mock_db, mock_redis):
        """Test successful registration."""
        mock_db.get_user_by_email = AsyncMock(return_value=None)
        mock_db.get_user_by_phone = AsyncMock(return_value=None)

        class FakeUser:
            id = "user-123"
            email = "test@example.com"
            full_name = "Test User"
            phone = "0501234567"
            role = "resident"
            is_active = True
            is_verified = False
            preferred_language = "he"
            avatar_url = None
            building_id = None
            contractor_id = None
            created_at = "2024-01-01T00:00:00Z"
            updated_at = "2024-01-01T00:00:00Z"

        mock_db.create_user = AsyncMock(return_value=FakeUser())
        mock_redis.set = AsyncMock()

        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "test@example.com",
                "password": "securepassword123",
                "full_name": "Test User",
                "phone": "0501234567",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"

    def test_register_email_exists(self, client, mock_db, mock_redis):
        """Test registration with existing email."""
        mock_db.get_user_by_email = AsyncMock(return_value={"id": "existing"})

        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "test@example.com",
                "password": "securepassword123",
                "full_name": "Test User",
                "phone": "0501234567",
            },
        )

        assert response.status_code == 400

    def test_login_success(self, client, mock_db, mock_redis):
        """Test successful login."""
        mock_db.get_user_by_email = AsyncMock(
            return_value=MagicMock(
                id="user-123",
                email="test@example.com",
                role="resident",
                is_active=True,
            )
        )
        mock_redis.set = AsyncMock()
        mock_redis.is_temporarily_locked = AsyncMock(return_value=0)
        mock_redis.clear_login_failures = AsyncMock()
        mock_redis.clear_temporary_lockout = AsyncMock()

        with patch("src.api.routes.auth.verify_password") as mock_verify:
            mock_verify.return_value = True
            mock_db.get_user_password_hash = AsyncMock(return_value="hashed")
            mock_db.update_user = AsyncMock()

            response = client.post(
                "/api/v1/auth/login",
                data={
                    "username": "test@example.com",
                    "password": "password123",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data

    def test_login_invalid_credentials(self, client, mock_db, mock_redis):
        """Test login with invalid credentials."""
        mock_redis.check_ip_rate_limit = AsyncMock(return_value=True)
        mock_db.get_user_by_email = AsyncMock(return_value=None)

        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "test@example.com",
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401

    def test_login_json_success(self, client, mock_db, mock_redis):
        """Test login with JSON body (POST /auth/login/json)."""
        mock_db.get_user_by_email = AsyncMock(
            return_value=MagicMock(
                id="user-123",
                email="test@example.com",
                role="resident",
                is_active=True,
                is_verified=True,
            )
        )
        mock_redis.set = AsyncMock()
        mock_redis.is_temporarily_locked = AsyncMock(return_value=0)
        mock_redis.clear_login_failures = AsyncMock()
        mock_redis.clear_temporary_lockout = AsyncMock()
        mock_db.update_user = AsyncMock()
        with patch("src.api.routes.auth.verify_password") as mock_verify:
            mock_verify.return_value = True
            mock_db.get_user_password_hash = AsyncMock(return_value="hashed")
            response = client.post(
                "/api/v1/auth/login/json",
                json={"email": "test@example.com", "password": "password123"},
            )
            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data
            assert "refresh_token" in data

    def test_signup_success(self, client, mock_db, mock_redis):
        """Test signup returns token and user."""
        mock_db.get_user_by_email = AsyncMock(return_value=None)
        mock_db.get_user_by_phone = AsyncMock(return_value=None)

        class FakeUser:
            id = "user-new"
            email = "new@example.com"
            full_name = "New User"
            phone = "0509876543"
            role = "resident"
            is_active = True
            is_verified = False
            preferred_language = "he"
            avatar_url = None
            building_id = None
            contractor_id = None
            created_at = "2024-01-01T00:00:00Z"
            updated_at = "2024-01-01T00:00:00Z"

        mock_db.create_user = AsyncMock(return_value=FakeUser())
        mock_redis.set = AsyncMock()
        response = client.post(
            "/api/v1/auth/signup",
            json={
                "name": "New User",
                "email": "new@example.com",
                "phone": "0509876543",
                "password": "securepass12",
                "role": "resident",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["token"]
        assert data["user"]["email"] == "new@example.com"

    def test_signup_validation_fails(self, client, mock_db, mock_redis):
        """Test signup with invalid payload (short password, etc)."""
        mock_redis.check_ip_rate_limit = AsyncMock(return_value=True)
        response = client.post(
            "/api/v1/auth/signup",
            json={
                "name": "A",
                "email": "invalid-email",
                "phone": "123",
                "password": "short",
                "role": "resident",
            },
        )
        assert response.status_code == 422

    def test_signup_email_exists(self, client, mock_db, mock_redis):
        """Test signup with existing email."""
        mock_redis.check_ip_rate_limit = AsyncMock(return_value=True)
        mock_db.get_user_by_email = AsyncMock(return_value=MagicMock(id="existing"))
        response = client.post(
            "/api/v1/auth/signup",
            json={
                "name": "New User",
                "email": "existing@example.com",
                "phone": "0509876543",
                "password": "securepass12",
                "role": "resident",
            },
        )
        assert response.status_code == 400
        assert (
            "email" in response.json().get("detail", "").lower()
            or "already" in response.json().get("detail", "").lower()
        )

    def test_refresh_token_success(self, client, mock_db, mock_redis):
        """Test refresh returns new tokens."""
        mock_db.get_user = AsyncMock(
            return_value=MagicMock(
                id="user-123",
                email="test@example.com",
                role="resident",
                is_active=True,
            )
        )
        mock_redis.get = AsyncMock(return_value="stored-refresh-token")
        mock_redis.set = AsyncMock()
        with patch("src.api.routes.auth.verify_refresh_token") as mock_verify:
            mock_verify.return_value = {"sub": "user-123"}
            response = client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": "stored-refresh-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data
            assert "refresh_token" in data

    def test_logout_success(self, client, mock_db, mock_redis):
        """Test logout invalidates refresh token."""
        override_auth({"id": "user-123", "email": "test@example.com"})
        mock_redis.delete = AsyncMock()
        response = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code in (200, 204)

    def test_me_requires_auth(self, client):
        """Test GET /me without token returns 401."""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_me_success(self, client, mock_db, mock_auth_user):
        """Test GET /me with valid token returns user."""

        class FakeUser:
            id = mock_auth_user["id"]
            email = mock_auth_user["email"]
            full_name = mock_auth_user["full_name"]
            phone = mock_auth_user["phone"]
            role = mock_auth_user["role"]
            is_active = mock_auth_user["is_active"]
            is_verified = mock_auth_user["is_verified"]
            building_id = mock_auth_user.get("building_id")
            preferred_language = "he"
            avatar_url = None
            contractor_id = None
            created_at = "2024-01-01T00:00:00Z"
            updated_at = "2024-01-01T00:00:00Z"

        override_auth(FakeUser())
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == mock_auth_user["email"]


class TestEscalationsAPI:
    """Tests for escalations API routes."""

    @pytest.fixture
    def mock_escalation(self):
        """Sample escalation data."""
        return {
            "id": "esc-123",
            "user_id": "user-123",
            "conversation_id": "conv-123",
            "source_agent": "support",
            "reason": "negative_sentiment",
            "priority": "high",
            "summary": "User expressed frustration",
            "status": "open",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        }

    def test_list_escalations_admin(self, client, mock_db, mock_escalation):
        """Test listing escalations as admin."""
        mock_db.list_escalations = AsyncMock(return_value=([mock_escalation], 1))
        override_auth({"id": "admin-123", "role": "admin"})

        response = client.get(
            "/api/v1/escalations",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200

    def test_list_escalations_non_admin(self, client, mock_db):
        """Test listing escalations as non-admin (should fail)."""
        override_auth({"id": "user-123", "role": "resident"})

        response = client.get(
            "/api/v1/escalations",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 403

    def test_resolve_escalation(self, client, mock_db, mock_escalation):
        """Test resolving an escalation."""
        mock_db.get_escalation = AsyncMock(return_value=MagicMock(**mock_escalation))
        resolved = {
            **mock_escalation,
            "status": "resolved",
            "resolved_at": "2024-01-02T00:00:00Z",
            "assigned_to": None,
            "context": {},
            "agent_reasoning": None,
            "resolution_notes": "Issue resolved",
            "user_name": None,
            "user_email": None,
            "assigned_to_name": None,
        }

        class FakeEscalation:
            pass

        esc = FakeEscalation()
        for k, v in resolved.items():
            setattr(esc, k, v)
        mock_db.update_escalation = AsyncMock(return_value=esc)
        override_auth({"id": "admin-123", "role": "admin"})

        response = client.post(
            "/api/v1/escalations/esc-123/resolve",
            json={"resolution_notes": "Issue resolved"},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200


class TestWhatsAppWebhook:
    """Tests for WhatsApp webhook (main.py)."""

    def test_whatsapp_webhook_processed(self, client, mock_db):
        """Test WhatsApp webhook with valid payload returns processed."""
        mock_db.get_building_by_phone = AsyncMock(return_value="building-123")
        with (
            patch("src.api.routes.webhooks._verify_whatsapp_signature"),
            patch("src.api.routes.webhooks.get_orchestrator") as mock_get_orch,
        ):
            mock_orch = MagicMock()
            mock_orch.run = AsyncMock(
                return_value={
                    "conversation_id": "conv-wa",
                    "response": {"message": "Thanks for your message."},
                    "metadata": {},
                }
            )
            mock_get_orch.return_value = mock_orch
            payload = {
                "entry": [
                    {
                        "changes": [
                            {
                                "value": {
                                    "messages": [
                                        {
                                            "from": "972501234567",
                                            "type": "text",
                                            "text": {"body": "Hello"},
                                        }
                                    ],
                                },
                            }
                        ],
                    }
                ],
            }
            response = client.post("/api/v1/webhooks/whatsapp", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processed"

    def test_whatsapp_webhook_ignored_no_message(self, client):
        """Test WhatsApp webhook with no message body returns ignored."""
        payload = {"entry": [{"changes": [{"value": {"messages": []}}]}]}
        with patch("src.api.routes.webhooks._verify_whatsapp_signature"):
            response = client.post("/api/v1/webhooks/whatsapp", json=payload)
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_whatsapp_webhook_invalid_payload(self, client):
        """Test WhatsApp webhook with invalid payload returns ignored or error."""
        with patch("src.api.routes.webhooks._verify_whatsapp_signature"):
            response = client.post("/api/v1/webhooks/whatsapp", json={})
        assert response.status_code == 200
        assert response.json()["status"] in ("ignored", "error")


class TestGlobalExceptionHandler:
    """Tests for global exception handler — connection errors return 503."""

    def test_connection_error_errno_99_returns_503(self):
        """OSError errno 99 (EADDRNOTAVAIL) should return 503, not 500."""
        import errno as errno_module

        err = OSError()
        err.errno = errno_module.EADDRNOTAVAIL  # portable (49 on macOS, 99 on Linux)
        redis_mock = AsyncMock()
        redis_mock.check_ip_rate_limit = AsyncMock(return_value=True)
        with TestClient(app, raise_server_exceptions=False) as c:
            with patch("src.api.routes.auth.get_redis_client", return_value=redis_mock):
                with patch("src.api.routes.auth.get_postgres_client") as mock_get_db:
                    db_mock = AsyncMock()
                    db_mock.get_user_by_email = AsyncMock(side_effect=err)
                    mock_get_db.return_value = db_mock
                    response = c.post(
                        "/api/v1/auth/login/json",
                        json={"email": "test@example.com", "password": "test123"},
                    )
        assert response.status_code == 503
        assert "unavailable" in response.json().get("detail", "").lower()

    def test_connection_error_errno_111_returns_503(self):
        """OSError errno 111 (ECONNREFUSED) should return 503."""
        import errno as errno_module

        err = OSError()
        err.errno = errno_module.ECONNREFUSED  # portable (61 on macOS, 111 on Linux)
        redis_mock = AsyncMock()
        redis_mock.check_ip_rate_limit = AsyncMock(return_value=True)
        with TestClient(app, raise_server_exceptions=False) as c:
            with patch("src.api.routes.auth.get_redis_client", return_value=redis_mock):
                with patch("src.api.routes.auth.get_postgres_client") as mock_get_db:
                    db_mock = AsyncMock()
                    db_mock.get_user_by_email = AsyncMock(side_effect=err)
                    mock_get_db.return_value = db_mock
                    response = c.post(
                        "/api/v1/auth/login/json",
                        json={"email": "test@example.com", "password": "test123"},
                    )
        assert response.status_code == 503

    def test_gaierror_returns_503(self):
        """socket.gaierror (DNS resolution failure) should return 503."""
        import socket as socket_module

        err = socket_module.gaierror(-2, "Name or service not known")
        redis_mock = AsyncMock()
        redis_mock.check_ip_rate_limit = AsyncMock(return_value=True)
        with TestClient(app, raise_server_exceptions=False) as c:
            with patch("src.api.routes.auth.get_redis_client", return_value=redis_mock):
                with patch("src.api.routes.auth.get_postgres_client") as mock_get_db:
                    db_mock = AsyncMock()
                    db_mock.get_user_by_email = AsyncMock(side_effect=err)
                    mock_get_db.return_value = db_mock
                    response = c.post(
                        "/api/v1/auth/login/json",
                        json={"email": "test@example.com", "password": "test123"},
                    )
        assert response.status_code == 503
        assert "unavailable" in response.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Security regression: public signup must reject privileged roles
# ---------------------------------------------------------------------------


class TestSignupRoleRestriction:
    """HTTP-level regression tests for the signup privilege-escalation fix.

    A malicious client must NOT be able to supply role=admin,
    role=super_admin, or role=buildings_manager and get a privileged account.
    Both /signup and /register endpoints must enforce this.
    """

    _VALID_BASE = {
        "name": "New User",
        "email": "newuser@example.com",
        "phone": "0501234567",
        "password": "securepass12",
    }

    _VALID_REGISTER_BASE = {
        "email": "newuser@example.com",
        "full_name": "New User",
        "phone": "0501234567",
        "password": "securepass12",
    }

    # -- /signup allowed roles ------------------------------------------------

    @pytest.mark.parametrize("role", ["resident", "contractor"])
    def test_signup_allows_resident_and_contractor(self, client, mock_db, mock_redis, role):
        """Allowed roles must pass validation and reach the DB layer."""
        mock_db.get_user_by_email = AsyncMock(return_value=None)
        mock_db.get_user_by_phone = AsyncMock(return_value=None)

        class FakeUser:
            id = "user-new"
            email = "newuser@example.com"
            full_name = "New User"
            phone = "0501234567"
            is_active = True
            is_verified = False
            preferred_language = "he"
            avatar_url = None
            building_id = None
            contractor_id = None
            created_at = "2024-01-01T00:00:00Z"
            updated_at = "2024-01-01T00:00:00Z"
            last_login = None
            notification_settings = None

        FakeUser.role = role
        mock_db.create_user = AsyncMock(return_value=FakeUser())
        mock_redis.set = AsyncMock()

        response = client.post(
            "/api/v1/auth/signup",
            json={**self._VALID_BASE, "role": role},
        )
        # Must not be rejected by validation (422 = Unprocessable Entity)
        assert response.status_code != 422, f"Allowed role '{role}' was incorrectly rejected: {response.json()}"

    # -- /signup forbidden roles ----------------------------------------------

    @pytest.mark.parametrize(
        "privileged_role",
        ["admin", "super_admin", "buildings_manager"],
    )
    def test_signup_rejects_privileged_roles(self, client, mock_db, mock_redis, privileged_role):
        """Privilege-escalation via /signup must return HTTP 422."""
        response = client.post(
            "/api/v1/auth/signup",
            json={**self._VALID_BASE, "role": privileged_role},
        )
        assert response.status_code == 422, (
            f"Expected 422 for privileged role '{privileged_role}' but got {response.status_code}: {response.json()}"
        )

    def test_signup_rejects_admin(self, client, mock_db, mock_redis):
        """Explicit regression: role=admin must be HTTP 422."""
        response = client.post(
            "/api/v1/auth/signup",
            json={**self._VALID_BASE, "role": "admin"},
        )
        assert response.status_code == 422

    def test_signup_rejects_super_admin(self, client, mock_db, mock_redis):
        """Explicit regression: role=super_admin must be HTTP 422."""
        response = client.post(
            "/api/v1/auth/signup",
            json={**self._VALID_BASE, "role": "super_admin"},
        )
        assert response.status_code == 422

    def test_signup_rejects_buildings_manager(self, client, mock_db, mock_redis):
        """Explicit regression: role=buildings_manager must be HTTP 422."""
        response = client.post(
            "/api/v1/auth/signup",
            json={**self._VALID_BASE, "role": "buildings_manager"},
        )
        assert response.status_code == 422

    # -- /register forbidden roles --------------------------------------------

    @pytest.mark.parametrize(
        "privileged_role",
        ["admin", "super_admin", "buildings_manager"],
    )
    def test_register_rejects_privileged_roles(self, client, mock_db, mock_redis, privileged_role):
        """Privilege-escalation via /register must also return HTTP 422."""
        response = client.post(
            "/api/v1/auth/register",
            json={**self._VALID_REGISTER_BASE, "role": privileged_role},
        )
        assert response.status_code == 422, (
            f"Expected 422 for privileged role '{privileged_role}' on /register but got "
            f"{response.status_code}: {response.json()}"
        )
