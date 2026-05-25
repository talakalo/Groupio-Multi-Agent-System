"""Payment service — provider abstraction for Stripe, bit, PayBox, and mock.

Provider selection is controlled by the ``PAYMENT_PROVIDER`` environment variable:
  - ``mock``   — MockPaymentProvider (development / demo only)
  - ``stripe`` — StripePaymentProvider (credit card via Stripe)
  - ``bit``    — BitPaymentProvider (Israeli mobile payment — REQUIRES onboarding)
  - ``paybox`` — PayBoxPaymentProvider (Israeli online payment — REQUIRES onboarding)

See docs/PAYMENT_PROVIDER_ONBOARDING.md for how to obtain credentials and go live
with bit or PayBox.
"""

import logging
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)


class PaymentProviderUnavailableError(RuntimeError):
    """Raised when PAYMENT_PROVIDER selects a gateway that cannot process charges yet."""


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
    Install the Stripe SDK: ``pip install stripe>=7.0.0``.
    """

    def __init__(self, secret_key: str) -> None:
        try:
            import stripe  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError("stripe package is not installed. Add 'stripe>=7.0.0' to pyproject.toml") from exc
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

        If ``metadata`` contains ``payment_method_id``, the intent is confirmed
        immediately.  Otherwise it is created in ``requires_payment_method``
        state and the ``client_secret`` must be used by the frontend (Stripe.js)
        to confirm the payment.
        """
        meta = metadata or {}
        params: dict[str, Any] = {
            "amount": int(round(amount * 100)),  # Stripe uses smallest currency unit (agorot for ILS)
            "currency": currency.lower(),
            "customer": customer_id,
            "metadata": meta,
            "automatic_payment_methods": {"enabled": True},
        }

        payment_method_id = meta.get("payment_method_id")
        if payment_method_id:
            params["payment_method"] = payment_method_id
            params["confirm"] = True
            params["automatic_payment_methods"] = {"enabled": True, "allow_redirects": "never"}

        try:
            intent = await self._stripe.PaymentIntent.create_async(**params)
        except self._stripe.StripeError as exc:
            logger.error("Stripe create_charge error: %s", exc)
            raise RuntimeError(f"Payment failed: {getattr(exc, 'user_message', None) or str(exc)}") from exc

        return {
            "transaction_id": intent.id,
            "client_secret": intent.client_secret,
            "status": intent.status,
            "amount": amount,
            "currency": currency,
            "customer_id": customer_id,
            "metadata": meta,
            "created_at": datetime.now(UTC).isoformat(),
        }

    async def refund(
        self,
        transaction_id: str,
        amount: float | None = None,
    ) -> dict[str, Any]:
        """Issue a full or partial Stripe refund against a PaymentIntent."""
        params: dict[str, Any] = {"payment_intent": transaction_id}
        if amount is not None:
            params["amount"] = int(round(amount * 100))

        try:
            refund = await self._stripe.Refund.create_async(**params)
        except self._stripe.StripeError as exc:
            logger.error("Stripe refund error for txn %s: %s", transaction_id, exc)
            raise RuntimeError(f"Refund failed: {getattr(exc, 'user_message', None) or str(exc)}") from exc

        return {
            "refund_id": refund.id,
            "transaction_id": transaction_id,
            "status": refund.status,
            "amount": (refund.amount / 100) if refund.amount else amount,
            "created_at": datetime.now(UTC).isoformat(),
        }

    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        """Retrieve the current status of a Stripe PaymentIntent."""
        try:
            intent = await self._stripe.PaymentIntent.retrieve_async(transaction_id)
        except self._stripe.StripeError as exc:
            logger.error("Stripe get_status error for txn %s: %s", transaction_id, exc)
            raise RuntimeError(f"Status check failed: {str(exc)}") from exc

        return {
            "transaction_id": intent.id,
            "status": intent.status,
            "amount": intent.amount / 100,
            "currency": intent.currency.upper(),
            "checked_at": datetime.now(UTC).isoformat(),
        }

    async def create_customer(self, user_id: str, email: str) -> str:
        """Create a Stripe Customer record linked to a Groupio user."""
        try:
            customer = await self._stripe.Customer.create_async(
                email=email,
                metadata={"user_id": user_id},
            )
        except self._stripe.StripeError as exc:
            logger.error("Stripe create_customer error for user %s: %s", user_id, exc)
            raise RuntimeError(f"Customer creation failed: {str(exc)}") from exc

        return customer.id


