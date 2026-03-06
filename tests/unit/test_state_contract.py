"""Unit tests for orchestrator state contract validation."""

import pytest

from src.orchestration.state import create_initial_state
from src.orchestration.state_contract import validate_agent_state


def _valid_state() -> dict:
    return {
        "user_id": "u1",
        "building_id": None,
        "conversation_id": "c1",
        "messages": [{"role": "user", "content": "hello"}],
        "current_agent": "router",
        "intent": None,
        "confidence": 0.0,
        "user_profile": {},
        "building_context": {},
        "active_offers": [],
        "entities": None,
        "last_agent_handoff": None,
        "context_for_next_agent": None,
        "rag_results": [],
        "actions_taken": [],
        "needs_human": False,
        "escalation_reason": None,
        "final_response": None,
        "start_time": "2024-01-01T00:00:00+00:00",
        "tokens_used": 0,
        "state_contract_version": 1,
    }


def test_create_initial_state_includes_contract_version():
    """Initial state should include state contract metadata and validate."""
    state = create_initial_state(user_message="hello", user_id="user-1")
    assert state["state_contract_version"] == 1


def test_validate_agent_state_accepts_active_agents():
    """Contract should accept all currently active orchestrator agents."""
    base = _valid_state()

    base["current_agent"] = "payment"
    validated_payment = validate_agent_state(base, context="test.payment")
    assert validated_payment["current_agent"] == "payment"

    base["current_agent"] = "architecture"
    validated_architecture = validate_agent_state(base, context="test.architecture")
    assert validated_architecture["current_agent"] == "architecture"


def test_validate_agent_state_rejects_unknown_agent():
    """Unknown current_agent values should be rejected."""
    base = _valid_state()
    base["current_agent"] = "unknown-agent"

    with pytest.raises(ValueError, match="Invalid agent state"):
        validate_agent_state(base, context="test.invalid_agent")


def test_validate_agent_state_rejects_invalid_start_time():
    """Non-ISO start_time values should fail validation."""
    base = _valid_state()
    base["start_time"] = "not-a-datetime"

    with pytest.raises(ValueError, match="start_time must be ISO format"):
        validate_agent_state(base, context="test.invalid_start_time")
