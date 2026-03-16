"""Extended unit tests for payment services."""

from unittest.mock import MagicMock, patch

import pytest

import src.services.payment as pay_module
from src.services.payment import MockPaymentProvider, get_payment_provider

# ---------------------------------------------------------------------------
# MockPaymentProvider
# ---------------------------------------------------------------------------


@pytest.fixture
def provider():
    return MockPaymentProvider()


@pytest.mark.asyncio
async def test_create_charge_returns_transaction(provider):
    result = await provider.create_charge(
        amount=1500.0,
        currency="ILS",
        customer_id="cus_abc",
        metadata={"offer_id": "offer-1"},
    )
    assert result["status"] == "succeeded"
    assert result["amount"] == 1500.0
    assert result["currency"] == "ILS"
    assert result["customer_id"] == "cus_abc"
    assert result["transaction_id"].startswith("txn_")
    assert "created_at" in result


@pytest.mark.asyncio
async def test_create_charge_no_metadata(provider):
    result = await provider.create_charge(500.0, "ILS", "cus_xyz")
    assert result["metadata"] == {}


@pytest.mark.asyncio
async def test_refund_full(provider):
    result = await provider.refund("txn_123")
    assert result["status"] == "refunded"
    assert result["transaction_id"] == "txn_123"
    assert result["refund_id"].startswith("rfd_")
    assert result["amount"] is None


@pytest.mark.asyncio
async def test_refund_partial(provider):
    result = await provider.refund("txn_456", amount=200.0)
    assert result["amount"] == 200.0
    assert result["status"] == "refunded"


@pytest.mark.asyncio
async def test_get_status(provider):
    result = await provider.get_status("txn_789")
    assert result["transaction_id"] == "txn_789"
    assert result["status"] == "succeeded"
    assert "checked_at" in result


@pytest.mark.asyncio
async def test_create_customer(provider):
    customer_id = await provider.create_customer("user-1", "alice@example.com")
    assert customer_id.startswith("cus_")


# ---------------------------------------------------------------------------
# get_payment_provider factory
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset the module-level singleton before and after each test."""
    pay_module._payment_provider = None
    yield
    pay_module._payment_provider = None


def test_get_payment_provider_mock():
    mock_settings = MagicMock()
    mock_settings.PAYMENT_PROVIDER = "mock"
    mock_settings.ENVIRONMENT = "test"
    mock_settings.STRIPE_SECRET_KEY = None

    with patch("src.config.settings.get_settings", return_value=mock_settings):
        p = get_payment_provider()

    assert isinstance(p, MockPaymentProvider)


def test_get_payment_provider_mock_blocked_in_production():
    mock_settings = MagicMock()
    mock_settings.PAYMENT_PROVIDER = "mock"
    mock_settings.ENVIRONMENT = "production"
    mock_settings.STRIPE_SECRET_KEY = None

    with patch("src.config.settings.get_settings", return_value=mock_settings):
        with pytest.raises(RuntimeError, match="not allowed in production"):
            get_payment_provider()


def test_get_payment_provider_unknown_raises():
    mock_settings = MagicMock()
    mock_settings.PAYMENT_PROVIDER = "paypal"

    with patch("src.config.settings.get_settings", return_value=mock_settings):
        with pytest.raises(RuntimeError, match="Unknown PAYMENT_PROVIDER"):
            get_payment_provider()


def test_get_payment_provider_stripe_no_key_raises():
    mock_settings = MagicMock()
    mock_settings.PAYMENT_PROVIDER = "stripe"
    mock_settings.STRIPE_SECRET_KEY = None

    with patch("src.config.settings.get_settings", return_value=mock_settings):
        with pytest.raises(RuntimeError, match="STRIPE_SECRET_KEY"):
            get_payment_provider()


def test_get_payment_provider_returns_singleton():
    mock_settings = MagicMock()
    mock_settings.PAYMENT_PROVIDER = "mock"
    mock_settings.ENVIRONMENT = "test"

    with patch("src.config.settings.get_settings", return_value=mock_settings):
        p1 = get_payment_provider()
        p2 = get_payment_provider()

    assert p1 is p2
