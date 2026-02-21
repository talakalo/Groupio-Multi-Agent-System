"""Abstract payment service with a mock provider for development."""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)


class PaymentProvider(ABC):
    """Abstract base class for payment providers (Stripe, PayPlus, etc.)."""

    @abstractmethod
    async def create_charge(
        self,
        amount: float,
        currency: str,
        customer_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a charge/payment intent.

        Returns a dict with at least ``transaction_id``, ``status``, and ``amount``.
        """

    @abstractmethod
    async def refund(
        self,
        transaction_id: str,
        amount: float | None = None,
    ) -> dict[str, Any]:
        """Refund a transaction (full or partial).

        Returns a dict with ``refund_id``, ``status``, and ``amount``.
        """

    @abstractmethod
    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        """Get the current status of a transaction.

        Returns a dict with ``transaction_id``, ``status``, and extra provider info.
        """

    @abstractmethod
    async def create_customer(self, user_id: str, email: str) -> str:
        """Register a customer with the payment provider.

        Returns the provider-side customer ID string.
        """


class MockPaymentProvider(PaymentProvider):
    """Simulated payment provider for development and testing.

    All operations succeed immediately and return realistic-looking data.
    """

    async def create_charge(
        self,
        amount: float,
        currency: str,
        customer_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        transaction_id = f"txn_{uuid4().hex}"
        logger.info(
            "MockPayment: charge created – txn=%s amount=%.2f %s customer=%s",
            transaction_id,
            amount,
            currency,
            customer_id,
        )
        return {
            "transaction_id": transaction_id,
            "status": "succeeded",
            "amount": amount,
            "currency": currency,
            "customer_id": customer_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    async def refund(
        self,
        transaction_id: str,
        amount: float | None = None,
    ) -> dict[str, Any]:
        refund_id = f"rfd_{uuid4().hex}"
        logger.info(
            "MockPayment: refund issued – refund=%s txn=%s amount=%s",
            refund_id,
            transaction_id,
            amount,
        )
        return {
            "refund_id": refund_id,
            "transaction_id": transaction_id,
            "status": "refunded",
            "amount": amount,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        logger.info("MockPayment: status check – txn=%s", transaction_id)
        return {
            "transaction_id": transaction_id,
            "status": "succeeded",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    async def create_customer(self, user_id: str, email: str) -> str:
        customer_id = f"cus_{uuid4().hex}"
        logger.info(
            "MockPayment: customer created – customer=%s user=%s email=%s",
            customer_id,
            user_id,
            email,
        )
        return customer_id


# ------------------------------------------------------------------
# Singleton factory
# ------------------------------------------------------------------

_payment_provider: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    """Get or create the singleton PaymentProvider instance.

    In production, this will refuse to start with the mock provider.
    Set ``PAYMENT_PROVIDER=mock`` explicitly to override (e.g. for staging demos).

    Returns ``MockPaymentProvider`` in development/test.
    """
    global _payment_provider
    if _payment_provider is None:
        from src.config.settings import get_settings

        settings = get_settings()

        # In production, block mock provider unless explicitly overridden
        allow_mock = getattr(settings, "PAYMENT_PROVIDER", "") == "mock"
        if settings.ENVIRONMENT == "production" and not allow_mock:
            raise RuntimeError(
                "Cannot use MockPaymentProvider in production. "
                "Integrate a real PSP (Stripe/PayPlus) or set PAYMENT_PROVIDER=mock "
                "to explicitly allow mock payments for demo purposes."
            )

        if settings.ENVIRONMENT in ("production", "staging") and allow_mock:
            logger.warning(
                "MOCK PAYMENT PROVIDER active in %s (PAYMENT_PROVIDER=mock). "
                "All charges will succeed without real processing.",
                settings.ENVIRONMENT,
            )

        _payment_provider = MockPaymentProvider()
    return _payment_provider
