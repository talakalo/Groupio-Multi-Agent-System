"""Unit tests for the Payment Agent."""

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.payment import PaymentAgent, _detect_sub_intent

# =====================================================================
# _detect_sub_intent (module-level function, no agent needed)
# =====================================================================


class TestDetectSubIntent:
    """Tests for the _detect_sub_intent helper."""

    def test_detect_refund_intent(self):
        """Hebrew refund keyword → refund_request."""
        assert _detect_sub_intent("אני רוצה החזר") == "refund_request"

    def test_detect_refund_intent_english(self):
        """English refund keyword → refund_request."""
        assert _detect_sub_intent("I want a refund please") == "refund_request"

    def test_detect_invoice_intent(self):
        """English invoice keyword → invoice_request."""
        assert _detect_sub_intent("I need my invoice") == "invoice_request"

    def test_detect_invoice_intent_hebrew(self):
        """Hebrew invoice keyword → invoice_request."""
        assert _detect_sub_intent("אני צריך את החשבונית") == "invoice_request"

    def test_detect_payment_status_intent(self):
        """Hebrew payment status keyword → payment_status."""
        assert _detect_sub_intent("מה סטטוס התשלום") == "payment_status"

    def test_detect_payment_status_english(self):
        """English payment keyword → payment_status."""
        assert _detect_sub_intent("What is my payment status?") == "payment_status"

    def test_detect_general_intent(self):
        """No keywords → general."""
        assert _detect_sub_intent("hello") == "general"

    def test_detect_general_no_keywords(self):
        """Completely unrelated text → general."""
        assert _detect_sub_intent("Tell me about the weather") == "general"

    def test_refund_takes_priority_over_payment(self):
        """When both refund and payment keywords appear, refund wins (checked first)."""
        assert _detect_sub_intent("I want a refund for my payment") == "refund_request"


# =====================================================================
# PaymentAgent fixture
# =====================================================================


@pytest.fixture
def payment_agent():
    """Create a PaymentAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
        patch("src.agents.payment.get_postgres_client") as mock_pg,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()

        mock_db = AsyncMock()
        mock_pg.return_value = mock_db

        agent = PaymentAgent()
        agent.llm_client = AsyncMock()

        yield agent, mock_pg


@pytest.fixture
def payment_state(sample_agent_state):
    """Create a state tailored for payment tests."""
    state = dict(sample_agent_state)
    state["current_agent"] = "payment"
    return state


# =====================================================================
# Payment status handler
# =====================================================================


@pytest.mark.asyncio
async def test_payment_status_handler(payment_agent, payment_state):
    """sub_intent=payment_status → payment_status_check action."""
    agent, mock_pg = payment_agent
    payment_state["messages"] = [{"role": "user", "content": "מה סטטוס התשלום שלי?"}]

    mock_db = AsyncMock()
    mock_db.list_payments_for_user = AsyncMock(
        return_value=[
            {
                "id": "pay_001abcdef",
                "amount": 4500.00,
                "status": "completed",
                "offer_id": "offer_001abc",
                "created_at": "2026-01-10",
            },
            {
                "id": "pay_002ghijkl",
                "amount": 2000.00,
                "status": "pending",
                "offer_id": "offer_002def",
                "created_at": "2026-01-15",
            },
        ]
    )
    mock_pg.return_value = mock_db

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "יש לך 2 תשלומים: אחד הושלם ואחד ממתין.",
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )

    result = await agent.run(payment_state)

    assert len(result["actions_taken"]) == 1
    action = result["actions_taken"][0]
    assert action["agent"] == "payment"
    assert action["action"] == "payment_status_check"
    assert action["details"]["payments_found"] == 2
    assert action["response"]["type"] == "payment_status"
    assert len(action["response"]["payments"]) == 2


# =====================================================================
# Invoice request with offer_id
# =====================================================================


@pytest.mark.asyncio
async def test_invoice_request_with_offer_id(payment_agent, payment_state):
    """state has offer_id → invoice found."""
    agent, mock_pg = payment_agent
    payment_state["messages"] = [{"role": "user", "content": "I need my invoice please"}]
    payment_state["offer_id"] = "offer_100"

    mock_db = AsyncMock()
    mock_db.list_payments_for_user = AsyncMock(return_value=[])
    mock_db.get_invoice_for_offer = AsyncMock(
        return_value={
            "id": "inv_001",
            "offer_id": "offer_100",
            "amount": 3500.00,
            "pdf_url": "https://example.com/invoice.pdf",
        }
    )
    mock_pg.return_value = mock_db

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "Here is your invoice for offer_100.",
            "usage": {"input_tokens": 80, "output_tokens": 30},
        }
    )

    result = await agent.run(payment_state)

    action = result["actions_taken"][0]
    assert action["action"] == "invoice_request"
    assert action["details"]["offer_id"] == "offer_100"
    assert action["details"]["invoice_found"] is True
    assert action["response"]["invoice"]["id"] == "inv_001"


# =====================================================================
# Invoice request without offer_id
# =====================================================================


@pytest.mark.asyncio
async def test_invoice_request_no_offer(payment_agent, payment_state):
    """No offer_id in state → response still works, invoice not found."""
    agent, mock_pg = payment_agent
    payment_state["messages"] = [{"role": "user", "content": "אני צריך חשבונית"}]
    # No offer_id in state

    mock_db = AsyncMock()
    mock_db.list_payments_for_user = AsyncMock(return_value=[])
    mock_pg.return_value = mock_db

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "לא נמצאה חשבונית. נא לציין מספר הזמנה.",
            "usage": {"input_tokens": 60, "output_tokens": 30},
        }
    )

    result = await agent.run(payment_state)

    action = result["actions_taken"][0]
    assert action["action"] == "invoice_request"
    assert action["details"]["offer_id"] is None
    assert action["details"]["invoice_found"] is False


# =====================================================================
# Refund request → escalation
# =====================================================================


@pytest.mark.asyncio
async def test_refund_request_escalates(payment_agent, payment_state):
    """Message with refund keyword → needs_human=True, escalation_reason."""
    agent, mock_pg = payment_agent
    payment_state["messages"] = [{"role": "user", "content": "אני רוצה החזר כספי בבקשה"}]

    mock_db = AsyncMock()
    mock_pg.return_value = mock_db

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "בקשת ההחזר שלך התקבלה ותועבר לצוות התמיכה.",
            "usage": {"input_tokens": 80, "output_tokens": 40},
        }
    )

    result = await agent.run(payment_state)

    assert result["needs_human"] is True
    assert result["escalation_reason"] == "refund_request"
    action = result["actions_taken"][0]
    assert action["action"] == "refund_escalated"
    assert action["requires_followup"] is True


# =====================================================================
# General handler
# =====================================================================


@pytest.mark.asyncio
async def test_general_handler(payment_agent, payment_state):
    """Message doesn't match any sub-intent → general_payment_info action."""
    agent, mock_pg = payment_agent
    payment_state["messages"] = [{"role": "user", "content": "hello, I have a question"}]

    mock_db = AsyncMock()
    mock_pg.return_value = mock_db

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "Hello! How can I help you with payments?",
            "usage": {"input_tokens": 40, "output_tokens": 20},
        }
    )

    result = await agent.run(payment_state)

    action = result["actions_taken"][0]
    assert action["action"] == "general_payment_info"
    assert action["response"]["type"] == "payment_info"


