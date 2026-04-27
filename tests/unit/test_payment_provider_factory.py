"""Unit tests for ``get_payment_provider`` factory fail-closed behaviour.

The release audit flagged that bit / PayBox providers raise NotImplementedError
at charge time. The factory should instead refuse to hand out a provider
instance at all, so misconfigured boots fail fast during the lifespan probe
rather than at a resident's first checkout.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from src.services import payment as payment_module
from src.services.payment import (
    MockPaymentProvider,
    PaymentProviderUnavailableError,
    StripePaymentProvider,
    get_payment_provider,
)


class _StubSettings:
    def __init__(
        self,
        provider: str,
        environment: str = "development",
        stripe_secret: str = "",
    ) -> None:
        self.PAYMENT_PROVIDER = provider
        self.ENVIRONMENT = environment
        self.STRIPE_SECRET_KEY = stripe_secret


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Reset the module-level singleton between tests."""
    payment_module._payment_provider = None
    yield
    payment_module._payment_provider = None


def test_factory_refuses_bit_even_in_development() -> None:
    with patch("src.config.settings.get_settings", return_value=_StubSettings("bit")):
        with pytest.raises(PaymentProviderUnavailableError, match="[Bb]it"):
            get_payment_provider()


def test_factory_refuses_paybox_even_in_development() -> None:
    with patch("src.config.settings.get_settings", return_value=_StubSettings("paybox")):
        with pytest.raises(PaymentProviderUnavailableError, match="[Pp]ayBox|paybox"):
            get_payment_provider()


def test_factory_refuses_mock_in_production() -> None:
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("mock", environment="production"),
    ):
        with pytest.raises(RuntimeError, match="mock is not allowed"):
            get_payment_provider()


def test_factory_refuses_mock_in_staging() -> None:
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("mock", environment="staging"),
    ):
        with pytest.raises(RuntimeError, match="mock is not allowed"):
            get_payment_provider()


def test_factory_returns_mock_in_development() -> None:
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("mock", environment="development"),
    ):
        provider = get_payment_provider()
    assert isinstance(provider, MockPaymentProvider)


def test_factory_requires_secret_key_for_stripe() -> None:
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("stripe", stripe_secret=""),
    ):
        with pytest.raises(RuntimeError, match="STRIPE_SECRET_KEY"):
            get_payment_provider()


def test_factory_returns_stripe_when_configured() -> None:
    pytest.importorskip("stripe")
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("stripe", stripe_secret="sk_test_123"),
    ):
        provider = get_payment_provider()
    assert isinstance(provider, StripePaymentProvider)


def test_factory_rejects_unknown_provider() -> None:
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("nonesuch"),
    ):
        with pytest.raises(RuntimeError, match="Unknown PAYMENT_PROVIDER"):
            get_payment_provider()


def test_factory_caches_singleton() -> None:
    with patch(
        "src.config.settings.get_settings",
        return_value=_StubSettings("mock", environment="development"),
    ):
        first = get_payment_provider()
        second = get_payment_provider()
    assert first is second
