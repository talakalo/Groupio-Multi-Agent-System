"""Unit tests for viral invite chain, building similarity, and influence score
GraphStore methods (Features 1-3).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.databases.graph_store import GraphStore

# ---------------------------------------------------------------------------
# Shared fixture
# ---------------------------------------------------------------------------


def _make_session(rows: list[dict]):
    """Return a mock Neo4j session whose run() yields *rows*."""
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=rows)
    session_mock = AsyncMock()
    session_mock.run = AsyncMock(return_value=result_mock)
    return session_mock


@pytest.fixture
def store():
    """GraphStore backed by a mock Neo4j driver."""
    mock_settings = MagicMock()
    mock_settings.NEO4J_URI = "bolt://localhost:7687"
    mock_settings.NEO4J_USER = "neo4j"
    mock_settings.NEO4J_PASSWORD = "test"

    with patch("src.databases.graph_store.get_settings", return_value=mock_settings):
        with patch("src.databases.graph_store.AsyncGraphDatabase") as mock_gdb:
            driver = AsyncMock()
            mock_gdb.driver.return_value = driver
            s = GraphStore()
            s._driver = driver
    return s


def _wire_session(store: GraphStore, rows: list[dict]):
    """Configure the driver's session to return *rows* on next execute()."""
    session_mock = _make_session(rows)
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=session_mock)
    ctx.__aexit__ = AsyncMock(return_value=False)
    store._driver.session = MagicMock(return_value=ctx)
    return session_mock


# ===========================================================================
# Feature 1 — Viral Invite Chain
# ===========================================================================


class TestRecordInviteEvent:
    @pytest.mark.asyncio
    async def test_record_returns_invite_dict(self, store):
        """record_invite_event returns the created INVITED edge properties."""
        row = {
            "invite": {
                "inviter_id": "r1",
                "invitee_id": "r2",
                "offer_id": "o1",
                "channel": "whatsapp",
                "converted": False,
            }
        }
        _wire_session(store, [row])

        result = await store.record_invite_event(inviter_id="r1", invitee_id="r2", offer_id="o1")

        assert result["inviter_id"] == "r1"
        assert result["invitee_id"] == "r2"
        assert result["converted"] is False

    @pytest.mark.asyncio
    async def test_record_returns_empty_when_no_match(self, store):
        """record_invite_event returns {} when nodes don't exist in graph."""
        _wire_session(store, [])
        result = await store.record_invite_event("r1", "r2", "o1")
        assert result == {}

    @pytest.mark.asyncio
    async def test_record_custom_channel(self, store):
        """Channel parameter is forwarded correctly."""
        row = {
            "invite": {"channel": "qr", "inviter_id": "r1", "invitee_id": "r2", "offer_id": "o1", "converted": False}
        }
        session = _wire_session(store, [row])
        result = await store.record_invite_event("r1", "r2", "o1", channel="qr")
        assert result["channel"] == "qr"
        # Verify the Cypher was called with correct params
        call_kwargs = session.run.call_args
        assert call_kwargs[0][1]["channel"] == "qr"


class TestMarkInviteConverted:
    @pytest.mark.asyncio
    async def test_mark_converted_executes_set(self, store):
        """mark_invite_converted calls execute without raising."""
        session = _wire_session(store, [])
        await store.mark_invite_converted(invitee_id="r2", offer_id="o1")
        session.run.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_mark_converted_passes_correct_params(self, store):
        session = _wire_session(store, [])
        await store.mark_invite_converted("invitee-99", "offer-42")
        params = session.run.call_args[0][1]
        assert params["invitee_id"] == "invitee-99"
        assert params["offer_id"] == "offer-42"


