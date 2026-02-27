"""Abstract payment service with a mock provider for development."""

import logging
from abc import ABC, abstractmethod
from datetime import UTC, datetime
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
            "created_at": datetime.now(UTC).isoformat(),
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
            "created_at": datetime.now(UTC).isoformat(),
        }

    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        logger.info("MockPayment: status check – txn=%s", transaction_id)
        return {
            "transaction_id": transaction_id,
            "status": "succeeded",
            "checked_at": datetime.now(UTC).isoformat(),
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


class StripePaymentProvider(PaymentProvider):
    """Stripe payment provider for production use.

    Requires ``STRIPE_SECRET_KEY`` to be set in settings.
    Install the Stripe SDK before use: ``pip install stripe>=7.0.0``.

    TODO: Complete implementation before enabling in production.
          The skeleton is in place; wire up real Stripe API calls below.
    """

    def __init__(self, secret_key: str) -> None:
        try:
            import stripe  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "stripe package is not installed. Add 'stripe>=7.0.0' to requirements-prod.txt"
            ) from exc
        self._stripe = stripe
        self._stripe.api_key = secret_key

    async def create_charge(
        self,
        amount: float,
        currency: str,
        customer_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a Stripe PaymentIntent.

        TODO: Implement full create_charge → PaymentIntent flow.
              See https://stripe.com/docs/api/payment_intents/create
        """
        raise NotImplementedError(
            "StripePaymentProvider.create_charge is not yet implemented. "
            "Complete the Stripe integration before enabling in production."
        )

    async def refund(
        self,
        transaction_id: str,
        amount: float | None = None,
    ) -> dict[str, Any]:
        """Issue a Stripe refund.

        TODO: Implement via stripe.Refund.create_async(payment_intent=transaction_id).
        """
        raise NotImplementedError(
            "StripePaymentProvider.refund is not yet implemented."
        )

    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        """Retrieve the status of a Stripe PaymentIntent.

        TODO: Implement via stripe.PaymentIntent.retrieve_async(transaction_id).
        """
        raise NotImplementedError(
            "StripePaymentProvider.get_status is not yet implemented."
        )

    async def create_customer(self, user_id: str, email: str) -> str:
        """Create a Stripe Customer record.

        TODO: Implement via stripe.Customer.create_async(email=email, metadata={user_id}).
        """
        raise NotImplementedError(
            "StripePaymentProvider.create_customer is not yet implemented."
        )


# ------------------------------------------------------------------
# Singleton factory
# ------------------------------------------------------------------

_payment_provider: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    """Get or create the singleton PaymentProvider instance.

    Provider is selected by the ``PAYMENT_PROVIDER`` environment variable:
    - ``mock``   — MockPaymentProvider (development / demo only)
    - ``stripe`` — StripePaymentProvider (requires STRIPE_SECRET_KEY)

    In production, the ``mock`` provider is blocked unless explicitly set to
    ``PAYMENT_PROVIDER=mock`` (which logs a loud warning).
    """
    global _payment_provider
    if _payment_provider is None:
        from src.config.settings import get_settings

        settings = get_settings()
        provider_name = settings.PAYMENT_PROVIDER.lower()

        if provider_name == "stripe":
            if not settings.STRIPE_SECRET_KEY:
                raise RuntimeError(
                    "PAYMENT_PROVIDER=stripe but STRIPE_SECRET_KEY is not set. "
                    "Set STRIPE_SECRET_KEY in your environment."
                )
            logger.info("Using StripePaymentProvider")
            _payment_provider = StripePaymentProvider(secret_key=settings.STRIPE_SECRET_KEY)

        elif provider_name == "mock":
            is_prod = settings.ENVIRONMENT == "production"
            if is_prod:
                logger.warning(
                    "MOCK PAYMENT PROVIDER is active in production (PAYMENT_PROVIDER=mock). "
                    "All charges will succeed without real money movement. "
                    "Set PAYMENT_PROVIDER=stripe and configure STRIPE_SECRET_KEY."
                )
            _payment_provider = MockPaymentProvider()

        else:
            raise RuntimeError(
                f"Unknown PAYMENT_PROVIDER={provider_name!r}. "
                "Supported values: 'mock', 'stripe'."
            )

    return _payment_provider
