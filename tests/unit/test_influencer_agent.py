"""Unit tests for InfluencerAgent."""

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.influencer import InfluencerAgent

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def agent():
    """InfluencerAgent with all external dependencies mocked."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline"),
        patch("src.agents.influencer.get_postgres_client") as mock_db,
        patch("src.agents.influencer.get_graph_store") as mock_graph,
    ):
        mock_llm.return_value = AsyncMock()
        db = AsyncMock()
        graph = AsyncMock()
        mock_db.return_value = db
        mock_graph.return_value = graph

        inst = InfluencerAgent()
        inst._db = db
        inst._graph = graph
        inst.llm_client = mock_llm.return_value
        yield inst


def _base_state(city: str = "Tel Aviv") -> dict:
    return {
        "user_id": "admin-1",
        "messages": [{"role": "user", "content": "run influencer campaign"}],
        "actions_taken": [],
        "intent": "influencer_campaign",
        "building_context": {"city": city},
        "context_for_next_agent": {},
        "needs_human": False,
        "influencer_data": None,
    }


TOP_INFLUENCERS = [
    {
        "resident_id": "r1",
        "name": "Yael",
        "city": "Tel Aviv",
        "total_score": 42.0,
        "total_invites": 10,
        "total_conversions": 7,
    },
    {
        "resident_id": "r2",
        "name": "Dan",
        "city": "Tel Aviv",
        "total_score": 12.0,
        "total_invites": 4,
        "total_conversions": 3,
    },
]


# ---------------------------------------------------------------------------
# _resolve_city
# ---------------------------------------------------------------------------


class TestResolveCity:
    def test_resolves_from_building_context(self, agent):
        state = {"building_context": {"city": "Haifa"}, "context_for_next_agent": {}}
        assert agent._resolve_city(state) == "Haifa"

    def test_resolves_from_context_for_next_agent(self, agent):
        state = {"building_context": {}, "context_for_next_agent": {"city": "Beer Sheva"}}
        assert agent._resolve_city(state) == "Beer Sheva"

    def test_returns_none_when_missing(self, agent):
        state = {"building_context": {}, "context_for_next_agent": {}}
        assert agent._resolve_city(state) is None

    def test_prefers_context_for_next_agent(self, agent):
        """context_for_next_agent.city takes priority over building_context.city."""
        state = {
            "building_context": {"city": "Tel Aviv"},
            "context_for_next_agent": {"city": "Haifa"},
        }
        assert agent._resolve_city(state) == "Haifa"


# ---------------------------------------------------------------------------
# run() — no city
# ---------------------------------------------------------------------------


class TestRunNoCityFound:
    @pytest.mark.asyncio
    async def test_no_city_produces_no_campaign_action(self, agent):
        state = {
            "user_id": "admin-1",
            "messages": [],
            "actions_taken": [],
            "building_context": {},
            "context_for_next_agent": {},
            "influencer_data": None,
            "needs_human": False,
        }
        result = await agent.run(state)
        assert result["actions_taken"][0]["action"] == "no_city"
        assert result["actions_taken"][0]["requires_followup"] is False


# ---------------------------------------------------------------------------
# run() — no qualifying influencers
# ---------------------------------------------------------------------------


class TestRunNoInfluencers:
    @pytest.mark.asyncio
    async def test_no_influencers_produces_no_campaign_action(self, agent):
        agent._graph.get_top_influencers_by_city = AsyncMock(return_value=[])
        state = _base_state()
        result = await agent.run(state)
        assert result["actions_taken"][0]["action"] == "no_influencers"
        assert result["actions_taken"][0]["requires_followup"] is False
        assert result["influencer_data"]["top_influencers"] == []

    @pytest.mark.asyncio
    async def test_graph_failure_treated_as_no_influencers(self, agent):
        agent._graph.get_top_influencers_by_city = AsyncMock(side_effect=Exception("neo4j down"))
        state = _base_state()
        result = await agent.run(state)
        assert result["actions_taken"][0]["action"] == "no_influencers"


# ---------------------------------------------------------------------------
# run() — with qualifying influencers
# ---------------------------------------------------------------------------


class TestRunWithInfluencers:
    @pytest.fixture
    def patched_agent(self, agent):
        agent._graph.get_top_influencers_by_city = AsyncMock(return_value=TOP_INFLUENCERS)
        # LLM decides r1 qualifies
        agent.llm_client.create_structured_output = AsyncMock(
            return_value={
                "qualified": [{"resident_id": "r1", "name": "Yael", "reason": "ציון השפעה גבוה", "credit_amount": 500}],
                "disqualified": [{"resident_id": "r2", "reason": "ניקוד נמוך מדי"}],
                "summary": "זיהינו 1 משפיען בתל אביב.",
            }
        )
        agent._db.create_credit_award = AsyncMock()
        return agent

    @pytest.mark.asyncio
    async def test_action_is_evaluating(self, patched_agent):
        state = _base_state()
        result = await patched_agent.run(state)
        assert result["actions_taken"][0]["action"] == "influencer_credits_evaluated"

    @pytest.mark.asyncio
    async def test_qualified_stored_in_state(self, patched_agent):
        state = _base_state()
        result = await patched_agent.run(state)
        assert result["influencer_data"]["qualified"][0]["resident_id"] == "r1"

    @pytest.mark.asyncio
    async def test_requires_followup_with_qualified(self, patched_agent):
        state = _base_state()
        result = await patched_agent.run(state)
        assert result["actions_taken"][0]["requires_followup"] is True
        assert result["actions_taken"][0]["suggested_next_agent"] == "outreach"

    @pytest.mark.asyncio
    async def test_credit_award_written_to_db(self, patched_agent):
        state = _base_state()
        await patched_agent.run(state)
        patched_agent._db.create_credit_award.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_context_for_next_agent_populated(self, patched_agent):
        state = _base_state()
        result = await patched_agent.run(state)
        ctx = result["context_for_next_agent"]
        assert ctx["city"] == "Tel Aviv"
        assert len(ctx["influencer_campaign_targets"]) == 1

    @pytest.mark.asyncio
    async def test_no_followup_when_none_qualify(self, agent):
        agent._graph.get_top_influencers_by_city = AsyncMock(return_value=TOP_INFLUENCERS)
        agent.llm_client.create_structured_output = AsyncMock(
            return_value={"qualified": [], "disqualified": [], "summary": "אף אחד לא עומד"}
        )
        state = _base_state()
        result = await agent.run(state)
        assert result["actions_taken"][0]["requires_followup"] is False
        assert result["actions_taken"][0].get("suggested_next_agent") is None

    @pytest.mark.asyncio
    async def test_llm_failure_results_in_empty_qualified(self, agent):
        agent._graph.get_top_influencers_by_city = AsyncMock(return_value=TOP_INFLUENCERS)
        agent.llm_client.create_structured_output = AsyncMock(side_effect=Exception("LLM timeout"))
        state = _base_state()
        result = await agent.run(state)
        assert result["influencer_data"]["qualified"] == []
        assert result["actions_taken"][0]["requires_followup"] is False


# ---------------------------------------------------------------------------
# _award_credits
# ---------------------------------------------------------------------------


class TestAwardCredits:
    @pytest.mark.asyncio
    async def test_writes_one_record_per_qualified(self, agent):
        agent._db.create_credit_award = AsyncMock()
        qualified = [
            {"resident_id": "r1", "reason": "reason A", "credit_amount": 500},
            {"resident_id": "r2", "reason": "reason B", "credit_amount": 500},
        ]
        written = await agent._award_credits(qualified)
        assert len(written) == 2
        assert agent._db.create_credit_award.await_count == 2

    @pytest.mark.asyncio
    async def test_skips_entry_without_resident_id(self, agent):
        agent._db.create_credit_award = AsyncMock()
        qualified = [{"reason": "no resident_id", "credit_amount": 500}]
        written = await agent._award_credits(qualified)
        assert written == []
        agent._db.create_credit_award.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_handles_db_missing_method_gracefully(self, agent):
        """If create_credit_award doesn't exist on db, still returns records."""
        del agent._db.create_credit_award  # simulate missing method
        qualified = [{"resident_id": "r1", "reason": "ok", "credit_amount": 500}]
        written = await agent._award_credits(qualified)
        # Method missing → hasattr check skips write, but record is still counted
        assert len(written) == 1

    @pytest.mark.asyncio
    async def test_handles_db_write_failure_gracefully(self, agent):
        agent._db.create_credit_award = AsyncMock(side_effect=Exception("DB error"))
        qualified = [{"resident_id": "r1", "reason": "ok", "credit_amount": 500}]
        written = await agent._award_credits(qualified)
        # DB write failed → not appended to written
        assert written == []
