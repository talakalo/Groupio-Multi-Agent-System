"""Unit tests for agent action envelope normalization."""

import pytest
from pydantic import ValidationError

from src.models.agent_actions import normalize_actions


def test_normalize_actions_adds_safe_defaults():
    actions = [
        {
            "agent": "support",
            "action": "support_response",
            "response": {"type": "support", "message": "hi"},
        }
    ]

    normalized = normalize_actions(actions)
    assert len(normalized) == 1
    assert normalized[0]["requires_followup"] is False
    assert normalized[0]["details"] == {}
    assert normalized[0]["summary_for_next_agent"] == ""


def test_normalize_actions_preserves_extra_fields():
    actions = [
        {
            "agent": "matching",
            "action": "contractors_found",
            "response": {"type": "contractor_matches", "message": "ok"},
            "contractors": [{"id": "c1"}],
        }
    ]

    normalized = normalize_actions(actions)
    assert normalized[0]["contractors"] == [{"id": "c1"}]


def test_normalize_actions_requires_agent_and_action():
    with pytest.raises(ValidationError):
        normalize_actions([{"response": {"type": "text"}}])
