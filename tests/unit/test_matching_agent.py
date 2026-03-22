"""Unit tests for the Matching Agent."""

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.matching import MATCH_WEIGHTS, MatchingAgent


@pytest.fixture
def matching_agent():
    """Create a MatchingAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
        patch("src.agents.matching.get_graph_store") as mock_graph,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()
        mock_graph.return_value = AsyncMock()

        agent = MatchingAgent()
        agent.llm_client = AsyncMock()
        agent.rag = AsyncMock()
        agent._graph_store = AsyncMock()
        yield agent


@pytest.mark.asyncio
async def test_matching_finds_contractors(matching_agent, sample_agent_state):
    """Test that matching agent finds and ranks contractors."""
    sample_agent_state["intent"] = "contractor_search"

    # Mock RAG results
    matching_agent.rag.retrieve = AsyncMock(
        return_value=[
            {
                "id": "doc_1",
                "text": "AC installation specialist",
                "score": 0.95,
                "metadata": {
                    "contractor_id": "con_001",
                    "business_name": "Cool Air Ltd",
                    "rating": 4.8,
                    "verified": True,
                },
            },
            {
                "id": "doc_2",
                "text": "General AC services",
                "score": 0.82,
                "metadata": {
                    "contractor_id": "con_002",
                    "business_name": "AC Pros",
                    "rating": 4.2,
                    "verified": True,
                },
            },
        ]
    )

    # Mock graph results
    matching_agent._graph_store.find_matching_contractors = AsyncMock(
        return_value=[
            {
                "id": "con_001",
                "business_name": "Cool Air Ltd",
                "avg_success": 0.93,
                "projects": 5,
                "rating": 4.8,
            }
        ]
    )

    # Mock LLM response
    matching_agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "Here are the top matches..."}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )

    result = await matching_agent.run(sample_agent_state)

    assert len(result["actions_taken"]) > 0
    action = result["actions_taken"][-1]
    assert action["action"] == "contractors_found"
    assert len(action["contractors"]) > 0
    assert "summary_for_next_agent" in action
    assert "entities_to_pass" in action
    assert action["entities_to_pass"].get("contractor_ids")
    assert "category" in result.get("context_for_next_agent", {})


@pytest.mark.asyncio
async def test_matching_handles_no_results(matching_agent, sample_agent_state):
    """Test matching agent handles no results gracefully."""
    sample_agent_state["intent"] = "contractor_search"
    sample_agent_state["messages"] = [{"role": "user", "content": "looking for a plumber"}]

    matching_agent.rag.retrieve = AsyncMock(return_value=[])
    matching_agent._graph_store.find_matching_contractors = AsyncMock(return_value=[])

    result = await matching_agent.run(sample_agent_state)

    action = result["actions_taken"][-1]
    assert action["action"] == "contractors_found"
    assert action["contractors"] == []


def test_match_weights_sum_to_one():
    """Verify that match score weights sum to 1.0."""
    total = sum(MATCH_WEIGHTS.values())
    assert abs(total - 1.0) < 0.001


@pytest.mark.asyncio
async def test_matching_extracts_category_from_hebrew(matching_agent, sample_agent_state):
    """Test category extraction from Hebrew message."""
    sample_agent_state["messages"] = [{"role": "user", "content": "אני מחפש קבלן מזגנים לבניין שלי"}]

    category = matching_agent._extract_category(
        sample_agent_state,
        "אני מחפש קבלן מזגנים לבניין שלי",
    )
    assert category == "ac_installation"


@pytest.mark.asyncio
async def test_matching_extracts_category_kitchen(matching_agent, sample_agent_state):
    """Test category extraction for kitchen."""
    category = matching_agent._extract_category(
        sample_agent_state,
        "I need a kitchen renovation",
    )
    assert category == "kitchen"