# =====================================================================
# _summarise_payments
# =====================================================================


class TestSummarisePayments:
    """Tests for the _summarise_payments static method."""

    def test_summarise_payments_empty(self):
        """Empty list → 'No payments found' message."""
        result = PaymentAgent._summarise_payments([])
        assert "No payments found" in result

    def test_summarise_payments_with_data(self):
        """Sample data → formatted string with amounts and statuses."""
        payments = [
            {
                "id": "pay_abcdefgh12345",
                "amount": 4500.00,
                "status": "completed",
                "offer_id": "offer_xyz12345",
                "created_at": "2026-01-10",
            },
            {
                "id": "pay_ijklmnop67890",
                "amount": 2000.00,
                "status": "pending",
                "offer_id": "offer_uvw67890",
                "created_at": "2026-01-15",
            },
        ]
        result = PaymentAgent._summarise_payments(payments)

        assert "₪4,500.00" in result
        assert "₪2,000.00" in result
        assert "completed" in result
        assert "pending" in result
        assert "pay_abcd" in result  # first 8 chars of id


# =====================================================================
# _extract_text
# =====================================================================


class TestExtractText:
    """Tests for the _extract_text static method."""

    def test_extract_text_from_string(self):
        """Content is a string → returns string directly."""
        result = PaymentAgent._extract_text({"content": "hello"})
        assert result == "hello"

    def test_extract_text_from_list(self):
        """Content is a list of blocks → joins text blocks."""
        result = PaymentAgent._extract_text(
            {
                "content": [
                    {"type": "text", "text": "hello"},
                    {"type": "text", "text": "world"},
                ]
            }
        )
        assert result == "hello world"

    def test_extract_text_from_list_filters_non_text(self):
        """Non-text blocks are filtered out."""
        result = PaymentAgent._extract_text(
            {
                "content": [
                    {"type": "image", "url": "http://example.com/img.png"},
                    {"type": "text", "text": "only text"},
                ]
            }
        )
        assert result == "only text"

    def test_extract_text_empty_content(self):
        """No content key → returns empty string."""
        result = PaymentAgent._extract_text({})
        assert result == ""
