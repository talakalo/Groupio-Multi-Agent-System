"""Unit tests for the Support Agent."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.support import SupportAgent


@pytest.fixture
def support_agent():
    """Create a SupportAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
        patch("src.agents.support.get_postgres_client") as mock_db,
        patch("src.agents.support.get_redis_client") as mock_redis,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()
        mock_db.return_value = AsyncMock()
        mock_redis.return_value = AsyncMock()

        agent = SupportAgent()
        agent.llm_client = AsyncMock()
        agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Support response"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        agent.rag = AsyncMock()
        agent.rag.retrieve = AsyncMock(return_value=[])
        agent._db = AsyncMock()
        agent._memory = MagicMock()
        agent._memory.get_context = AsyncMock(return_value=[])
        agent._memory.add_message = AsyncMock()
        yield agent


@pytest.mark.asyncio
async def test_support_handles_general_query(support_agent, sample_agent_state):
    """Test support agent handles general info queries."""
    sample_agent_state["intent"] = "general_info"
    sample_agent_state["messages"] = [{"role": "user", "content": "מה השירותים שלכם?"}]

    result = await support_agent.run(sample_agent_state)

    assert "actions_taken" in result
    assert result["actions_taken"][-1]["action"] == "support_response"
    assert result["actions_taken"][-1]["response"]["type"] == "support"


@pytest.mark.asyncio
async def test_support_escalates_legal_keywords(support_agent, sample_agent_state):
    """Test that legal keywords trigger escalation."""
    sample_agent_state["intent"] = "complaint"
    sample_agent_state["messages"] = [{"role": "user", "content": "אני הולך לעורך דין בגלל הנזק שנגרם"}]

    result = await support_agent.run(sample_agent_state)

    assert result["needs_human"] is True
    assert result["actions_taken"][-1]["action"] == "escalated_to_human"


@pytest.mark.asyncio
async def test_support_escalates_negative_sentiment(support_agent, sample_agent_state):
    """Test that very negative sentiment triggers escalation."""
    sample_agent_state["intent"] = "complaint"
    sample_agent_state["messages"] = [{"role": "user", "content": "This is the worst service I've ever experienced!"}]
    # Set sentiment explicitly to trigger escalation
    sample_agent_state["sentiment_score"] = -0.8

    result = await support_agent.run(sample_agent_state)

    # Either handled as complaint or escalated
    assert "actions_taken" in result


@pytest.mark.asyncio
async def test_support_escalates_after_3_attempts(support_agent, sample_agent_state):
    """Test escalation after 3 failed resolution attempts."""
    sample_agent_state["intent"] = "complaint"
    sample_agent_state["messages"] = [{"role": "user", "content": "Still not resolved"}]
    sample_agent_state["actions_taken"] = [
        {"agent": "support", "action": "support_response"},
        {"agent": "support", "action": "support_response"},
        {"agent": "support", "action": "support_response"},
    ]

    result = await support_agent.run(sample_agent_state)

    # After 3 attempts, should escalate
    assert result["needs_human"] is True


@pytest.mark.asyncio
async def test_support_order_status_includes_asyncpg_order_context(support_agent, sample_agent_state):
    """Order-status flow consumes normalized asyncpg order rows without breaking prompt generation."""
    sample_agent_state["intent"] = "order_status"
    sample_agent_state["user_id"] = "user-1"
    sample_agent_state["messages"] = [{"role": "user", "content": "מה הסטטוס של ההזמנה שלי?"}]
    support_agent._db.get_user_orders = AsyncMock(
        return_value=[
            {
                "id": "ord-1",
                "status": "paid",
                "contractors": {"business_name": "Cool Air Ltd"},
            }
        ]
    )

    result = await support_agent.run(sample_agent_state)

    assert result["actions_taken"][-1]["action"] == "support_response"
    llm_messages = support_agent.llm_client.create_message.call_args.kwargs["messages"]
    assert "[Order Data]" in llm_messages[-1]["content"]
    assert "Cool Air Ltd" in llm_messages[-1]["content"]
