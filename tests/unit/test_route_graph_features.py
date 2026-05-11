"""Unit tests for /api/v1/graph route (graph_features)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    role: UserRole = UserRole.RESIDENT,
    user_id: str = "user-1",
    building_id: str | None = "building-1",
) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id=user_id,
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        is_active=True,
        is_verified=True,
        preferred_language="he",
        building_id=building_id,
        created_at=now,
        updated_at=now,
    )


def _make_admin(user_id: str = "admin-1") -> UserInDB:
    return _make_user(role=UserRole.ADMIN, user_id=user_id)


def _make_graph() -> MagicMock:
    """Return a mock graph store with sensible defaults."""
    graph = MagicMock()
    graph.get_viral_invite_chain = AsyncMock(return_value={"nodes": [], "edges": []})
    graph.get_invite_momentum_for_offer = AsyncMock(return_value={"momentum": 0.5})
    graph.record_invite_event = AsyncMock(return_value=None)
    graph.get_building_similarity_clusters = AsyncMock(return_value=[])
    graph.get_resident_influence_score = AsyncMock(return_value={"score": 42.0})
    graph.get_top_influencers_by_city = AsyncMock(return_value=[])
    return graph


# ---------------------------------------------------------------------------
# Feature 1a: GET /offers/{offer_id}/invite-chain
# ---------------------------------------------------------------------------


def test_get_invite_chain_happy_path():
    user = _make_user()
    graph = _make_graph()
    chain_data = {"nodes": ["u1", "u2"], "edges": [{"from": "u1", "to": "u2"}]}
    momentum_data = {"momentum": 0.9, "trend": "rising"}
    graph.get_viral_invite_chain = AsyncMock(return_value=chain_data)
    graph.get_invite_momentum_for_offer = AsyncMock(return_value=momentum_data)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/offers/offer-123/invite-chain?max_depth=3")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["chain"] == chain_data
    assert data["momentum"] == momentum_data
    graph.get_viral_invite_chain.assert_called_once_with(
        offer_id="offer-123",
        resident_id=user.id,
        max_depth=3,
    )
    graph.get_invite_momentum_for_offer.assert_called_once_with(
        offer_id="offer-123",
        building_id="building-1",
    )


def test_get_invite_chain_default_max_depth():
    """Default max_depth=4 is applied when not specified."""
    user = _make_user()
    graph = _make_graph()

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/offers/offer-99/invite-chain")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    graph.get_viral_invite_chain.assert_called_once_with(
        offer_id="offer-99",
        resident_id=user.id,
        max_depth=4,
    )


def test_get_invite_chain_no_building_id():
    """User with no building_id uses empty string for momentum call."""
    user = _make_user(building_id=None)
    graph = _make_graph()

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/offers/offer-1/invite-chain")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    graph.get_invite_momentum_for_offer.assert_called_once_with(
        offer_id="offer-1",
        building_id="",
    )


def test_get_invite_chain_graph_exception_returns_500():
    """Graph exception → HTTP 500."""
    user = _make_user()
    graph = _make_graph()
    graph.get_viral_invite_chain = AsyncMock(side_effect=RuntimeError("neo4j down"))

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/offers/offer-1/invite-chain")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "invite chain" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Feature 1b: POST /offers/{offer_id}/record-invite
# ---------------------------------------------------------------------------


def test_record_invite_happy_path():
    user = _make_user()
    graph = _make_graph()
    mock_db = MagicMock()
    mock_db.get_user_by_phone = AsyncMock(return_value={"id": "invitee-99", "phone": "0501111111"})
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=True)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with (
            patch("src.api.routes.graph_features.get_graph_store", return_value=graph),
            # get_postgres_client is imported inside the function body, so patch at the source
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.graph_features.get_redis_client", return_value=mock_redis),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post(
                "/api/v1/graph/offers/offer-42/record-invite",
                json={"invitee_phone": "0501111111", "channel": "whatsapp"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert "invite_token" in data
    assert "invite_link" in data
    assert "offer-42" in data["invite_link"]
    graph.record_invite_event.assert_called_once_with(
        inviter_id=user.id,
        invitee_id="invitee-99",
        offer_id="offer-42",
        channel="whatsapp",
    )


def test_record_invite_invitee_not_found_returns_404():
    """Unregistered phone → 404."""
    user = _make_user()
    graph = _make_graph()
    mock_db = MagicMock()
    mock_db.get_user_by_phone = AsyncMock(return_value=None)
    mock_redis = MagicMock()

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with (
            patch("src.api.routes.graph_features.get_graph_store", return_value=graph),
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.graph_features.get_redis_client", return_value=mock_redis),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post(
                "/api/v1/graph/offers/offer-42/record-invite",
                json={"invitee_phone": "0509999999"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_record_invite_graph_exception_returns_500():
    """Graph.record_invite_event raises → 500."""
    user = _make_user()
    graph = _make_graph()
    graph.record_invite_event = AsyncMock(side_effect=RuntimeError("graph write failed"))
    mock_db = MagicMock()
    mock_db.get_user_by_phone = AsyncMock(return_value={"id": "invitee-1"})
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=True)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with (
            patch("src.api.routes.graph_features.get_graph_store", return_value=graph),
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.graph_features.get_redis_client", return_value=mock_redis),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.post(
                "/api/v1/graph/offers/offer-42/record-invite",
                json={"invitee_phone": "0501234567"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "invite" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Feature 2: GET /buildings/{building_id}/similar
# ---------------------------------------------------------------------------


def test_get_similar_buildings_happy_path():
    user = _make_user()
    graph = _make_graph()
    clusters = [
        {"building_id": "b2", "similarity": 0.95},
        {"building_id": "b3", "similarity": 0.88},
    ]
    graph.get_building_similarity_clusters = AsyncMock(return_value=clusters)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/buildings/building-1/similar?category=ac&limit=10")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["building_id"] == "building-1"
    assert data["total"] == 2
    assert len(data["similar_buildings"]) == 2
    graph.get_building_similarity_clusters.assert_called_once_with(
        building_id="building-1",
        category="ac",
        limit=10,
    )


def test_get_similar_buildings_no_category():
    """category is optional — None passed through."""
    user = _make_user()
    graph = _make_graph()
    graph.get_building_similarity_clusters = AsyncMock(return_value=[])

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/buildings/building-1/similar")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    graph.get_building_similarity_clusters.assert_called_once_with(
        building_id="building-1",
        category=None,
        limit=20,
    )


def test_get_similar_buildings_graph_exception_returns_500():
    user = _make_user()
    graph = _make_graph()
    graph.get_building_similarity_clusters = AsyncMock(side_effect=RuntimeError("graph error"))

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/buildings/building-1/similar")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "similar buildings" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Feature 3: GET /residents/{resident_id}/influence-score
# ---------------------------------------------------------------------------


def test_get_influence_score_own_user():
    """Resident accessing their own score — allowed."""
    user = _make_user(user_id="user-1")
    graph = _make_graph()
    score = {"resident_id": "user-1", "score": 88.5, "components": {}}
    graph.get_resident_influence_score = AsyncMock(return_value=score)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/residents/user-1/influence-score")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["score"] == 88.5


def test_get_influence_score_admin_can_view_any():
    """Admin may view any resident's score."""
    admin = _make_admin(user_id="admin-1")
    graph = _make_graph()
    score = {"resident_id": "other-user", "score": 55.0}
    graph.get_resident_influence_score = AsyncMock(return_value=score)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/residents/other-user/influence-score")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["score"] == 55.0


