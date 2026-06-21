"""Unit tests for OutreachAgent viral invite loop (Feature 1)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.outreach import CAMPAIGNS, OutreachAgent

# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def agent():
    """OutreachAgent with all external dependencies mocked."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline"),
        patch("src.agents.outreach.get_postgres_client") as mock_db,
        patch("src.agents.outreach.get_pg_store") as mock_redis,
    ):
        mock_llm.return_value = AsyncMock()
        db = AsyncMock()
        redis = AsyncMock()
        mock_db.return_value = db
        mock_redis.return_value = redis

        inst = OutreachAgent()
        inst._db = db
        inst._ab_test._redis = redis
        inst.llm_client = mock_llm.return_value
        yield inst


def _state(intent: str = "", message: str = "") -> dict:
    return {
        "user_id": "user-1",
        "messages": [{"role": "user", "content": message}],
        "actions_taken": [],
        "intent": intent,
        "user_profile": {"past_interactions_count": 5},
        "building_context": {},
        "active_offers": [],
        "needs_human": False,
        "rag_results": [],
    }


# ---------------------------------------------------------------------------
# CAMPAIGNS dict
# ---------------------------------------------------------------------------


class TestCampaignsDict:
    def test_viral_invite_loop_present(self):
        assert "viral_invite_loop" in CAMPAIGNS

    def test_viral_template_has_required_placeholders(self):
        tpl = CAMPAIGNS["viral_invite_loop"]["template_he"]
        for key in (
            "{name}",
            "{neighbor_name}",
            "{category}",
            "{joined_count}",
            "{needed}",
            "{next_discount}",
            "{invite_link}",
        ):
            assert key in tpl, f"Missing placeholder: {key}"

    def test_viral_trigger_is_share_requested(self):
        assert CAMPAIGNS["viral_invite_loop"]["trigger"] == "resident_share_requested"


# ---------------------------------------------------------------------------
# _determine_campaign_type
# ---------------------------------------------------------------------------


class TestDetermineCampaignType:
    def test_viral_intent_returns_viral_campaign(self, agent):
        state = _state(intent="viral_invite_query")
        assert agent._determine_campaign_type(state) == "viral_invite_loop"

    def test_hebrew_share_keyword_returns_viral(self, agent):
        state = _state(message="רוצה לשתף את השכן שלי")
        assert agent._determine_campaign_type(state) == "viral_invite_loop"

    def test_english_invite_keyword_returns_viral(self, agent):
        state = _state(message="how do I invite my neighbor?")
        assert agent._determine_campaign_type(state) == "viral_invite_loop"

    def test_hebrew_hizmen_keyword_returns_viral(self, agent):
        state = _state(message="איך אני מזמן שכנים?")
        assert agent._determine_campaign_type(state) == "viral_invite_loop"

    def test_momentum_keyword_returns_offer_momentum(self, agent):
        state = _state(message="show me the offer momentum")
        assert agent._determine_campaign_type(state) == "offer_momentum"

    def test_new_user_returns_onboarding(self, agent):
        state = _state()
        state["user_profile"]["past_interactions_count"] = 0
        assert agent._determine_campaign_type(state) == "new_building_onboarding"

    def test_default_returns_offer_momentum(self, agent):
        """Outside seasonal windows (May–Jul AC promo / Nov–Jan heating), default is momentum."""
        state = _state(message="hello")
        with patch("src.agents.outreach.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2025, 10, 15, tzinfo=UTC)
            assert agent._determine_campaign_type(state) == "offer_momentum"

    def test_seasonal_summer_month(self, agent):
        """In summer months, seasonal campaign should take priority (after viral checks)."""
        state = _state(message="hello")  # no viral keywords
        state["user_profile"]["past_interactions_count"] = 5

        with patch("src.agents.outreach.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2025, 6, 15, tzinfo=UTC)
            result = agent._determine_campaign_type(state)
        assert result == "seasonal_campaign"


# ---------------------------------------------------------------------------
# run() — viral campaign queued
# ---------------------------------------------------------------------------


class TestRunViralCampaign:
    @pytest.mark.asyncio
    async def test_run_queues_viral_campaign_for_approval(self, agent):
        agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "היי שלום! שתף עם שכניך"}],
                "usage": {"input_tokens": 50, "output_tokens": 30},
            }
        )
        agent._ab_test.assign_variant = AsyncMock(return_value="control")
        agent._db.create_outreach_pending = AsyncMock()
        agent.rag.retrieve = AsyncMock(return_value=[])

        state = _state(intent="viral_invite_query", message="שתף את השכן")
        result = await agent.run(state)

        assert result["actions_taken"][0]["action"] == "campaign_queued_for_approval"
        assert result["actions_taken"][0]["details"]["campaign_type"] == "viral_invite_loop"
        agent._db.create_outreach_pending.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_run_no_campaign_when_type_missing(self, agent):
        """When campaign type resolves to unknown key, agent returns no_campaign."""
        agent._determine_campaign_type = MagicMock(return_value="nonexistent_campaign_xyz")

        state = _state()
        result = await agent.run(state)
        assert result["actions_taken"][0]["action"] == "no_campaign"