class TestGetViralInviteChain:
    @pytest.mark.asyncio
    async def test_chain_with_no_invites(self, store):
        """Empty chain returns zeroed counters."""
        row = {
            "chain": {
                "root_id": "r1",
                "chain_nodes": [],
                "total_invites": 0,
                "conversions": 0,
                "depth": 4,
            }
        }
        _wire_session(store, [row])
        result = await store.get_viral_invite_chain("o1", "r1")
        assert result["total_invites"] == 0
        assert result["conversions"] == 0
        assert result["chain_nodes"] == []

    @pytest.mark.asyncio
    async def test_chain_single_hop(self, store):
        """Single-hop invite chain is returned correctly."""
        row = {
            "chain": {
                "root_id": "r1",
                "chain_nodes": [{"id": "r2", "first_name": "Yael", "converted": True}],
                "total_invites": 1,
                "conversions": 1,
                "depth": 4,
            }
        }
        _wire_session(store, [row])
        result = await store.get_viral_invite_chain("o1", "r1")
        assert result["total_invites"] == 1
        assert result["conversions"] == 1
        assert result["chain_nodes"][0]["first_name"] == "Yael"

    @pytest.mark.asyncio
    async def test_chain_fallback_when_empty_results(self, store):
        """Returns safe default dict when graph returns no records."""
        _wire_session(store, [])
        result = await store.get_viral_invite_chain("o1", "r1", max_depth=3)
        assert result["root_id"] == "r1"
        assert result["total_invites"] == 0
        assert result["depth"] == 3

    @pytest.mark.asyncio
    async def test_chain_max_depth_forwarded(self, store):
        row = {"chain": {"root_id": "r1", "chain_nodes": [], "total_invites": 0, "conversions": 0, "depth": 2}}
        session = _wire_session(store, [row])
        await store.get_viral_invite_chain("o1", "r1", max_depth=2)
        params = session.run.call_args[0][1]
        assert params["max_depth"] == 2


class TestGetInviteMomentum:
    @pytest.mark.asyncio
    async def test_momentum_returns_stats(self, store):
        row = {
            "momentum": {
                "building_residents": 20,
                "joined_count": 5,
                "total_invites": 8,
                "converted_invites": 5,
            }
        }
        _wire_session(store, [row])
        result = await store.get_invite_momentum_for_offer("o1", "b1")
        assert result["joined_count"] == 5
        assert result["total_invites"] == 8

    @pytest.mark.asyncio
    async def test_momentum_fallback_when_empty(self, store):
        _wire_session(store, [])
        result = await store.get_invite_momentum_for_offer("o1", "b1")
        assert result == {
            "building_residents": 0,
            "joined_count": 0,
            "total_invites": 0,
            "converted_invites": 0,
        }


# ===========================================================================
# Feature 2 — Building Similarity Clusters
# ===========================================================================


class TestComputeSimilarityEdges:
    @pytest.mark.asyncio
    async def test_returns_edge_count(self, store):
        _wire_session(store, [{"edges_written": 42}])
        count = await store.compute_and_store_similarity_edges()
        assert count == 42

    @pytest.mark.asyncio
    async def test_returns_zero_on_empty(self, store):
        _wire_session(store, [])
        count = await store.compute_and_store_similarity_edges()
        assert count == 0

    @pytest.mark.asyncio
    async def test_region_param_forwarded(self, store):
        session = _wire_session(store, [{"edges_written": 10}])
        await store.compute_and_store_similarity_edges(region="tel_aviv")
        params = session.run.call_args[0][1]
        assert params.get("region") == "tel_aviv"

    @pytest.mark.asyncio
    async def test_no_region_no_param(self, store):
        session = _wire_session(store, [{"edges_written": 5}])
        await store.compute_and_store_similarity_edges()
        params = session.run.call_args[0][1]
        assert "region" not in params


class TestGetBuildingSimilarityClusters:
    @pytest.mark.asyncio
    async def test_returns_clusters_from_materialised_edges(self, store):
        rows = [
            {
                "cluster": {
                    "building_id": "b2",
                    "address": "Allenby 5",
                    "region": "tel_aviv",
                    "similarity_score": 0.85,
                    "category": "ac_installation",
                    "offers_joined": 3,
                    "residents_joined": 12,
                }
            }
        ]
        _wire_session(store, rows)
        result = await store.get_building_similarity_clusters("b1")
        assert len(result) == 1
        assert result[0]["building_id"] == "b2"
        assert result[0]["similarity_score"] == 0.85

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_data(self, store):
        # Both queries return empty (primary, then fallback)
        session_mock = _make_session([])
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=session_mock)
        ctx.__aexit__ = AsyncMock(return_value=False)
        store._driver.session = MagicMock(return_value=ctx)
        result = await store.get_building_similarity_clusters("b1")
        assert result == []

    @pytest.mark.asyncio
    async def test_category_filter_passed(self, store):
        session = _wire_session(store, [])
        await store.get_building_similarity_clusters("b1", category="plumbing")
        params = session.run.call_args[0][1]
        assert params.get("category") == "plumbing"

    @pytest.mark.asyncio
    async def test_limit_passed(self, store):
        session = _wire_session(store, [])
        await store.get_building_similarity_clusters("b1", limit=5)
        params = session.run.call_args[0][1]
        assert params.get("limit") == 5


