"""Unit tests for the InvoiceService."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from src.services.invoice import InvoiceService

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def mock_db():
    """Shared mock Postgres client for invoice tests."""
    db = AsyncMock()
    db.create_invoice = AsyncMock(side_effect=lambda data: data)
    db.get_next_invoice_number = AsyncMock(return_value="00042")
    db.create_payment_split = AsyncMock(side_effect=lambda data: data)
    db.update_invoice = AsyncMock(side_effect=lambda _id, data: {"id": _id, **data})
    db.list_invoices_for_user = AsyncMock(return_value=[{"id": "inv_1"}])
    db.get_invoice_by_offer = AsyncMock(return_value={"id": "inv_1", "offer_id": "off_1"})
    return db


@pytest.fixture
def invoice_svc(mock_db):
    """Create InvoiceService with mocked DB."""
    with patch("src.services.invoice.get_postgres_client", return_value=mock_db):
        svc = InvoiceService()
        yield svc


# ------------------------------------------------------------------
# create_invoice
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_invoice_calculates_correctly(invoice_svc, mock_db):
    """Verify tax, platform_fee, and total calculations."""
    result = await invoice_svc.create_invoice(
        offer_id="off_1",
        contractor_id="con_1",
        subtotal=1000,
        tax_rate=0.17,
        platform_fee_rate=0.05,
    )

    assert result["subtotal"] == 1000
    assert result["tax"] == 170.0
    assert result["platform_fee"] == 50.0
    assert result["total"] == 1220.0
    assert result["status"] == "pending"


@pytest.mark.asyncio
async def test_create_invoice_calls_db(invoice_svc, mock_db):
    """Verify db.create_invoice is called with the correct data."""
    await invoice_svc.create_invoice(
        offer_id="off_1",
        contractor_id="con_1",
        subtotal=500,
    )

    mock_db.create_invoice.assert_called_once()
    call_data = mock_db.create_invoice.call_args[0][0]
    assert call_data["offer_id"] == "off_1"
    assert call_data["contractor_id"] == "con_1"
    assert call_data["subtotal"] == 500
    assert "id" in call_data
    assert "invoice_number" in call_data


# ------------------------------------------------------------------
# generate_invoice_number
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_invoice_number(invoice_svc, mock_db):
    """Invoice number follows INV-{year}-{seq} format."""
    number = await invoice_svc.generate_invoice_number()

    year = datetime.now(timezone.utc).year
    assert number == f"INV-{year}-00042"
    mock_db.get_next_invoice_number.assert_called_once()


# ------------------------------------------------------------------
# split_payment
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_split_payment_creates_splits(invoice_svc, mock_db):
    """With 3 participants, db.create_payment_split is called 3 times."""
    participants = [
        {"user_id": "u1", "amount": 400.0},
        {"user_id": "u2", "amount": 400.0},
        {"user_id": "u3", "amount": 400.0},
    ]

    splits = await invoice_svc.split_payment("inv_1", participants)

    assert len(splits) == 3
    assert mock_db.create_payment_split.call_count == 3

    # Verify each split has the right user_id
    user_ids = {s["user_id"] for s in splits}
    assert user_ids == {"u1", "u2", "u3"}


# ------------------------------------------------------------------
# mark_as_paid
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_as_paid(invoice_svc, mock_db):
    """mark_as_paid calls db.update_invoice with status=paid and transaction_id."""
    payment_data = {"transaction_id": "txn_xyz", "payment_method": "credit_card"}

    await invoice_svc.mark_as_paid("inv_1", payment_data)

    mock_db.update_invoice.assert_called_once()
    call_args = mock_db.update_invoice.call_args
    assert call_args[0][0] == "inv_1"
    update = call_args[0][1]
    assert update["status"] == "paid"
    assert update["transaction_id"] == "txn_xyz"


# ------------------------------------------------------------------
# Queries
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_invoices(invoice_svc, mock_db):
    """Delegates to db.list_invoices_for_user."""
    result = await invoice_svc.get_user_invoices("user_42")

    mock_db.list_invoices_for_user.assert_called_once_with("user_42")
    assert result == [{"id": "inv_1"}]


@pytest.mark.asyncio
async def test_get_offer_invoice(invoice_svc, mock_db):
    """Delegates to db.get_invoice_by_offer."""
    result = await invoice_svc.get_offer_invoice("off_1")

    mock_db.get_invoice_by_offer.assert_called_once_with("off_1")
    assert result == {"id": "inv_1", "offer_id": "off_1"}
