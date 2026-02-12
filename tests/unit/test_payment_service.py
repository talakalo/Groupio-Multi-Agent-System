"""Unit tests for the MockPaymentProvider."""


import pytest

from src.services.payment import MockPaymentProvider

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def provider():
    return MockPaymentProvider()


# ------------------------------------------------------------------
# create_charge
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_charge_success(provider):
    """create_charge returns a dict with transaction_id, status, amount, currency."""
    result = await provider.create_charge(
        amount=500.0,
        currency="ILS",
        customer_id="cus_abc",
    )

    assert result["status"] == "succeeded"
    assert result["amount"] == 500.0
    assert result["currency"] == "ILS"
    assert result["transaction_id"].startswith("txn_")
    assert "created_at" in result


@pytest.mark.asyncio
async def test_create_charge_with_metadata(provider):
    """Metadata is preserved in the response."""
    meta = {"offer_id": "off_1", "description": "AC install"}
    result = await provider.create_charge(
        amount=1200.0,
        currency="ILS",
        customer_id="cus_xyz",
        metadata=meta,
    )

    assert result["metadata"] == meta


# ------------------------------------------------------------------
# refund
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refund_full(provider):
    """Full refund returns dict with refund_id and status=refunded."""
    result = await provider.refund(transaction_id="txn_abc123")

    assert result["refund_id"].startswith("rfd_")
    assert result["status"] == "refunded"
    assert result["transaction_id"] == "txn_abc123"
    assert result["amount"] is None  # Full refund → no explicit amount


@pytest.mark.asyncio
async def test_refund_partial(provider):
    """Partial refund passes amount through."""
    result = await provider.refund(transaction_id="txn_abc123", amount=250.0)

    assert result["amount"] == 250.0
    assert result["status"] == "refunded"


# ------------------------------------------------------------------
# get_status
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_status(provider):
    """get_status returns transaction_id and status."""
    result = await provider.get_status("txn_abc123")

    assert result["transaction_id"] == "txn_abc123"
    assert result["status"] == "succeeded"
    assert "checked_at" in result


# ------------------------------------------------------------------
# create_customer
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_customer(provider):
    """create_customer returns a string starting with 'cus_'."""
    customer_id = await provider.create_customer("user_42", "user@example.com")

    assert isinstance(customer_id, str)
    assert customer_id.startswith("cus_")


# ------------------------------------------------------------------
# Singleton factory
# ------------------------------------------------------------------


def test_singleton_factory():
    """get_payment_provider() returns the same instance on repeated calls."""
    import src.services.payment as mod

    mod._payment_provider = None

    first = mod.get_payment_provider()
    second = mod.get_payment_provider()
    assert first is second

    # Cleanup
    mod._payment_provider = None
