"""Unit tests for orchestrator state contract validation."""

import pytest

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


def test_validate_agent_state_defaults_contract_version_when_missing():
    """Contract version should default to v1 if caller omits it."""
    base = _valid_state()
    base.pop("state_contract_version")

    validated = validate_agent_state(base, context="test.default_contract_version")
    assert validated["state_contract_version"] == 1


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


def test_validate_agent_state_normalizes_action_envelope_defaults():
    """Missing optional action fields should be normalized to safe defaults."""
    base = _valid_state()
    base["actions_taken"] = [
        {
            "agent": "router",
            "action": "clarification_needed",
            "response": {"type": "text", "message": "Please clarify"},
        }
    ]

    validated = validate_agent_state(base, context="test.normalize_actions")
    action = validated["actions_taken"][0]

    assert action["requires_followup"] is False
    assert action["details"] == {}
    assert action["entities_to_pass"] == {}


def test_validate_agent_state_rejects_action_without_required_fields():
    """Actions missing required fields should fail validation."""
    base = _valid_state()
    base["actions_taken"] = [{"action": "oops_missing_agent"}]

    with pytest.raises(ValueError, match="Invalid agent state"):
        validate_agent_state(base, context="test.invalid_action")
