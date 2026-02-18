"""Unit tests for the Notification Agent."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.agents.notification import NotificationAgent

# =====================================================================
# Fixture
# =====================================================================


@pytest.fixture
def notification_agent():
    """Create a NotificationAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()

        agent = NotificationAgent()
        agent.llm_client = AsyncMock()
        yield agent


@pytest.fixture
def notification_state(sample_agent_state):
    """Create a state tailored for notification tests."""
    state = dict(sample_agent_state)
    state["current_agent"] = "notification"
    return state


# =====================================================================
# _resolve_notification_type
# =====================================================================


class TestResolveNotificationType:
    """Tests for _resolve_notification_type."""

    def test_resolve_notification_type_explicit(self, notification_agent, notification_state):
        """State has explicit notification_type='welcome' → returns 'welcome'."""
        notification_state["notification_type"] = "welcome"
        result = notification_agent._resolve_notification_type(notification_state)
        assert result == "welcome"

    def test_resolve_notification_type_from_actions_payment(self, notification_agent, notification_state):
        """State has actions_taken with agent='payment' → returns 'payment_reminder'."""
        notification_state["actions_taken"] = [{"agent": "payment", "action": "payment_status_check"}]
        result = notification_agent._resolve_notification_type(notification_state)
        assert result == "payment_reminder"

    def test_resolve_notification_type_matching(self, notification_agent, notification_state):
        """State has actions with agent='matching' → 'contractor_matched'."""
        notification_state["actions_taken"] = [{"agent": "matching", "action": "contractor_found"}]
        result = notification_agent._resolve_notification_type(notification_state)
        assert result == "contractor_matched"

    def test_resolve_notification_type_escalation(self, notification_agent, notification_state):
        """State has actions with agent='support' → 'escalation_update'."""
        notification_state["actions_taken"] = [{"agent": "support", "action": "escalation_created"}]
        result = notification_agent._resolve_notification_type(notification_state)
        assert result == "escalation_update"

    def test_resolve_notification_type_default(self, notification_agent, notification_state):
        """No context clues → defaults to 'offer_update'."""
        notification_state["actions_taken"] = []
        notification_state["intent"] = None
        result = notification_agent._resolve_notification_type(notification_state)
        assert result == "offer_update"

    def test_resolve_notification_type_from_intent(self, notification_agent, notification_state):
        """Payment intent in state → 'payment_reminder'."""
        notification_state["actions_taken"] = []
        notification_state["intent"] = "payment_question"
        result = notification_agent._resolve_notification_type(notification_state)
        assert result == "payment_reminder"


# =====================================================================
# _resolve_channels
# =====================================================================


class TestResolveChannels:
    """Tests for _resolve_channels."""

    def test_resolve_channels_explicit(self, notification_agent, notification_state):
        """State has explicit notification_channels → returns those."""
        notification_state["notification_channels"] = ["push", "email"]
        result = notification_agent._resolve_channels(notification_state)
        assert result == ["push", "email"]

    def test_resolve_channels_default(self, notification_agent, notification_state):
        """No explicit channels → ['in_app', 'email']."""
        result = notification_agent._resolve_channels(notification_state)
        assert result == ["in_app", "email"]

    def test_resolve_channels_filters_invalid(self, notification_agent, notification_state):
        """Explicit channels with invalid entries → filtered out."""
        notification_state["notification_channels"] = ["push", "sms", "email", "telegram"]
        result = notification_agent._resolve_channels(notification_state)
        assert result == ["push", "email"]
        assert "sms" not in result
        assert "telegram" not in result


# =====================================================================
# run – sends to all channels
# =====================================================================


@pytest.mark.asyncio
async def test_run_sends_to_all_channels(notification_agent, notification_state):
    """Mock _craft_message and _dispatch. Verify notifications_dispatched with correct count."""
    agent = notification_agent
    notification_state["notification_channels"] = ["email", "push", "in_app"]

    crafted_message = {
        "channel": "email",
        "subject": "עדכון הצעה",
        "body": "ההצעה שלך עודכנה בהצלחה.",
        "cta_text": "צפה בהצעה",
        "cta_url": "https://app.groupio.co/offers/123",
    }

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": f"```json\n{json.dumps(crafted_message)}\n```"}],
            "usage": {"input_tokens": 80, "output_tokens": 60},
        }
    )

    result = await agent.run(notification_state)

    action = result["actions_taken"][0]
    assert action["agent"] == "notification"
    assert action["action"] == "notifications_dispatched"
    assert action["details"]["channels"] == ["email", "push", "in_app"]

    results = action["details"]["results"]
    assert len(results) == 3
    for r in results:
        assert r["status"] == "sent"


