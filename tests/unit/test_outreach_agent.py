"""Tests for the Outreach Agent."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

from src.agents.outreach import OutreachAgent


@pytest.fixture
def outreach_agent():
    """Create outreach agent instance."""
    with patch("src.agents.outreach.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(
            PRIMARY_MODEL="claude-sonnet-4-20250514",
            MAX_TOKENS=4000,
            TEMPERATURE=0.7,
        )
        agent = OutreachAgent()
        agent.llm_client = AsyncMock()
        agent.rag_client = AsyncMock()
        agent.db_client = AsyncMock()
        agent.redis_client = AsyncMock()
        yield agent


@pytest.fixture
def sample_state():
    """Create sample agent state."""
    return {
        "user_message": "Send offer notifications to contractors",
        "user_id": "system",
        "intent": "outreach",
        "confidence": 0.9,
        "messages": [],
        "actions_taken": [],
        "needs_human": False,
    }


@pytest.fixture
def sample_offer():
    """Sample offer for outreach."""
    return {
        "id": "offer-123",
        "title": "AC Installation for Building A",
        "category": "ac_installation",
        "base_price": 5000.0,
        "current_participants": 10,
        "building_id": "building-123",
        "region": "center",
    }


@pytest.fixture
def sample_contractors():
    """Sample contractors for outreach."""
    return [
        {
            "id": "contractor-1",
            "business_name": "AC Pro",
            "email": "info@acpro.com",
            "phone": "0501234567",
            "categories": ["ac_installation"],
            "regions": ["center"],
            "trust_score": 85,
        },
        {
            "id": "contractor-2",
            "business_name": "Cool Solutions",
            "email": "info@coolsolutions.com",
            "phone": "0509876543",
            "categories": ["ac_installation"],
            "regions": ["center", "tel_aviv"],
            "trust_score": 78,
        },
    ]


class TestOutreachAgent:
    """Test suite for OutreachAgent."""

    @pytest.mark.asyncio
    async def test_find_matching_contractors(self, outreach_agent, sample_state, sample_offer, sample_contractors):
        """Test finding contractors for an offer."""
        sample_state["actions_taken"] = [{"details": {"offer": sample_offer}}]
        outreach_agent.db_client.find_contractors_for_offer = AsyncMock(return_value=sample_contractors)

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_personalize_message(self, outreach_agent, sample_contractors):
        """Test message personalization."""
        contractor = sample_contractors[0]

        outreach_agent.llm_client.call = AsyncMock(return_value="""
            שלום AC Pro,
            יש לנו הזדמנות מעולה עבורכם - פרויקט התקנת מזגנים בבניין A.
            עם 10 דיירים שכבר הצטרפו, זה יכול להיות פרויקט רווחי.
        """)

        message = await outreach_agent._personalize_message(
            contractor,
            template="offer_notification",
            context={"offer_title": "AC Installation", "participants": 10},
        )

        assert "AC Pro" in message
        outreach_agent.llm_client.call.assert_called_once()

    @pytest.mark.asyncio
    async def test_ab_testing(self, outreach_agent, sample_contractors):
        """Test A/B testing for messages."""
        outreach_agent.redis_client.get_ab_variant = AsyncMock(return_value="A")
        outreach_agent.redis_client.track_ab_impression = AsyncMock()

        variant = await outreach_agent._get_ab_variant(
            "offer-123",
            sample_contractors[0]["id"],
        )

        assert variant in ["A", "B"]

    @pytest.mark.asyncio
    async def test_schedule_campaign(self, outreach_agent, sample_state):
        """Test scheduling an outreach campaign."""
        sample_state["user_message"] = "Schedule notification for tomorrow at 10am"

        outreach_agent.db_client.create_campaign = AsyncMock(return_value={
            "id": "campaign-123",
            "scheduled_at": datetime.now() + timedelta(days=1),
            "status": "scheduled",
        })

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_send_whatsapp_notification(self, outreach_agent, sample_contractors):
        """Test sending WhatsApp notification."""
        with patch("src.services.whatsapp_bot.get_whatsapp_bot") as mock_wa:
            mock_wa.return_value.send_message = AsyncMock(return_value=True)

            success = await outreach_agent._send_whatsapp(
                sample_contractors[0]["phone"],
                "Test message",
            )

            assert success

    @pytest.mark.asyncio
    async def test_send_email_notification(self, outreach_agent, sample_contractors):
        """Test sending email notification."""
        outreach_agent._email_client = AsyncMock()
        outreach_agent._email_client.send = AsyncMock(return_value=True)

        success = await outreach_agent._send_email(
            sample_contractors[0]["email"],
            "New Offer Opportunity",
            "You have a new offer opportunity...",
        )

        assert success

    @pytest.mark.asyncio
    async def test_track_delivery(self, outreach_agent):
        """Test tracking message delivery."""
        outreach_agent.db_client.log_outreach = AsyncMock()

        await outreach_agent._track_delivery(
            contractor_id="contractor-1",
            offer_id="offer-123",
            channel="whatsapp",
            status="delivered",
        )

        outreach_agent.db_client.log_outreach.assert_called_once()

    @pytest.mark.asyncio
    async def test_rate_limiting(self, outreach_agent, sample_contractors):
        """Test rate limiting for outreach."""
        outreach_agent.redis_client.check_outreach_limit = AsyncMock(return_value=False)

        # Should not send if rate limited
        can_send = await outreach_agent._check_rate_limit(sample_contractors[0]["id"])

        assert not can_send

    @pytest.mark.asyncio
    async def test_campaign_analytics(self, outreach_agent):
        """Test getting campaign analytics."""
        outreach_agent.db_client.get_campaign_stats = AsyncMock(return_value={
            "sent": 100,
            "delivered": 95,
            "opened": 50,
            "responded": 20,
            "conversion_rate": 20.0,
        })

        stats = await outreach_agent._get_campaign_stats("campaign-123")

        assert stats["sent"] == 100
        assert stats["conversion_rate"] == 20.0

    @pytest.mark.asyncio
    async def test_opt_out_handling(self, outreach_agent, sample_contractors):
        """Test handling contractor opt-out."""
        outreach_agent.db_client.is_opted_out = AsyncMock(return_value=True)

        opted_out = await outreach_agent._check_opt_out(sample_contractors[0]["id"])

        assert opted_out

    @pytest.mark.asyncio
    async def test_follow_up_scheduling(self, outreach_agent, sample_state):
        """Test scheduling follow-up messages."""
        sample_state["user_message"] = "Schedule follow-up for non-responders"

        outreach_agent.db_client.get_non_responders = AsyncMock(return_value=[
            {"contractor_id": "c1", "last_contact": datetime.now() - timedelta(days=3)},
        ])
        outreach_agent.db_client.schedule_follow_up = AsyncMock()

        result = await outreach_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_template_selection(self, outreach_agent, sample_offer):
        """Test selecting appropriate message template."""
        template = await outreach_agent._select_template(
            offer_type="new",
            contractor_history="active",
            urgency="normal",
        )

        assert template is not None

    @pytest.mark.asyncio
    async def test_metrics_retrieval(self, outreach_agent):
        """Test getting agent metrics."""
        outreach_agent._call_count = 50
        outreach_agent._error_count = 2
        outreach_agent._total_latency = 25.0

        metrics = await outreach_agent.get_metrics()

        assert "calls" in metrics
        assert metrics["calls"] == 50