def test_get_influence_score_other_resident_forbidden():
    """Resident trying to view another resident's score → 403."""
    user = _make_user(user_id="user-1")
    graph = _make_graph()

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/residents/other-user-999/influence-score")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert "denied" in response.json()["detail"].lower()


def test_get_influence_score_not_in_graph_returns_404():
    """Graph returns None → 404."""
    user = _make_user(user_id="user-1")
    graph = _make_graph()
    graph.get_resident_influence_score = AsyncMock(return_value=None)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/residents/user-1/influence-score")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_get_influence_score_graph_exception_returns_500():
    user = _make_user(user_id="user-1")
    graph = _make_graph()
    graph.get_resident_influence_score = AsyncMock(side_effect=RuntimeError("connection failed"))

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/residents/user-1/influence-score")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "influence score" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Feature 4: GET /cities/{city}/top-influencers
# ---------------------------------------------------------------------------


def test_get_top_influencers_admin_happy_path():
    admin = _make_admin()
    graph = _make_graph()
    influencers = [
        {"resident_id": "u1", "score": 99.0},
        {"resident_id": "u2", "score": 87.5},
    ]
    graph.get_top_influencers_by_city = AsyncMock(return_value=influencers)

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/cities/tel-aviv/top-influencers?top_n=5&min_score=10.0")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["city"] == "tel-aviv"
    assert data["total"] == 2
    assert len(data["influencers"]) == 2
    graph.get_top_influencers_by_city.assert_called_once_with(
        city="tel-aviv",
        top_n=5,
        min_score=10.0,
    )


def test_get_top_influencers_resident_forbidden():
    """Non-admin → 403."""
    user = _make_user()
    graph = _make_graph()

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/cities/tel-aviv/top-influencers")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert "admin" in response.json()["detail"].lower()


def test_get_top_influencers_contractor_forbidden():
    """Contractor (non-admin) → 403."""
    user = _make_user(role=UserRole.CONTRACTOR)
    graph = _make_graph()

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/cities/haifa/top-influencers")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_get_top_influencers_super_admin_allowed():
    """super_admin is also admin — allowed."""
    admin = _make_user(role=UserRole.SUPER_ADMIN, user_id="superadmin-1")
    graph = _make_graph()
    graph.get_top_influencers_by_city = AsyncMock(return_value=[{"resident_id": "u1", "score": 77.0}])

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/cities/haifa/top-influencers")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_get_top_influencers_graph_exception_returns_500():
    admin = _make_admin()
    graph = _make_graph()
    graph.get_top_influencers_by_city = AsyncMock(side_effect=RuntimeError("graph error"))

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/cities/jerusalem/top-influencers")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "influencer" in response.json()["detail"].lower()


def test_get_top_influencers_empty_city():
    """Admin query with no results → total 0."""
    admin = _make_admin()
    graph = _make_graph()
    graph.get_top_influencers_by_city = AsyncMock(return_value=[])

    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        with patch("src.api.routes.graph_features.get_graph_store", return_value=graph):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/api/v1/graph/cities/unknown-city/top-influencers")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["city"] == "unknown-city"
    assert data["total"] == 0
    assert data["influencers"] == []
