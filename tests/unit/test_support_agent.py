"""Unit tests for the Support Agent."""

import pytest
from unittest.mock import AsyncMock, patch

from src.agents.support import SupportAgent


@pytest.fixture
def support_agent():
    """Create a SupportAgent with mocked dependencies."""
    with patch("src.agents.support.get_llm_client") as mock_llm, \
         patch("src.agents.support.get_rag_pipeline") as mock_rag, \
         patch("src.agents.support.get_postgres_client") as mock_db, \
         patch("src.agents.support.get_redis_client") as mock_redis:
        agent = SupportAgent()
        agent.llm_client = mock_llm()
        agent.rag = mock_rag()
        agent._db = mock_db()
        agent._memory._redis = mock_redis()
        yield agent


@pytest.mark.asyncio
async def test_support_handles_general_query(support_agent, sample_agent_state):
    """Test support agent handles general info queries."""
    sample_agent_state["intent"] = "general_info"
    sample_agent_state["messages"] = [
        {"role": "user", "content": "מה השירותים שלכם?"}
    ]

    support_agent.rag.retrieve = AsyncMock(
        return_value=[
            {
                "id": "faq_1",
                "text": "Groupio provides group home improvement services...",
                "score": 0.9,
                "metadata": {},
            }
        ]
    )
    support_agent.rag.augment_prompt = AsyncMock(
        return_value="Augmented prompt"
    )
    support_agent._memory._redis.get_conversation_context = AsyncMock(
        return_value=[]
    )
    support_agent._memory._redis.add_conversation_message = AsyncMock()
    support_agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "גרופיו מציעה שירותי שיפוצים קבוצתיים..."}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )
    support_agent.llm_client.analyze_sentiment = AsyncMock(return_value=0.5)

    result = await support_agent.run(sample_agent_state)

    assert result["actions_taken"][-1]["action"] == "support_response"
    assert result["actions_taken"][-1]["response"]["type"] == "support"


@pytest.mark.asyncio
async def test_support_escalates_legal_keywords(support_agent, sample_agent_state):
    """Test that legal keywords trigger escalation."""
    sample_agent_state["intent"] = "complaint"
    sample_agent_state["messages"] = [
        {"role": "user", "content": "אני הולך לעורך דין בגלל הנזק שנגרם"}
    ]

    result = await support_agent.run(sample_agent_state)

    assert result["needs_human"] is True
    assert result["actions_taken"][-1]["action"] == "escalated_to_human"


@pytest.mark.asyncio
async def test_support_escalates_negative_sentiment(support_agent, sample_agent_state):
    """Test that very negative sentiment triggers escalation."""
    sample_agent_state["intent"] = "complaint"
    sample_agent_state["messages"] = [
        {"role": "user", "content": "This is the worst service I've ever experienced!"}
    ]

    support_agent.llm_client.analyze_sentiment = AsyncMock(return_value=-0.8)

    result = await support_agent.run(sample_agent_state)

    assert result["needs_human"] is True


@pytest.mark.asyncio
async def test_support_escalates_after_3_attempts(support_agent, sample_agent_state):
    """Test escalation after 3 failed resolution attempts."""
    sample_agent_state["intent"] = "complaint"
    sample_agent_state["messages"] = [
        {"role": "user", "content": "Still not resolved"}
    ]
    sample_agent_state["actions_taken"] = [
        {"agent": "support", "action": "support_response"},
        {"agent": "support", "action": "support_response"},
        {"agent": "support", "action": "support_response"},
    ]

    support_agent.llm_client.analyze_sentiment = AsyncMock(return_value=0.0)

    result = await support_agent.run(sample_agent_state)

    assert result["needs_human"] is True
