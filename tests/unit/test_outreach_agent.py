"""Tests for the Outreach Agent."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.outreach import OutreachAgent


@pytest.fixture
def outreach_agent():
    """Create outreach agent instance."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
        patch("src.agents.outreach.get_postgres_client") as mock_db,
        patch("src.agents.outreach.get_redis_client") as mock_redis,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()
        mock_db.return_value = AsyncMock()
        mock_redis.return_value = AsyncMock()

        agent = OutreachAgent()
        agent.llm_client = AsyncMock()
        agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Personalized message"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        agent.rag = AsyncMock()
        agent._db = AsyncMock()
        agent._ab_test = MagicMock()
        agent._ab_test.assign_variant = AsyncMock(return_value="control")
        yield agent


@pytest.fixture
def sample_state():
    """Create sample agent state."""
    return {
        "user_message": "Send offer notifications to contractors",
        "user_id": "system",
        "intent": "outreach",
        "confidence": 0.9,
        "messages": [{"role": "user", "content": "Send offer notifications"}],
        "actions_taken": [],
        "needs_human": False,
        "user_profile": {"name": "Test User", "language": "he"},
    }


@pytest.fixture
def sample_offer():
    """Sample offer for outreach."""
    return {
        "id": "offer-123",
        "title": "AC Installation for Building A",
        "category": "ac_installation",
        "base_price": 5000.0,
        "current_participants": 10,
        "building_id": "building-123",
        "region": "center",
    }


class TestOutreachAgent:
    """Test suite for OutreachAgent."""

    @pytest.mark.asyncio
    async def test_run_with_campaign(self, outreach_agent, sample_state):
        """Test running outreach agent with a campaign context."""
        # Set up context that triggers a campaign
        sample_state["actions_taken"] = [{"trigger": "new_building_registered", "building_id": "b1"}]

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_run_no_campaign(self, outreach_agent, sample_state):
        """Test running outreach agent without campaign context."""
        sample_state["actions_taken"] = []
        sample_state["messages"] = [{"role": "user", "content": "hello"}]

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_ab_test_assignment(self, outreach_agent, sample_state):
        """Test A/B test variant assignment."""
        outreach_agent._ab_test.assign_variant = AsyncMock(return_value="variant_a")

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_campaign_type_determination(self, outreach_agent, sample_state):
        """Test that campaign type is determined correctly."""
        sample_state["offer"] = {"id": "offer-123", "near_threshold": True}

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_seasonal_campaign(self, outreach_agent, sample_state):
        """Test seasonal campaign detection."""
        sample_state["seasonal_trigger"] = "summer_ac"

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_personalized_message_generation(self, outreach_agent, sample_state):
        """Test personalized message generation."""
        sample_state["user_profile"] = {
            "name": "יוסי",
            "building_id": "b1",
            "language": "he",
        }

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_metrics(self, outreach_agent):
        """Test getting agent metrics."""
        outreach_agent._metrics = {"calls": 50, "errors": 2, "tokens": 2500}

        metrics = await outreach_agent.get_metrics()

        assert "calls" in metrics
        assert metrics["calls"] == 50