# =====================================================================
# run – handles dispatch failure on one channel
# =====================================================================


@pytest.mark.asyncio
async def test_run_handles_dispatch_failure(notification_agent, notification_state):
    """_dispatch raises on one channel → status='failed' for that, 'sent' for others."""
    agent = notification_agent
    notification_state["notification_channels"] = ["email", "push"]

    crafted_message = {
        "channel": "email",
        "subject": "Test",
        "body": "Test body",
        "cta_text": "",
        "cta_url": "",
    }

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": f"```json\n{json.dumps(crafted_message)}\n```"}],
            "usage": {"input_tokens": 50, "output_tokens": 30},
        }
    )

    # Make _dispatch fail only for the 'push' channel
    async def failing_dispatch(channel, user_profile, message):
        if channel == "push":
            raise RuntimeError("Push service unavailable")
        # For other channels, just log (default behaviour)
        return None

    agent._dispatch = failing_dispatch

    result = await agent.run(notification_state)

    action = result["actions_taken"][0]
    results = action["details"]["results"]
    assert len(results) == 2

    email_result = [r for r in results if r["channel"] == "email"][0]
    assert email_result["status"] == "sent"

    push_result = [r for r in results if r["channel"] == "push"][0]
    assert push_result["status"] == "failed"
    assert "Push service unavailable" in push_result["error"]


# =====================================================================
# _build_context_summary
# =====================================================================


class TestBuildContextSummary:
    """Tests for _build_context_summary."""

    def test_build_context_summary_with_full_state(self, notification_agent, notification_state):
        """State has user_profile, active_offers, building_context → all parts present."""
        notification_state["user_profile"] = {
            "full_name": "Yael Cohen",
            "email": "yael@example.com",
        }
        notification_state["active_offers"] = [
            {"title": "AC Group Buy"},
            {"title": "Kitchen Renovation"},
        ]
        notification_state["building_context"] = {
            "address": "Rothschild 15",
        }
        notification_state["actions_taken"] = [
            {
                "agent": "matching",
                "action": "contractor_found",
                "response": {"message": "Found 3 contractors"},
            }
        ]

        result = NotificationAgent._build_context_summary(notification_state, "offer_update")

        assert "Yael Cohen" in result
        assert "yael@example.com" in result
        assert "AC Group Buy" in result
        assert "Rothschild 15" in result
        assert "Found 3 contractors" in result

    def test_build_context_summary_empty_state(self, notification_agent):
        """Empty state → 'No additional context'."""
        empty_state = {
            "user_profile": {},
            "active_offers": [],
            "building_context": {},
            "actions_taken": [],
        }
        result = NotificationAgent._build_context_summary(empty_state, "offer_update")
        assert "No additional context" in result


# =====================================================================
# _craft_message – JSON parsing
# =====================================================================


@pytest.mark.asyncio
async def test_craft_message_parses_json(notification_agent, notification_state):
    """LLM returns valid JSON → parsed correctly."""
    agent = notification_agent

    expected = {
        "channel": "email",
        "subject": "עדכון חדש",
        "body": "יש לך עדכון חדש בחשבונך.",
        "cta_text": "צפה עכשיו",
        "cta_url": "https://app.groupio.co",
    }

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": f"```json\n{json.dumps(expected)}\n```"}],
            "usage": {"input_tokens": 60, "output_tokens": 40},
        }
    )

    result = await agent._craft_message(
        state=notification_state,
        notification_type="offer_update",
        channel="email",
        preferred_language="he",
    )

    assert result["subject"] == "עדכון חדש"
    assert result["body"] == "יש לך עדכון חדש בחשבונך."
    assert result["cta_url"] == "https://app.groupio.co"


# =====================================================================
# _craft_message – fallback on non-JSON
# =====================================================================


@pytest.mark.asyncio
async def test_craft_message_fallback(notification_agent, notification_state):
    """LLM returns non-JSON → fallback structure with body."""
    agent = notification_agent

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "Here is your notification update in plain text.",
            "usage": {"input_tokens": 50, "output_tokens": 20},
        }
    )

    result = await agent._craft_message(
        state=notification_state,
        notification_type="offer_update",
        channel="email",
        preferred_language="en",
    )

    # Fallback structure
    assert "body" in result
    assert "notification update" in result["body"]
    assert result["channel"] == "email"
    assert result["subject"] == "Offer Update"