# ------------------------------------------------------------------
# BitPaymentProvider — Israeli mobile payment via bit
# ------------------------------------------------------------------
# STATUS: NOT YET LIVE — requires onboarding with bit Israel (bit.co.il)
#
# bit is a mobile payment platform operated by Bank Hapoalim (Israel).
# It is widely used for peer-to-peer and merchant payments in Israel.
#
# Integration pattern for Groupio:
#   1. Merchant registers at https://www.bitpay.co.il/merchant
#   2. Merchant receives BIT_MERCHANT_ID and BIT_API_KEY
#   3. Payment flow: create_charge() returns a payment_link (deep-link / QR)
#   4. Resident opens link in bit mobile app to approve payment
#   5. bit sends a webhook (callback) to /payments/webhook with the result
#
# To enable: set ENABLE_BIT_PAYMENT=true + BIT_MERCHANT_ID + BIT_API_KEY in .env
# See docs/PAYMENT_PROVIDER_ONBOARDING.md for full details.
# ------------------------------------------------------------------


class BitPaymentProvider(PaymentProvider):
    """bit payment provider (Israeli mobile payment).

    This provider is ARCHITECTURE-READY but NOT YET LIVE.
    Real API credentials from bit Israel are required before any payment
    can be processed. Do NOT set PAYMENT_PROVIDER=bit in production until
    the full onboarding (docs/PAYMENT_PROVIDER_ONBOARDING.md) is complete.

    Expected bit API contract (subject to change upon onboarding):
      - POST /v1/payments  → creates payment request, returns payment_link + reference
      - GET  /v1/payments/{reference}  → returns current payment status
      - Webhook: bit POSTs to your callback_url on payment events

    Pending tasks before going live:
      [ ] Complete merchant registration at https://www.bitpay.co.il/merchant
      [ ] Obtain BIT_MERCHANT_ID and BIT_API_KEY credentials
      [ ] Confirm exact bit REST API endpoint URL and auth scheme
      [ ] Implement HMAC-SHA256 signature verification on bit webhook callbacks
      [ ] Test full payment round-trip in bit sandbox environment
      [ ] Add bit deeplink / QR code display in checkout UI
      [ ] Register webhook callback URL in bit merchant dashboard
    """

    def __init__(self, api_key: str, merchant_id: str, environment: str = "sandbox") -> None:
        self._api_key = api_key
        self._merchant_id = merchant_id
        self._base_url = (
            "https://sandbox.bitpay.co.il/api"
            if environment == "sandbox"
            else "https://api.bitpay.co.il/api"
        )
        logger.info("BitPaymentProvider initialized (environment=%s)", environment)

    async def create_charge(
        self,
        amount: float,
        currency: str,
        customer_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Initiate a bit payment request.

        Returns a dict with ``payment_link`` (deep-link URL the resident opens
        in the bit app), ``transaction_id`` (provider reference), and ``status``.

        NOTE: This method raises NotImplementedError until real API credentials
        are obtained and the full integration is implemented.
        See docs/PAYMENT_PROVIDER_ONBOARDING.md — section "bit Integration".
        """
        raise NotImplementedError(
            "BitPaymentProvider.create_charge is not yet implemented. "
            "Complete bit merchant onboarding and implement the REST API call. "
            "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
        )

    async def refund(self, transaction_id: str, amount: float | None = None) -> dict[str, Any]:
        """Issue a bit payment refund.

        NOTE: bit refund flow depends on the merchant API contract.
        Implement after completing onboarding.
        """
        raise NotImplementedError(
            "BitPaymentProvider.refund is not yet implemented. "
            "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
        )

    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        """Retrieve the current status of a bit payment request."""
        raise NotImplementedError(
            "BitPaymentProvider.get_status is not yet implemented. "
            "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
        )

    async def create_customer(self, user_id: str, email: str) -> str:
        """bit does not have a customer registration step.

        Returns the user_id directly as the customer identifier.
        """
        return user_id


# ------------------------------------------------------------------
# PayBoxPaymentProvider — PayBox online/redirect payment
# ------------------------------------------------------------------
# STATUS: NOT YET LIVE — requires onboarding with PayBox (payboxpayments.com)
#
# PayBox is an Israeli online payment gateway supporting credit cards,
# installments, and alternative payment methods.
#
# Integration pattern for Groupio:
#   1. Merchant registers at https://payboxpayments.com or https://paybox.co.il
#   2. Merchant receives PAYBOX_TERMINAL (terminal ID) and PAYBOX_API_KEY
#   3. Payment flow: create_charge() creates a hosted payment page URL
#   4. Resident is redirected to PayBox hosted page to complete payment
#   5. PayBox redirects back to success_url / cancel_url
#   6. PayBox sends a webhook to /payments/webhook with confirmation
#
# To enable: set ENABLE_PAYBOX_PAYMENT=true + PAYBOX_TERMINAL + PAYBOX_API_KEY in .env
# See docs/PAYMENT_PROVIDER_ONBOARDING.md for full details.
# ------------------------------------------------------------------


class PayBoxPaymentProvider(PaymentProvider):
    """PayBox payment provider (Israeli online payment gateway).

    This provider is ARCHITECTURE-READY but NOT YET LIVE.
    Real API credentials from PayBox are required before any payment
    can be processed. Do NOT set PAYMENT_PROVIDER=paybox in production until
    the full onboarding (docs/PAYMENT_PROVIDER_ONBOARDING.md) is complete.

    Expected PayBox API contract (subject to change upon onboarding):
      - POST /api/Transaction/Payment  → creates hosted payment, returns checkout_url
      - GET  /api/Transaction/GetTransaction?terminal=X&id=Y  → status check
      - Webhook: PayBox POSTs to your success_url / notify_url on completion

    Pending tasks before going live:
      [ ] Complete merchant registration at https://payboxpayments.com
      [ ] Obtain PAYBOX_TERMINAL (terminal ID) and PAYBOX_API_KEY credentials
      [ ] Confirm exact PayBox REST API base URL for sandbox vs production
      [ ] Implement HMAC verification on PayBox callback/webhook
      [ ] Test full redirect round-trip in PayBox sandbox environment
      [ ] Add redirect + return handling in checkout page
      [ ] Register success/cancel/notify URLs in PayBox merchant settings
    """

    def __init__(self, terminal: str, api_key: str, environment: str = "sandbox") -> None:
        self._terminal = terminal
        self._api_key = api_key
        self._base_url = (
            "https://sandbox.payboxpayments.com/api"
            if environment == "sandbox"
            else "https://api.payboxpayments.com/api"
        )
        logger.info("PayBoxPaymentProvider initialized (environment=%s)", environment)

    async def create_charge(
        self,
        amount: float,
        currency: str,
        customer_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a PayBox hosted payment page.

        Returns a dict with ``checkout_url`` (the URL the resident is redirected to),
        ``transaction_id`` (PayBox reference), and ``status``.

        NOTE: This method raises NotImplementedError until real API credentials
        are obtained and the full integration is implemented.
        See docs/PAYMENT_PROVIDER_ONBOARDING.md — section "PayBox Integration".
        """
        raise NotImplementedError(
            "PayBoxPaymentProvider.create_charge is not yet implemented. "
            "Complete PayBox merchant onboarding and implement the REST API call. "
            "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
        )

    async def refund(self, transaction_id: str, amount: float | None = None) -> dict[str, Any]:
        """Issue a PayBox refund."""
        raise NotImplementedError(
            "PayBoxPaymentProvider.refund is not yet implemented. "
            "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
        )

    async def get_status(self, transaction_id: str) -> dict[str, Any]:
        """Retrieve the current status of a PayBox transaction."""
        raise NotImplementedError(
            "PayBoxPaymentProvider.get_status is not yet implemented. "
            "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
        )

    async def create_customer(self, user_id: str, email: str) -> str:
        """PayBox does not require a separate customer registration step.

        Returns the user_id directly as the customer identifier.
        """
        return user_id


# ------------------------------------------------------------------
# Singleton factory
# ------------------------------------------------------------------

_payment_provider: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    """Get or create the singleton PaymentProvider instance.

    Provider is selected by the ``PAYMENT_PROVIDER`` environment variable:
    - ``mock``   — MockPaymentProvider (development / demo only)
    - ``stripe`` — StripePaymentProvider (requires STRIPE_SECRET_KEY)
    - ``bit``    — BitPaymentProvider (requires ENABLE_BIT_PAYMENT=true + BIT_API_KEY + BIT_MERCHANT_ID)
    - ``paybox`` — PayBoxPaymentProvider (requires ENABLE_PAYBOX_PAYMENT=true + PAYBOX_TERMINAL + PAYBOX_API_KEY)

    In production, the ``mock`` provider is blocked.
    ``bit`` and ``paybox`` are architecture-ready but raise NotImplementedError
    until onboarding is complete and the API integration is implemented.
    See docs/PAYMENT_PROVIDER_ONBOARDING.md for onboarding instructions.
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
            if settings.ENVIRONMENT in ("production", "staging"):
                raise RuntimeError(
                    "PAYMENT_PROVIDER=mock is not allowed in production/staging. "
                    "Real money flows would silently succeed without actual charges. "
                    "Set PAYMENT_PROVIDER=stripe and configure STRIPE_SECRET_KEY."
                )
            _payment_provider = MockPaymentProvider()

        elif provider_name == "bit":
            raise PaymentProviderUnavailableError(
                "Bit payments are not available. "
                "Complete bit merchant onboarding and set ENABLE_BIT_PAYMENT=true. "
                "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
            )

        elif provider_name == "paybox":
            raise PaymentProviderUnavailableError(
                "PayBox payments are not available. "
                "Complete PayBox merchant onboarding and set ENABLE_PAYBOX_PAYMENT=true. "
                "See docs/PAYMENT_PROVIDER_ONBOARDING.md."
            )

        else:
            raise RuntimeError(
                f"Unknown PAYMENT_PROVIDER={provider_name!r}. "
                "Supported values: 'mock', 'stripe', 'bit', 'paybox'."
            )

    return _payment_provider
