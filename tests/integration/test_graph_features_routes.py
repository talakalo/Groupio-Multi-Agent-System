"""Integration tests for /api/v1/graph/* endpoints (Features 1-3)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role: str = "resident", building_id: str = "b1") -> MagicMock:
    u = MagicMock()
    u.id = "user-1"
    u.email = "test@test.com"
    u.role = role
    u.is_active = True
    u.building_id = building_id
    u.phone = "0501234567"
    return u


def _override_auth(user: MagicMock):
    async def _dep():
        return user

    app.dependency_overrides[get_current_user] = _dep


def _clear_overrides():
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    _clear_overrides()


@pytest.fixture
def resident(client):
    u = _make_user(role="resident")
    _override_auth(u)
    return u


@pytest.fixture
def admin(client):
    u = _make_user(role="admin")
    _override_auth(u)
    return u


# ---------------------------------------------------------------------------
# GET /graph/offers/{offer_id}/invite-chain
# ---------------------------------------------------------------------------


class TestInviteChainEndpoint:
    def test_returns_chain_and_momentum(self, client, resident):
        chain_data = {
            "root_id": "user-1",
            "chain_nodes": [{"id": "r2", "first_name": "Yael", "converted": True}],
            "total_invites": 1,
            "conversions": 1,
            "depth": 4,
        }
        momentum_data = {
            "building_residents": 20,
            "joined_count": 5,
            "total_invites": 8,
            "converted_invites": 5,
        }
        with (
            patch("src.api.routes.graph_features.get_graph_store") as mock_graph,
        ):
            graph = AsyncMock()
            graph.get_viral_invite_chain = AsyncMock(return_value=chain_data)
            graph.get_invite_momentum_for_offer = AsyncMock(return_value=momentum_data)
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/offers/o1/invite-chain")

        assert resp.status_code == 200
        body = resp.json()
        assert body["chain"]["total_invites"] == 1
        assert body["momentum"]["joined_count"] == 5

    def test_graph_error_returns_500(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_viral_invite_chain = AsyncMock(side_effect=Exception("neo4j down"))
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/offers/o1/invite-chain")

        assert resp.status_code == 500

    def test_requires_auth(self, client):
        _clear_overrides()
        resp = client.get("/api/v1/graph/offers/o1/invite-chain")
        assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# POST /graph/offers/{offer_id}/record-invite
# ---------------------------------------------------------------------------


class TestRecordInviteEndpoint:
    def test_returns_invite_token_and_link(self, client, resident):
        with (
            patch("src.api.routes.graph_features.get_graph_store") as mock_graph,
            patch("src.api.routes.graph_features.get_redis_client") as mock_redis,
        ):
            mock_db = AsyncMock()
            mock_db.get_user_by_phone = AsyncMock(return_value={"id": "r2"})
            graph = AsyncMock()
            graph.record_invite_event = AsyncMock(return_value={"inviter_id": "user-1"})
            redis = AsyncMock()
            redis.set = AsyncMock()
            mock_graph.return_value = graph
            mock_redis.return_value = redis

            with patch(
                "src.api.routes.graph_features.get_postgres_client",
                return_value=mock_db,
            ):
                resp = client.post(
                    "/api/v1/graph/offers/o1/record-invite",
                    json={"invitee_phone": "0501234567", "channel": "whatsapp"},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert "invite_token" in body
        assert "invite_link" in body
        assert "o1" in body["invite_link"]

    def test_invitee_not_found_returns_404(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store"):
            with patch("src.api.routes.graph_features.get_postgres_client") as mock_db_factory:
                mock_db = AsyncMock()
                mock_db.get_user_by_phone = AsyncMock(return_value=None)
                mock_db_factory.return_value = mock_db

                resp = client.post(
                    "/api/v1/graph/offers/o1/record-invite",
                    json={"invitee_phone": "0509999999"},
                )

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /graph/buildings/{building_id}/similar
# ---------------------------------------------------------------------------


class TestSimilarBuildingsEndpoint:
    def test_returns_clusters(self, client, resident):
        clusters = [
            {
                "building_id": "b2",
                "address": "Allenby 5",
                "region": "tel_aviv",
                "similarity_score": 0.82,
                "category": "ac_installation",
                "offers_joined": 2,
                "residents_joined": 8,
            }
        ]
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_building_similarity_clusters = AsyncMock(return_value=clusters)
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/buildings/b1/similar")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["similar_buildings"][0]["building_id"] == "b2"

    def test_category_filter_forwarded(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_building_similarity_clusters = AsyncMock(return_value=[])
            mock_graph.return_value = graph

            client.get("/api/v1/graph/buildings/b1/similar?category=plumbing")

            call_kwargs = graph.get_building_similarity_clusters.call_args
            assert call_kwargs.kwargs.get("category") == "plumbing"

    def test_graph_error_returns_500(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_building_similarity_clusters = AsyncMock(side_effect=Exception("timeout"))
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/buildings/b1/similar")

        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# GET /graph/residents/{resident_id}/influence-score
# ---------------------------------------------------------------------------


class TestInfluenceScoreEndpoint:
    def test_resident_can_view_own_score(self, client, resident):
        score = {
            "resident_id": "user-1",
            "invites_sent": 6,
            "conversions": 3,
            "conversion_rate": 0.5,
            "reviews_written": 2,
            "total_upvotes": 4,
            "influence_score": 11.0,
        }
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_resident_influence_score = AsyncMock(return_value=score)
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/residents/user-1/influence-score")

        assert resp.status_code == 200
        assert resp.json()["influence_score"] == pytest.approx(11.0)

    def test_resident_cannot_view_other_score(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store"):
            resp = client.get("/api/v1/graph/residents/other-user/influence-score")

        assert resp.status_code == 403

    def test_admin_can_view_any_score(self, client, admin):
        score = {"resident_id": "other", "influence_score": 5.0}
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_resident_influence_score = AsyncMock(return_value=score)
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/residents/other/influence-score")

        assert resp.status_code == 200

    def test_resident_not_in_graph_returns_404(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_resident_influence_score = AsyncMock(return_value={})
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/residents/user-1/influence-score")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /graph/cities/{city}/top-influencers
# ---------------------------------------------------------------------------


class TestTopInfluencersEndpoint:
    def test_admin_gets_influencer_list(self, client, admin):
        influencers = [
            {
                "resident_id": "r1",
                "name": "Yael",
                "city": "Tel Aviv",
                "total_score": 42.0,
                "total_invites": 10,
                "total_conversions": 7,
            },
        ]
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_top_influencers_by_city = AsyncMock(return_value=influencers)
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/cities/Tel Aviv/top-influencers")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["influencers"][0]["resident_id"] == "r1"

    def test_resident_gets_403(self, client, resident):
        with patch("src.api.routes.graph_features.get_graph_store"):
            resp = client.get("/api/v1/graph/cities/Tel Aviv/top-influencers")

        assert resp.status_code == 403

    def test_query_params_forwarded(self, client, admin):
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_top_influencers_by_city = AsyncMock(return_value=[])
            mock_graph.return_value = graph

            client.get("/api/v1/graph/cities/Haifa/top-influencers?top_n=5&min_score=10.0")

            call_kwargs = graph.get_top_influencers_by_city.call_args
            assert call_kwargs.kwargs.get("top_n") == 5
            assert call_kwargs.kwargs.get("min_score") == pytest.approx(10.0)

    def test_graph_error_returns_500(self, client, admin):
        with patch("src.api.routes.graph_features.get_graph_store") as mock_graph:
            graph = AsyncMock()
            graph.get_top_influencers_by_city = AsyncMock(side_effect=Exception("db error"))
            mock_graph.return_value = graph

            resp = client.get("/api/v1/graph/cities/Haifa/top-influencers")

        assert resp.status_code == 500
