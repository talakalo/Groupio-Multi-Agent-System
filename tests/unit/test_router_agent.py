"""Unit tests for the Router Agent."""

import pytest
from unittest.mock import AsyncMock, patch

from src.agents.router import RouterAgent


@pytest.fixture
def router_agent():
    """Create a RouterAgent with mocked dependencies."""
    with patch("src.agents.base.get_llm_client") as mock_llm, \
         patch("src.agents.base.get_rag_pipeline") as mock_rag:
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()

        agent = RouterAgent()
        agent.llm_client = AsyncMock()
        yield agent


@pytest.mark.asyncio
async def test_router_classifies_contractor_search(router_agent, sample_agent_state):
    """Test that router correctly classifies contractor search intent."""
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "contractor_search",
            "entities": {"category": "ac_installation"},
            "confidence": 0.95,
            "clarifying_question": None,
            "suggested_agent": "matching",
        }
    )

    result = await router_agent.run(sample_agent_state)

    assert result["intent"] == "contractor_search"
    assert result["confidence"] == 0.95
    assert result["current_agent"] == "matching"


@pytest.mark.asyncio
async def test_router_classifies_pricing_question(router_agent, sample_agent_state):
    """Test that router correctly classifies pricing questions."""
    sample_agent_state["messages"] = [
        {"role": "user", "content": "כמה עולה להתקין מזגן?"}
    ]
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "pricing_question",
            "entities": {"category": "ac_installation"},
            "confidence": 0.88,
            "clarifying_question": None,
            "suggested_agent": "pricing",
        }
    )

    result = await router_agent.run(sample_agent_state)

    assert result["intent"] == "pricing_question"
    assert result["current_agent"] == "pricing"


@pytest.mark.asyncio
async def test_router_low_confidence_asks_clarification(router_agent, sample_agent_state):
    """Test that router asks for clarification when confidence is low."""
    sample_agent_state["messages"] = [
        {"role": "user", "content": "hi"}
    ]
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "general_info",
            "entities": {},
            "confidence": 0.4,
            "clarifying_question": "היי! איך אוכל לעזור לך? האם אתה מחפש קבלן, מעוניין במידע על מחירים, או צריך עזרה בנושא אחר?",
            "suggested_agent": "support",
        }
    )

    result = await router_agent.run(sample_agent_state)

    assert result["confidence"] < 0.7
    assert result["current_agent"] == "support"
    assert len(result["actions_taken"]) > 0
    assert result["actions_taken"][-1]["action"] == "clarification_needed"


@pytest.mark.asyncio
async def test_router_handles_empty_message(router_agent, sample_agent_state):
    """Test that router handles empty message gracefully."""
    sample_agent_state["messages"] = []

    result = await router_agent.run(sample_agent_state)

    assert result["intent"] == "general_info"
    assert result["current_agent"] == "support"


@pytest.mark.asyncio
async def test_router_handles_parse_error(router_agent, sample_agent_state):
    """Test that router handles LLM parse errors gracefully."""
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={"raw_response": "invalid json", "parse_error": True}
    )

    result = await router_agent.run(sample_agent_state)

    assert result["intent"] == "general_info"
    assert result["confidence"] == 0.5
    assert result["current_agent"] == "support"