# ===========================================================================
# Feature 3 — Resident Influence Score
# ===========================================================================


class TestGetResidentInfluenceScore:
    @pytest.mark.asyncio
    async def test_returns_score_components(self, store):
        row = {
            "score": {
                "resident_id": "r1",
                "invites_sent": 6,
                "conversions": 3,
                "conversion_rate": 0.5,
                "reviews_written": 2,
                "total_upvotes": 4,
                "influence_score": 11.0,
            }
        }
        _wire_session(store, [row])
        result = await store.get_resident_influence_score("r1")
        assert result["invites_sent"] == 6
        assert result["conversions"] == 3
        assert result["conversion_rate"] == pytest.approx(0.5)
        assert result["influence_score"] == pytest.approx(11.0)

    @pytest.mark.asyncio
    async def test_zero_invites_returns_zero_score(self, store):
        row = {
            "score": {
                "resident_id": "r1",
                "invites_sent": 0,
                "conversions": 0,
                "conversion_rate": 0.0,
                "reviews_written": 0,
                "total_upvotes": 0,
                "influence_score": 0.0,
            }
        }
        _wire_session(store, [row])
        result = await store.get_resident_influence_score("r1")
        assert result["influence_score"] == pytest.approx(0.0)

    @pytest.mark.asyncio
    async def test_returns_empty_when_not_found(self, store):
        _wire_session(store, [])
        result = await store.get_resident_influence_score("nonexistent")
        assert result == {}


class TestGetTopInfluencersByCity:
    @pytest.mark.asyncio
    async def test_returns_ranked_list(self, store):
        rows = [
            {
                "influencer": {
                    "resident_id": "r1",
                    "name": "Yael",
                    "city": "Tel Aviv",
                    "total_score": 42.0,
                    "total_invites": 10,
                    "total_conversions": 7,
                }
            },
            {
                "influencer": {
                    "resident_id": "r2",
                    "name": "Dan",
                    "city": "Tel Aviv",
                    "total_score": 18.5,
                    "total_invites": 5,
                    "total_conversions": 3,
                }
            },
        ]
        _wire_session(store, rows)
        result = await store.get_top_influencers_by_city("Tel Aviv", top_n=2)
        assert len(result) == 2
        assert result[0]["resident_id"] == "r1"
        assert result[1]["total_score"] == pytest.approx(18.5)

    @pytest.mark.asyncio
    async def test_returns_empty_for_city_with_no_data(self, store):
        _wire_session(store, [])
        result = await store.get_top_influencers_by_city("NoCity")
        assert result == []

    @pytest.mark.asyncio
    async def test_min_score_and_top_n_forwarded(self, store):
        session = _wire_session(store, [])
        await store.get_top_influencers_by_city("Haifa", top_n=5, min_score=10.0)
        params = session.run.call_args[0][1]
        assert params["top_n"] == 5
        assert params["min_score"] == pytest.approx(10.0)


class TestRefreshInfluenceScores:
    @pytest.mark.asyncio
    async def test_returns_edge_count(self, store):
        _wire_session(store, [{"edges_written": 37}])
        count = await store.refresh_influence_scores_for_city("Tel Aviv")
        assert count == 37

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_residents(self, store):
        _wire_session(store, [])
        count = await store.refresh_influence_scores_for_city("EmptyCity")
        assert count == 0

    @pytest.mark.asyncio
    async def test_city_param_forwarded(self, store):
        session = _wire_session(store, [{"edges_written": 1}])
        await store.refresh_influence_scores_for_city("Haifa")
        params = session.run.call_args[0][1]
        assert params["city"] == "Haifa"
