"""Unit tests for the Vetting Agent."""

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.vetting import THRESHOLDS, TRUST_WEIGHTS, VettingAgent


@pytest.fixture
def vetting_agent():
    """Create a VettingAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()

        agent = VettingAgent()
        agent.llm_client = AsyncMock()
        agent.rag = AsyncMock()
        agent._db = AsyncMock()
        agent._graph_store = AsyncMock()
        yield agent


def test_trust_weights_sum_to_100(vetting_agent):
    """Verify trust weights sum to 100."""
    total = sum(TRUST_WEIGHTS.values())
    assert total == 100


def test_make_decision_approved():
    """Test auto-approve decision."""
    assert VettingAgent._make_decision(90) == "approved"
    assert VettingAgent._make_decision(85) == "approved"


def test_make_decision_rejected():
    """Test auto-reject decision."""
    assert VettingAgent._make_decision(30) == "rejected"
    assert VettingAgent._make_decision(49) == "rejected"


def test_make_decision_manual_review():
    """Test manual review decision."""
    assert VettingAgent._make_decision(70) == "manual_review"
    assert VettingAgent._make_decision(50) == "manual_review"
    assert VettingAgent._make_decision(84) == "manual_review"


def test_calculate_trust_score_high(vetting_agent):
    """Test trust score calculation for a good contractor."""
    validations = {"license_valid": True, "insurance_valid": True}
    reputation = {
        "online_reputation_score": 0.9,
        "graph_reputation": {"total_projects": 10},
        "suspicious_patterns": {"suspicious": False},
    }
    history = {"completion_rate": 0.95, "total_projects": 10}

    score = vetting_agent._calculate_trust_score(validations, reputation, history)

    assert score >= 80


def test_calculate_trust_score_suspicious_penalty(vetting_agent):
    """Test that suspicious patterns reduce trust score."""
    validations = {"license_valid": True, "insurance_valid": True}
    reputation = {
        "online_reputation_score": 0.9,
        "graph_reputation": {"total_projects": 10},
        "suspicious_patterns": {"suspicious": True},
    }
    history = {"completion_rate": 0.95, "total_projects": 10}

    score = vetting_agent._calculate_trust_score(validations, reputation, history)
    # Should be reduced by 30%
    assert score < 80


def test_calculate_trust_score_missing_docs(vetting_agent):
    """Test trust score with missing documents."""
    validations = {"license_valid": False, "insurance_valid": False}
    reputation = {
        "online_reputation_score": 0.5,
        "graph_reputation": {},
        "suspicious_patterns": {"suspicious": False},
    }
    history = {"completion_rate": 0.5}

    score = vetting_agent._calculate_trust_score(validations, reputation, history)

    assert score < THRESHOLDS["auto_approve"]


@pytest.mark.asyncio
async def test_vetting_agent_missing_contractor_id(vetting_agent, sample_agent_state):
    """Test vetting agent handles missing contractor ID."""
    result = await vetting_agent.run(sample_agent_state)

    assert result["actions_taken"][-1]["action"] == "missing_contractor_id"


@pytest.mark.asyncio
async def test_vetting_agent_manual_review_escalates(vetting_agent, sample_agent_state):
    """Test that manual review triggers human escalation."""
    # Add contractor ID to state
    sample_agent_state["actions_taken"] = [{"details": {"entities": {"contractor_id": "con_004"}}}]

    vetting_agent._db.get_contractor_documents = AsyncMock(return_value=[])
    vetting_agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "license_valid": True,
            "insurance_valid": False,
            "certificates_valid": False,
            "issues": ["Insurance not found"],
            "recommendations": ["Request insurance document"],
        }
    )
    vetting_agent._graph_store.get_contractor_reputation = AsyncMock(
        return_value={"total_projects": 1, "avg_review_rating": 3.0}
    )
    vetting_agent._graph_store.detect_suspicious_patterns = AsyncMock(
        return_value={"suspicious": False}
    )
    vetting_agent._graph_store.get_contractor_building_history = AsyncMock(return_value=[])
    vetting_agent.rag.retrieve = AsyncMock(return_value=[])
    vetting_agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "Vetting report..."}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )

    result = await vetting_agent.run(sample_agent_state)

    # With low scores, should be manual_review or rejected
    action = result["actions_taken"][-1]
    assert action["action"] in ("vetting_manual_review", "vetting_rejected")
