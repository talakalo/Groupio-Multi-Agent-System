"""Unit tests for the Pricing Agent."""

import pytest
from unittest.mock import AsyncMock, patch

from src.agents.pricing import PricingAgent, DEFAULT_TIERS


@pytest.fixture
def pricing_agent():
    """Create a PricingAgent with mocked dependencies."""
    with patch("src.agents.pricing.get_llm_client") as mock_llm, \
         patch("src.agents.pricing.get_rag_pipeline") as mock_rag, \
         patch("src.agents.pricing.get_postgres_client") as mock_db:
        agent = PricingAgent()
        agent.llm_client = mock_llm()
        agent.rag = mock_rag()
        agent._db = mock_db()
        yield agent


def test_calculate_tiers_basic(pricing_agent):
    """Test basic tier calculation."""
    market_data = {
        "avg_price": 4500,
        "min_price": 3000,
        "max_price": 6000,
    }

    tiers = pricing_agent._calculate_tiers(4500, market_data, "ac_installation")

    assert len(tiers) == 4
    assert tiers[0]["discount_percent"] == 5
    assert tiers[1]["discount_percent"] == 10
    assert tiers[2]["discount_percent"] == 15
    assert tiers[3]["discount_percent"] == 20

    # Each tier should be cheaper than the previous
    for i in range(1, len(tiers)):
        assert tiers[i]["price"] <= tiers[i - 1]["price"]


def test_calculate_tiers_quality_floor(pricing_agent):
    """Test that tiers don't go below 80% of market minimum."""
    market_data = {
        "avg_price": 3200,
        "min_price": 3000,
        "max_price": 4000,
    }

    tiers = pricing_agent._calculate_tiers(3200, market_data, "ac_installation")

    # No tier price should go below 80% of min_price (2400)
    for tier in tiers:
        assert tier["price"] >= 3000 * 0.8


def test_calculate_tiers_zero_base_price(pricing_agent):
    """Test that zero base price returns empty tiers."""
    market_data = {"avg_price": 0, "min_price": 0, "max_price": 0}
    tiers = pricing_agent._calculate_tiers(0, market_data, "ac_installation")
    assert tiers == []


def test_seasonal_adjustment_summer(pricing_agent):
    """Test seasonal adjustment for AC in summer."""
    tiers = [
        {"price": 4000, "min_participants": 3, "max_participants": 5,
         "discount_percent": 5, "market_position": 1.0, "flags": []},
    ]

    with patch.object(pricing_agent, "_get_current_season", return_value="summer"):
        adjusted = pricing_agent._apply_seasonal_adjustments(tiers, "ac_installation")

    assert adjusted[0]["price"] == round(4000 * 1.15, 2)
    assert adjusted[0]["seasonal_factor"] == 1.15


def test_seasonal_adjustment_no_effect(pricing_agent):
    """Test that non-seasonal categories are unaffected."""
    tiers = [
        {"price": 5000, "min_participants": 3, "max_participants": 5,
         "discount_percent": 5, "market_position": 1.0, "flags": []},
    ]

    adjusted = pricing_agent._apply_seasonal_adjustments(tiers, "electrical")
    assert adjusted[0]["price"] == 5000


@pytest.mark.asyncio
async def test_pricing_agent_runs(pricing_agent, sample_agent_state):
    """Test full pricing agent run."""
    sample_agent_state["intent"] = "pricing_question"
    sample_agent_state["messages"] = [
        {"role": "user", "content": "כמה עולה מזגן?"}
    ]

    pricing_agent.rag.retrieve = AsyncMock(return_value=[])
    pricing_agent._db.get_market_data = AsyncMock(
        return_value={
            "avg_price": 4500,
            "median_price": 4200,
            "min_price": 3000,
            "max_price": 6000,
            "price_stddev": 800,
            "avg_participants": 8,
            "sample_size": 25,
        }
    )
    pricing_agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "Pricing analysis..."}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )

    result = await pricing_agent.run(sample_agent_state)

    assert len(result["actions_taken"]) > 0
    assert result["actions_taken"][-1]["action"] == "pricing_analyzed"
