"""Tests for API routes."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from src.api.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_db():
    """Mock PostgreSQL client."""
    with patch("src.databases.postgres.get_postgres_client") as mock:
        db = AsyncMock()
        mock.return_value = db
        yield db


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


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check_all_healthy(self, client):
        """Test health check when all services are healthy."""
        with patch("src.databases.vector_store.get_vector_store") as mock_vs, \
             patch("src.databases.graph_store.get_graph_store") as mock_gs, \
             patch("src.databases.redis_client.get_redis_client") as mock_redis, \
             patch("src.databases.postgres.get_postgres_client") as mock_db:

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
        with patch("src.databases.vector_store.get_vector_store") as mock_vs, \
             patch("src.databases.graph_store.get_graph_store") as mock_gs, \
             patch("src.databases.redis_client.get_redis_client") as mock_redis, \
             patch("src.databases.postgres.get_postgres_client") as mock_db:

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

    def test_send_message_success(self, client, mock_db):
        """Test successful message processing."""
        with patch("src.databases.redis_client.get_redis_client") as mock_redis, \
             patch("src.orchestration.graph.get_orchestrator") as mock_orch:

            mock_redis.return_value.check_rate_limit = AsyncMock(return_value=True)
            mock_orch.return_value.run = AsyncMock(return_value={
                "conversation_id": "conv-123",
                "response": {"message": "Hello!"},
                "metadata": {"agent": "support"},
            })
            mock_db.log_conversation = AsyncMock()

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

    def test_send_message_rate_limited(self, client, mock_db):
        """Test message rejected due to rate limiting."""
        with patch("src.databases.redis_client.get_redis_client") as mock_redis:
            mock_redis.return_value.check_rate_limit = AsyncMock(return_value=False)

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
        }

    def test_list_offers(self, client, mock_db, mock_offer):
        """Test listing offers."""
        mock_db.list_offers = AsyncMock(return_value=([mock_offer], 1))

        with patch("src.api.middleware.auth.get_current_user") as mock_auth:
            mock_auth.return_value = MagicMock(id="user-123", role="resident")

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
        mock_db.create_offer = AsyncMock(return_value=MagicMock(**mock_offer))

        with patch("src.api.middleware.auth.get_current_user") as mock_auth, \
             patch("src.rag.embeddings.get_embedding_client") as mock_embed, \
             patch("src.databases.vector_store.get_vector_store") as mock_vs:

            mock_auth.return_value = MagicMock(id="user-123", role="resident")
            mock_embed.return_value.embed_text = AsyncMock(return_value=[0.1] * 1536)
            mock_vs.return_value.upsert = AsyncMock()

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
            "description": "Professional AC installation and maintenance",
            "categories": ["ac_installation"],
            "regions": ["center", "tel_aviv"],
            "verification_status": "verified",
            "trust_score": 85.0,
            "average_rating": 4.5,
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

    def test_register_success(self, client, mock_db):
        """Test successful registration."""
        mock_db.get_user_by_email = AsyncMock(return_value=None)
        mock_db.get_user_by_phone = AsyncMock(return_value=None)
        mock_db.create_user = AsyncMock(return_value=MagicMock(
            id="user-123",
            email="test@example.com",
            full_name="Test User",
            phone="0501234567",
            role="resident",
            is_active=True,
            is_verified=False,
        ))

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

    def test_register_email_exists(self, client, mock_db):
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

    def test_login_success(self, client, mock_db):
        """Test successful login."""
        mock_db.get_user_by_email = AsyncMock(return_value=MagicMock(
            id="user-123",
            email="test@example.com",
            role="resident",
            is_active=True,
        ))

        with patch("src.api.middleware.auth.verify_password") as mock_verify:
            mock_verify.return_value = True
            mock_db.get_user_password_hash = AsyncMock(return_value="hashed")
            mock_db.update_user = AsyncMock()

            with patch("src.databases.redis_client.get_redis_client") as mock_redis:
                mock_redis.return_value.set = AsyncMock()

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

    def test_login_invalid_credentials(self, client, mock_db):
        """Test login with invalid credentials."""
        mock_db.get_user_by_email = AsyncMock(return_value=None)

        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "test@example.com",
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401

    def test_login_json_success(self, client, mock_db):
        """Test successful login with JSON body (web app uses this)."""
        mock_db.get_user_by_email = AsyncMock(return_value=MagicMock(
            id="user-123",
            email="test@example.com",
            role="resident",
            is_active=True,
        ))
        with patch("src.api.middleware.auth.verify_password") as mock_verify:
            mock_verify.return_value = True
            mock_db.get_user_password_hash = AsyncMock(return_value="hashed")
            mock_db.update_user = AsyncMock()
            with patch("src.databases.redis_client.get_redis_client") as mock_redis:
                mock_redis.return_value.set = AsyncMock()

                response = client.post(
                    "/api/v1/auth/login/json",
                    json={
                        "email": "test@example.com",
                        "password": "password123",
                    },
                )

                assert response.status_code == 200
                data = response.json()
                assert "access_token" in data
                assert data.get("expires_in") is not None


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
        }

    def test_list_escalations_admin(self, client, mock_db, mock_escalation):
        """Test listing escalations as admin."""
        mock_db.list_escalations = AsyncMock(return_value=([mock_escalation], 1))

        with patch("src.api.middleware.auth.get_current_user") as mock_auth:
            mock_auth.return_value = MagicMock(id="admin-123", role="admin")

            response = client.get(
                "/api/v1/escalations",
                headers={"Authorization": "Bearer test-token"},
            )

            assert response.status_code == 200

    def test_list_escalations_non_admin(self, client, mock_db):
        """Test listing escalations as non-admin (should fail)."""
        with patch("src.api.middleware.auth.get_current_user") as mock_auth:
            mock_auth.return_value = MagicMock(id="user-123", role="resident")

            response = client.get(
                "/api/v1/escalations",
                headers={"Authorization": "Bearer test-token"},
            )

            assert response.status_code == 403

    def test_resolve_escalation(self, client, mock_db, mock_escalation):
        """Test resolving an escalation."""
        mock_db.get_escalation = AsyncMock(return_value=mock_escalation)
        mock_db.update_escalation = AsyncMock(return_value={
            **mock_escalation,
            "status": "resolved",
        })

        with patch("src.api.middleware.auth.get_current_user") as mock_auth:
            mock_auth.return_value = MagicMock(id="admin-123", role="admin")

            response = client.post(
                "/api/v1/escalations/esc-123/resolve",
                params={"resolution_notes": "Issue resolved"},
                headers={"Authorization": "Bearer test-token"},
            )

            assert response.status_code == 200
