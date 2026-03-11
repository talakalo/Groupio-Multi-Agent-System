"""End-to-end tests for viral invite chain, building similarity, and
influencer scoring flows through the full LangGraph orchestrator.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def llm_mock():
    """LLM client that returns deterministic structured + plain outputs."""
    llm = AsyncMock()
    llm.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "Test LLM response"}],
            "model": "claude-sonnet-4-6",
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )
    llm.create_structured_output = AsyncMock(
        return_value={
            "intent": "viral_invite_query",
            "entities": {"offer_id": "offer-42"},
            "confidence": 0.95,
            "clarifying_question": None,
            "suggested_agent": "outreach",
        }
    )
    return llm


@pytest.fixture
def pg_mock():
    pg = AsyncMock()
    pg.get_user_profile = AsyncMock(return_value={"id": "user-1", "name": "Yael", "building_id": "b1"})
    pg.get_building = AsyncMock(
        return_value={
            "id": "b1",
            "address": "Rothschild 15",
            "city": "Tel Aviv",
            "region": "center",
            "type": "apartment",
        }
    )
    pg.get_active_offers = AsyncMock(return_value=[])
    pg.create_outreach_pending = AsyncMock()
    pg.create_agent_audit_entry = AsyncMock()
    pg.get_market_data = AsyncMock(
        return_value={
            "avg_price": 5000,
            "median_price": 4800,
            "min_price": 3000,
            "max_price": 8000,
            "price_stddev": 800,
            "avg_participants": 10,
            "sample_size": 50,
        }
    )
    return pg


@pytest.fixture
def graph_mock():
    g = AsyncMock()
    g.get_viral_invite_chain = AsyncMock(
        return_value={
            "root_id": "user-1",
            "chain_nodes": [{"id": "r2", "first_name": "Dan", "converted": True}],
            "total_invites": 1,
            "conversions": 1,
            "depth": 4,
        }
    )
    g.get_invite_momentum_for_offer = AsyncMock(
        return_value={
            "building_residents": 20,
            "joined_count": 5,
            "total_invites": 8,
            "converted_invites": 5,
        }
    )
    g.get_building_similarity_clusters = AsyncMock(return_value=[])
    g.get_top_influencers_by_city = AsyncMock(
        return_value=[
            {
                "resident_id": "r1",
                "name": "Yael",
                "city": "Tel Aviv",
                "total_score": 42.0,
                "total_invites": 10,
                "total_conversions": 7,
            },
        ]
    )
    g.refresh_influence_scores_for_city = AsyncMock(return_value=15)
    g.compute_and_store_similarity_edges = AsyncMock(return_value=88)
    g.health_check = AsyncMock(return_value=True)
    return g


@pytest.fixture
def rag_mock():
    r = AsyncMock()
    r.retrieve = AsyncMock(return_value=[])
    r.augment_prompt = AsyncMock(return_value="")
    r.get_metrics = AsyncMock(return_value={})
    return r


@pytest.fixture
def redis_mock():
    r = AsyncMock()
    r.ab_test_track = AsyncMock()
    r.ab_test_get_results = AsyncMock(return_value={"impressions": 0, "conversions": 0})
    r.cache_get = AsyncMock(return_value=None)
    r.cache_set = AsyncMock()
    return r


# ---------------------------------------------------------------------------
# Helper: build the orchestrator with all deps mocked
# ---------------------------------------------------------------------------


def _build_orchestrator(llm, pg, graph, rag, redis):
    """Return a GroupioOrchestrator instance with every external call mocked."""
    from src.orchestration.graph import GroupioOrchestrator

    patches = [
        patch("src.agents.base.get_llm_client", return_value=llm),
        patch("src.agents.base.get_rag_pipeline", return_value=rag),
        patch("src.agents.outreach.get_postgres_client", return_value=pg),
        patch("src.agents.outreach.get_redis_client", return_value=redis),
        patch("src.agents.influencer.get_postgres_client", return_value=pg),
        patch("src.agents.influencer.get_graph_store", return_value=graph),
        patch("src.agents.pricing.get_postgres_client", return_value=pg),
        patch("src.agents.pricing.get_graph_store", return_value=graph),
        patch("src.agents.matching.get_graph_store", return_value=graph),
        patch("src.agents.vetting.get_graph_store", return_value=graph),
        patch("src.agents.support.get_postgres_client", return_value=pg),
        patch("src.agents.support.get_redis_client", return_value=redis),
        patch("src.agents.analytics.get_postgres_client", return_value=pg),
        patch("src.orchestration.graph.get_postgres_client", return_value=pg),
        patch("src.orchestration.graph.get_rag_pipeline", return_value=rag),
    ]
    _ = [p.__enter__() for p in patches]
    orch = GroupioOrchestrator()
    # Return both the orchestrator and patches so caller can __exit__
    return orch, patches


# ===========================================================================
# E2E: Viral invite query routed to OutreachAgent
# ===========================================================================


class TestE2EViralInviteFlow:
    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    async def test_viral_intent_routes_to_outreach_and_queues_campaign(
        self, llm_mock, pg_mock, graph_mock, rag_mock, redis_mock
    ):
        """A viral_invite_query intent ends up calling create_outreach_pending."""
        llm_mock.create_structured_output = AsyncMock(
            return_value={
                "intent": "viral_invite_query",
                "entities": {"offer_id": "offer-42"},
                "confidence": 0.95,
                "clarifying_question": None,
                "suggested_agent": "outreach",
            }
        )
        orch, patches = _build_orchestrator(llm_mock, pg_mock, graph_mock, rag_mock, redis_mock)
        try:
            await orch.run(
                user_message="רוצה לשתף עם השכן שלי",
                user_id="user-1",
                building_id="b1",
            )
        finally:
            for p in reversed(patches):
                p.__exit__(None, None, None)

        # OutreachAgent should have queued a campaign
        pg_mock.create_outreach_pending.assert_awaited()

    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    async def test_influencer_intent_routes_to_influencer_agent(
        self, llm_mock, pg_mock, graph_mock, rag_mock, redis_mock
    ):
        """An influencer_campaign intent is handled by InfluencerAgent."""
        llm_mock.create_structured_output = AsyncMock(
            return_value={
                "intent": "influencer_campaign",
                "entities": {},
                "confidence": 0.9,
                "clarifying_question": None,
                "suggested_agent": "influencer",
            }
        )
        # LLM for influencer credit evaluation
        llm_mock.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": '{"qualified":[],"disqualified":[],"summary":""}'}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )

        orch, patches = _build_orchestrator(llm_mock, pg_mock, graph_mock, rag_mock, redis_mock)
        try:
            await orch.run(
                user_message="הפעל קמפיין משפיענים בתל אביב",
                user_id="admin-1",
                building_id="b1",
            )
        finally:
            for p in reversed(patches):
                p.__exit__(None, None, None)

        # InfluencerAgent must have queried the graph for top influencers
        graph_mock.get_top_influencers_by_city.assert_awaited()


# ===========================================================================
# E2E: Building similarity social proof flow
# ===========================================================================


class TestE2EBuildingSocialProofFlow:
    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    async def test_pricing_query_fetches_similarity_clusters(self, llm_mock, pg_mock, graph_mock, rag_mock, redis_mock):
        """A pricing query causes PricingAgent to fetch similarity clusters."""
        llm_mock.create_structured_output = AsyncMock(
            return_value={
                "intent": "building_social_proof",
                "entities": {"category": "ac_installation"},
                "confidence": 0.92,
                "clarifying_question": None,
                "suggested_agent": "pricing",
            }
        )
        graph_mock.get_building_similarity_clusters = AsyncMock(
            return_value=[
                {
                    "building_id": "b2",
                    "address": "Allenby 5",
                    "region": "center",
                    "similarity_score": 0.8,
                    "category": "ac_installation",
                    "offers_joined": 3,
                    "residents_joined": 15,
                }
            ]
        )

        orch, patches = _build_orchestrator(llm_mock, pg_mock, graph_mock, rag_mock, redis_mock)
        try:
            await orch.run(
                user_message="כמה בניינים דומים הצטרפו לעסקת מזגן?",
                user_id="user-1",
                building_id="b1",
            )
        finally:
            for p in reversed(patches):
                p.__exit__(None, None, None)

        graph_mock.get_building_similarity_clusters.assert_awaited()


# ===========================================================================
# E2E: offer join with invite_token marks conversion in graph
# ===========================================================================


class TestE2EInviteConversionOnJoin:
    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    async def test_join_with_valid_invite_token_marks_converted(self):
        """When a resident joins an offer with an invite_token, the graph records
        the conversion (mark_invite_converted called)."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        mock_user = MagicMock()
        mock_user.id = "invitee-1"
        mock_user.email = "invitee@test.com"
        mock_user.phone = "0509876543"
        mock_user.building_id = "b1"
        mock_user.full_name = "New User"

        async def _auth_override():
            return mock_user

        app.dependency_overrides[get_current_user] = _auth_override

        mock_db = AsyncMock()
        mock_db.get_offer = AsyncMock(
            return_value={
                "id": "o1",
                "building_id": "b1",
                "status": "pending",
                "current_participants": 3,
                "min_participants": 5,
                "max_participants": 50,
                "title": "AC Deal",
                "pricing_tiers": [],
            }
        )
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.has_user_joined_offer = AsyncMock(return_value=False)
        mock_db.join_offer = AsyncMock()

        mock_redis = AsyncMock()
        # invite_token resolves to an inviter id
        mock_redis.get = AsyncMock(return_value="inviter-1")

        mock_graph = AsyncMock()
        mock_graph.mark_invite_converted = AsyncMock()

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=mock_db),
            patch("src.databases.postgres._postgres_client", mock_db),
            patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=AsyncMock()),
        ):
            with TestClient(app) as c:
                with (
                    patch("src.databases.redis_client._redis_client", mock_redis),
                    patch("src.databases.graph_store._graph_store", mock_graph),
                ):
                    resp = c.post(
                        "/api/v1/offers/o1/join",
                        json={
                            "user_id": "invitee-1",
                            "unit_count": 1,
                            "invite_token": "abc123",
                        },
                    )

        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["status"] == "joined"


