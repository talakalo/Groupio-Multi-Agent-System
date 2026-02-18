"""Unit tests for the Router Agent."""

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.router import RouterAgent


@pytest.fixture
def router_agent():
    """Create a RouterAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
    ):
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
    sample_agent_state["messages"] = [{"role": "user", "content": "כמה עולה להתקין מזגן?"}]
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
    sample_agent_state["messages"] = [{"role": "user", "content": "hi"}]
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "general_info",
            "entities": {},
            "confidence": 0.4,
            "clarifying_question": (
                "היי! איך אוכל לעזור לך? האם אתה מחפש קבלן, מעוניין במידע על מחירים, או צריך עזרה בנושא אחר?"
            ),
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


@pytest.mark.asyncio
async def test_router_validates_intent_maps_unknown_to_general_info(router_agent, sample_agent_state):
    """Test that invalid intent is mapped to general_info."""
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "unknown_intent",
            "entities": {},
            "confidence": 0.9,
            "clarifying_question": None,
            "suggested_agent": "support",
        }
    )
    result = await router_agent.run(sample_agent_state)
    assert result["intent"] == "general_info"
    assert result["current_agent"] == "support"


@pytest.mark.asyncio
async def test_router_clamps_confidence_to_unit_interval(router_agent, sample_agent_state):
    """Test that confidence > 1 is clamped to 1.0."""
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "contractor_search",
            "entities": {},
            "confidence": 1.5,
            "clarifying_question": None,
            "suggested_agent": "matching",
        }
    )
    result = await router_agent.run(sample_agent_state)
    assert result["confidence"] == 1.0


@pytest.mark.asyncio
async def test_router_validates_suggested_agent_fallback_to_support(router_agent, sample_agent_state):
    """Test that unknown suggested_agent falls back to support."""
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "general_info",
            "entities": {},
            "confidence": 0.9,
            "clarifying_question": None,
            "suggested_agent": "unknown_agent",
        }
    )
    result = await router_agent.run(sample_agent_state)
    assert result["current_agent"] == "support"


@pytest.mark.asyncio
async def test_router_writes_entities_to_state(router_agent, sample_agent_state):
    """Test that router writes extracted entities to state["entities"]."""
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "contractor_search",
            "entities": {
                "category": "ac_installation",
                "building_id": "bld_001",
                "contractor_id": None,
                "offer_id": None,
            },
            "confidence": 0.95,
            "clarifying_question": None,
            "suggested_agent": "matching",
        }
    )
    result = await router_agent.run(sample_agent_state)
    assert result.get("entities") == {
        "category": "ac_installation",
        "building_id": "bld_001",
    }


@pytest.mark.asyncio
async def test_router_injects_last_agent_handoff_when_present(router_agent, sample_agent_state):
    """Test that router receives last_agent_handoff and system prompt is extended (no crash)."""
    sample_agent_state["last_agent_handoff"] = {
        "agent": "matching",
        "summary_for_next_agent": "Found 3 contractors for AC installation.",
        "suggested_next_intent": "pricing_question",
    }
    sample_agent_state["messages"] = [{"role": "user", "content": "what about price?"}]
    router_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "intent": "pricing_question",
            "entities": {"category": "ac_installation"},
            "confidence": 0.85,
            "clarifying_question": None,
            "suggested_agent": "pricing",
        }
    )
    result = await router_agent.run(sample_agent_state)
    assert result["intent"] == "pricing_question"
    assert result["current_agent"] == "pricing"
