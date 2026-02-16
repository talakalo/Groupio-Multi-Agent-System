"""Unit tests for the OfferLifecycleManager."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workers.offer_lifecycle import OfferLifecycleManager

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def mock_db():
    """Mock Postgres client for lifecycle tests."""
    db = AsyncMock()
    db.get_offer = AsyncMock(return_value=None)
    db.update_offer = AsyncMock()
    db.get_offer_participants = AsyncMock(return_value=[])
    return db


@pytest.fixture
def mock_invoice_svc():
    """Mock InvoiceService."""
    svc = AsyncMock()
    svc.create_invoice = AsyncMock(
        return_value={
            "id": "inv_1",
            "total": 1220.0,
        }
    )
    svc.split_payment = AsyncMock(return_value=[])
    svc.get_offer_invoice = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def lifecycle(mock_db, mock_invoice_svc):
    """Create OfferLifecycleManager with mocked dependencies."""
    with (
        patch("src.workers.offer_lifecycle.get_postgres_client", return_value=mock_db),
        patch("src.workers.offer_lifecycle.get_invoice_service", return_value=mock_invoice_svc),
    ):
        mgr = OfferLifecycleManager()
        yield mgr


# ------------------------------------------------------------------
# on_participant_joined
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_on_participant_joined_auto_publish(lifecycle, mock_db):
    """Draft offer with enough participants is auto-published."""
    mock_db.get_offer.return_value = {
        "id": "off_1",
        "status": "draft",
        "current_participants": 5,
        "min_participants": 5,
    }

    result = await lifecycle.on_participant_joined("off_1", "user_1")

    assert result["action"] == "auto_published"
    mock_db.update_offer.assert_called_once_with("off_1", {"status": "pending"})


@pytest.mark.asyncio
async def test_on_participant_joined_start_matching(lifecycle, mock_db):
    """Pending offer meeting threshold moves to matching."""
    mock_db.get_offer.return_value = {
        "id": "off_1",
        "status": "pending",
        "current_participants": 10,
        "min_participants": 5,
    }

    result = await lifecycle.on_participant_joined("off_1", "user_2")

    assert result["action"] == "matching_started"
    mock_db.update_offer.assert_called_once_with("off_1", {"status": "matching"})


@pytest.mark.asyncio
async def test_on_participant_joined_below_threshold(lifecycle, mock_db):
    """Below minimum → action='none'."""
    mock_db.get_offer.return_value = {
        "id": "off_1",
        "status": "draft",
        "current_participants": 2,
        "min_participants": 5,
    }

    result = await lifecycle.on_participant_joined("off_1", "user_3")

    assert result["action"] == "none"
    mock_db.update_offer.assert_not_called()


@pytest.mark.asyncio
async def test_on_participant_joined_offer_not_found(lifecycle, mock_db):
    """Non-existent offer returns action='none', reason='offer_not_found'."""
    mock_db.get_offer.return_value = None

    result = await lifecycle.on_participant_joined("off_missing", "user_4")

    assert result["action"] == "none"
    assert result["reason"] == "offer_not_found"


# ------------------------------------------------------------------
# on_contractor_matched
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_on_contractor_matched_generates_invoice(lifecycle, mock_db, mock_invoice_svc):
    """Matching generates an invoice and splits payment among participants."""
    mock_db.get_offer.return_value = {
        "id": "off_1",
        "base_price": 1000,
    }
    mock_db.get_offer_participants.return_value = [
        {"user_id": "u1"},
        {"user_id": "u2"},
    ]

    result = await lifecycle.on_contractor_matched("off_1", "con_1")

    assert result["action"] == "invoice_generated"
    assert result["invoice_id"] == "inv_1"
    mock_invoice_svc.create_invoice.assert_called_once_with(
        offer_id="off_1",
        contractor_id="con_1",
        subtotal=1000,
    )
    mock_invoice_svc.split_payment.assert_called_once()


@pytest.mark.asyncio
async def test_on_contractor_matched_no_participants(lifecycle, mock_db, mock_invoice_svc):
    """Invoice is created but split_payment is NOT called for empty participants."""
    mock_db.get_offer.return_value = {
        "id": "off_1",
        "base_price": 500,
    }
    mock_db.get_offer_participants.return_value = []

    result = await lifecycle.on_contractor_matched("off_1", "con_2")

    assert result["action"] == "invoice_generated"
    mock_invoice_svc.create_invoice.assert_called_once()
    mock_invoice_svc.split_payment.assert_not_called()


@pytest.mark.asyncio
async def test_on_contractor_matched_invoice_fails(lifecycle, mock_db, mock_invoice_svc):
    """If invoice creation raises, action='invoice_failed'."""
    mock_db.get_offer.return_value = {"id": "off_1", "base_price": 1000}
    mock_invoice_svc.create_invoice.side_effect = RuntimeError("DB down")

    result = await lifecycle.on_contractor_matched("off_1", "con_3")

    assert result["action"] == "invoice_failed"
    assert "DB down" in result["error"]


# ------------------------------------------------------------------
# on_offer_completed
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_on_offer_completed(lifecycle, mock_db):
    """Updates status to 'completed'."""
    mock_db.get_offer.return_value = {"id": "off_1", "status": "matching"}

    result = await lifecycle.on_offer_completed("off_1")

    assert result["action"] == "completed"
    mock_db.update_offer.assert_called_once_with("off_1", {"status": "completed"})


# ------------------------------------------------------------------
# on_offer_cancelled
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_on_offer_cancelled_no_invoice(lifecycle, mock_db, mock_invoice_svc):
    """No existing invoice → status updated to 'cancelled'."""
    mock_db.get_offer.return_value = {"id": "off_1", "status": "pending"}
    mock_invoice_svc.get_offer_invoice.return_value = None

    result = await lifecycle.on_offer_cancelled("off_1")

    assert result["action"] == "cancelled"
    mock_db.update_offer.assert_called_once_with("off_1", {"status": "cancelled"})


@pytest.mark.asyncio
async def test_on_offer_cancelled_with_paid_invoice(lifecycle, mock_db, mock_invoice_svc):
    """Paid invoice exists → action='refund_needed'."""
    mock_db.get_offer.return_value = {"id": "off_1", "status": "matching"}
    mock_invoice_svc.get_offer_invoice.return_value = {
        "id": "inv_1",
        "status": "paid",
    }

    result = await lifecycle.on_offer_cancelled("off_1")

    assert result["action"] == "refund_needed"
    assert result["invoice_id"] == "inv_1"
    # Status should NOT be updated — refund needed first
    mock_db.update_offer.assert_not_called()


@pytest.mark.asyncio
async def test_on_offer_cancelled_offer_not_found(lifecycle, mock_db):
    """Non-existent offer returns action='none'."""
    mock_db.get_offer.return_value = None

    result = await lifecycle.on_offer_cancelled("off_missing")

    assert result["action"] == "none"