# ===========================================================================
# E2E: Scheduler jobs run without errors
# ===========================================================================


class TestSchedulerJobsE2E:
    @pytest.mark.asyncio
    @pytest.mark.timeout(30)
    async def test_refresh_building_similarity_completes(self):
        """refresh_building_similarity scheduler task completes without error."""
        from src.workers.scheduler import refresh_building_similarity

        mock_db = AsyncMock()
        mock_db.get_distinct_regions = AsyncMock(return_value=["tel_aviv", "haifa"])

        mock_graph = AsyncMock()
        mock_graph.compute_and_store_similarity_edges = AsyncMock(return_value=10)

        with (
            patch("src.workers.scheduler.get_postgres_client", return_value=mock_db),
            patch("src.databases.graph_store._graph_store", mock_graph),
        ):
            # Should not raise
            await refresh_building_similarity()

        assert mock_graph.compute_and_store_similarity_edges.await_count == 2

    @pytest.mark.asyncio
    @pytest.mark.timeout(30)
    async def test_refresh_influencer_scores_completes(self):
        """refresh_influencer_scores scheduler task completes without error."""
        from src.workers.scheduler import refresh_influencer_scores

        mock_db = AsyncMock()
        mock_db.get_distinct_cities = AsyncMock(return_value=["Tel Aviv", "Haifa"])

        mock_graph = AsyncMock()
        mock_graph.refresh_influence_scores_for_city = AsyncMock(return_value=7)

        with (
            patch("src.workers.scheduler.get_postgres_client", return_value=mock_db),
            patch("src.databases.graph_store._graph_store", mock_graph),
        ):
            await refresh_influencer_scores()

        assert mock_graph.refresh_influence_scores_for_city.await_count == 2

    @pytest.mark.asyncio
    @pytest.mark.timeout(30)
    async def test_refresh_building_similarity_fallback_when_no_regions(self):
        """When get_distinct_regions returns [], falls back to a single global pass."""
        from src.workers.scheduler import refresh_building_similarity

        mock_db = AsyncMock()
        mock_db.get_distinct_regions = AsyncMock(return_value=[])

        mock_graph = AsyncMock()
        mock_graph.compute_and_store_similarity_edges = AsyncMock(return_value=25)

        with (
            patch("src.workers.scheduler.get_postgres_client", return_value=mock_db),
            patch("src.databases.graph_store._graph_store", mock_graph),
        ):
            await refresh_building_similarity()

        # Called once with no region argument (global pass)
        mock_graph.compute_and_store_similarity_edges.assert_awaited_once_with()
