"""Payment API routes – resident payments + admin escrow/payout management."""

import hashlib
import hmac
import html as _html
import time as _time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from src.api.middleware.auth import get_current_user, require_admin_only
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB, UserRole
from src.services.payment import PaymentProviderUnavailableError, get_payment_provider
from src.utils.monitoring import capture_exception_safe, get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Payments"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class PaymentInitiateRequest(BaseModel):
    """Request body for initiating a payment."""

    offer_id: str
    payment_method_id: str | None = None
    force_escrow: bool = False  # Resident can opt-in to escrow
    idempotency_key: str | None = Field(
        default=None,
        max_length=255,
        description="Optional client key; forwarded to provider metadata for tracing/dedup.",
    )


VAT_RATE = 0.18  # Israeli מע"מ — 18% as of 2025


class PaymentResponse(BaseModel):
    """Standard payment response."""

    id: str
    user_id: str
    offer_id: str
    subtotal: float  # Price before VAT
    tax_rate: float = VAT_RATE
    tax_amount: float  # VAT amount (18%)
    amount: float  # Total charged (subtotal + VAT)
    currency: str
    status: str
    payment_type: str = "direct"  # "escrow" or "direct"
    transaction_id: str | None = None
    client_secret: str | None = None  # Stripe PaymentIntent client_secret for frontend confirmation
    created_at: str
    provider: str | None = None  # e.g. mock | stripe — lets checkout fail closed outside mock


class InvoiceResponse(BaseModel):
    """Standard invoice response."""

    id: str
    offer_id: str
    subtotal: float = 0.0
    tax_rate: float = VAT_RATE
    tax_amount: float = 0.0
    amount: float  # Total (subtotal + VAT)
    currency: str
    status: str
    payment_type: str = "direct"
    issued_at: str
    due_date: str | None = None
    items: list[dict] = []


class ContractorEarningsLine(BaseModel):
    """Single invoice row for contractor payout visibility."""

    invoice_id: str
    offer_id: str
    status: str
    payment_type: str = "direct"
    total: float
    currency: str = "ILS"
    created_at: str | None = None
    paid_at: str | None = None


class ContractorEarningsResponse(BaseModel):
    """Aggregated earnings / invoice status for the logged-in contractor."""

    currency: str = "ILS"
    pending_total: float = 0.0
    completed_total: float = 0.0
    held_escrow_total: float = 0.0
    recent: list[ContractorEarningsLine] = Field(default_factory=list)


def _iso_utc(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=UTC).isoformat()
        return val.isoformat()
    return str(val)


# ---------------------------------------------------------------------------
# Escrow decision logic
# ---------------------------------------------------------------------------

# Configurable thresholds — defaults used when system_settings row is absent
_DEFAULT_MIN_ESCROW_PARTICIPANTS = 2
_DEFAULT_MIN_ESCROW_AMOUNT = 5000  # ILS
_DEFAULT_TRUSTED_CONTRACTOR_THRESHOLD = 80  # trust score out of 100
_DEFAULT_HIGH_VALUE_CATEGORIES = {"renovations", "kitchen", "electrical", "plumbing", "ac_installation"}
MIN_PAYMENT_AMOUNT = 1  # Minimum valid payment in ILS

# In-process cache so we don't hit the DB on every request (TTL: 5 minutes)
_escrow_thresholds_cache: dict[str, Any] = {}
_escrow_thresholds_fetched_at: float = 0.0
_ESCROW_THRESHOLDS_TTL = 300  # seconds


async def _get_escrow_thresholds() -> dict[str, Any]:
    """Load escrow thresholds from system_settings, falling back to defaults."""
    global _escrow_thresholds_cache, _escrow_thresholds_fetched_at
    if _time.monotonic() - _escrow_thresholds_fetched_at < _ESCROW_THRESHOLDS_TTL and _escrow_thresholds_cache:
        return _escrow_thresholds_cache
    db = get_postgres_client()
    settings_rows = await db.get_system_settings()
    settings_map = {row["key"]: row["value"] for row in settings_rows}
    thresholds = {
        "min_escrow_participants": int(settings_map.get("escrow_min_participants", _DEFAULT_MIN_ESCROW_PARTICIPANTS)),
        "min_escrow_amount": float(settings_map.get("escrow_min_amount_ils", _DEFAULT_MIN_ESCROW_AMOUNT)),
        "trusted_contractor_threshold": float(
            settings_map.get("escrow_trusted_contractor_threshold", _DEFAULT_TRUSTED_CONTRACTOR_THRESHOLD)
        ),
        "high_value_categories": set(
            settings_map.get("escrow_high_value_categories", list(_DEFAULT_HIGH_VALUE_CATEGORIES))
            if isinstance(settings_map.get("escrow_high_value_categories"), list)
            else _DEFAULT_HIGH_VALUE_CATEGORIES
        ),
    }
    _escrow_thresholds_cache = thresholds
    _escrow_thresholds_fetched_at = _time.monotonic()
    return thresholds


def determine_payment_type(
    offer: dict,
    contractor_trust_score: float | None = None,
    force_escrow: bool = False,
    thresholds: dict[str, Any] | None = None,
) -> str:
    """Decide whether an offer's payments go through escrow or direct.

    Returns "escrow" or "direct".

    Escrow is used when ANY of:
      1. Offer has >= min_escrow_participants participants (group buying)
      2. Offer total price >= min_escrow_amount (high value)
      3. Contractor trust score < trusted_contractor_threshold (unverified)
      4. Offer category is in high_value_categories
      5. Resident explicitly requested escrow (force_escrow=True)

    Thresholds are loaded from system_settings (with module-level defaults as fallback).
    Direct payment is used ONLY when ALL conditions are false.
    """
    if thresholds is None:
        thresholds = {
            "min_escrow_participants": _DEFAULT_MIN_ESCROW_PARTICIPANTS,
            "min_escrow_amount": _DEFAULT_MIN_ESCROW_AMOUNT,
            "trusted_contractor_threshold": _DEFAULT_TRUSTED_CONTRACTOR_THRESHOLD,
            "high_value_categories": _DEFAULT_HIGH_VALUE_CATEGORIES,
        }

    if force_escrow:
        return "escrow"

    participants = offer.get("participants", 1)
    if participants >= thresholds["min_escrow_participants"]:
        return "escrow"

    total_price = offer.get("base_price", 0) * participants
    if total_price >= thresholds["min_escrow_amount"]:
        return "escrow"

    category = offer.get("category", "")
    if category in thresholds["high_value_categories"]:
        return "escrow"

    if contractor_trust_score is not None and contractor_trust_score < thresholds["trusted_contractor_threshold"]:
        return "escrow"

    return "direct"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


class PaginatedPaymentsResponse(BaseModel):
    """Paginated payment history response — PERF-9."""

    payments: list[PaymentResponse]
    total: int
    page: int
    pages: int


@router.get("/my", response_model=PaginatedPaymentsResponse)
async def get_my_payments(
    current_user: UserInDB = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
) -> PaginatedPaymentsResponse:
    """Get the current user's payment history (paginated — PERF-9)."""
    db = get_postgres_client()
    payments, total = await db.list_payments_for_user_paginated(
        current_user.id,
        page=page,
        page_size=limit,
        status=status,
    )
    result: list[PaymentResponse] = []
    for p in payments:
        raw_amount = p.get("amount", 0)
        subtotal = p.get("subtotal", round(raw_amount / (1 + VAT_RATE), 2))
        tax_amount = p.get("tax_amount", round(subtotal * VAT_RATE, 2))
        result.append(
            PaymentResponse(
                id=p.get("id", ""),
                user_id=p.get("user_id", current_user.id),
                offer_id=p.get("offer_id", ""),
                subtotal=subtotal,
                tax_rate=p.get("tax_rate", VAT_RATE),
                tax_amount=tax_amount,
                amount=raw_amount,
                currency=p.get("currency", "ILS"),
                status=p.get("status", "unknown"),
                transaction_id=p.get("transaction_id"),
                created_at=p.get("created_at", datetime.now(UTC).isoformat()),
                provider=p.get("provider_name"),
            )
        )
    pages = (total + limit - 1) // limit if limit > 0 else 1
    return PaginatedPaymentsResponse(payments=result, total=total, page=page, pages=pages)


@router.get("/contractor/earnings", response_model=ContractorEarningsResponse)
async def get_contractor_earnings(
    current_user: UserInDB = Depends(get_current_user),
) -> ContractorEarningsResponse:
    """Invoices linked to this contractor (matched offers + invoice.contractor_id)."""
    if current_user.role != UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Contractor role required")
    cid = current_user.contractor_id
    if not cid:
        raise HTTPException(status_code=400, detail="Account is not linked to a contractor profile")

    db = get_postgres_client()
    rows = await db.list_invoices_for_contractor(cid)
    pending_total = 0.0
    completed_total = 0.0
    held_escrow_total = 0.0
    recent: list[ContractorEarningsLine] = []
    currency = "ILS"

    for inv in rows:
        st = str(inv.get("status") or "pending").lower()
        total = float(inv.get("total") or inv.get("amount") or 0)
        pt = str(inv.get("payment_type") or "direct").lower()
        currency = str(inv.get("currency") or currency)
        line = ContractorEarningsLine(
            invoice_id=str(inv.get("id", "")),
            offer_id=str(inv.get("offer_id", "")),
            status=st,
            payment_type=pt,
            total=total,
            currency=currency,
            created_at=_iso_utc(inv.get("created_at")),
            paid_at=_iso_utc(inv.get("paid_at")),
        )
        recent.append(line)
        if st in ("paid", "released"):
            completed_total += total
        else:
            pending_total += total
            if pt == "escrow":
                held_escrow_total += total

    return ContractorEarningsResponse(
        currency=currency,
        pending_total=round(pending_total, 2),
        completed_total=round(completed_total, 2),
        held_escrow_total=round(held_escrow_total, 2),
        recent=recent,
    )


@router.post("/initiate", response_model=PaymentResponse)
async def initiate_payment(
    request: PaymentInitiateRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> PaymentResponse:
    """Initiate a payment for an offer.

    Creates an invoice if one doesn't already exist for the offer,
    creates a payment record, and calls the payment provider.
    """
    db = get_postgres_client()
    settings = get_settings()
    provider_key = settings.PAYMENT_PROVIDER.lower()
    try:
        provider = get_payment_provider()
    except PaymentProviderUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Idempotency: return existing payment if this key was already processed
    if request.idempotency_key:
        existing = await db.get_payment_by_idempotency_key(current_user.id, request.idempotency_key)
        if existing:
            return PaymentResponse(**existing)

    # Verify the offer exists and the user is associated with it
    offer = await db.get_offer(request.offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    # Check user has joined the offer (not just in the building)
    has_joined = await db.has_user_joined_offer(current_user.id, request.offer_id)
    if not has_joined:
        raise HTTPException(
            status_code=403,
            detail="You must join the offer before making a payment",
        )

    # Determine escrow vs direct payment
    contractor_trust = None
    contractor_id = offer.get("matched_contractor_id") or offer.get("contractor_id")
    if contractor_id:
        try:
            ctr = await db.get_contractor(contractor_id)
            if ctr:
                contractor_trust = ctr.get("trust_score")
        except Exception as exc:
            logger.warning(
                "contractor_trust_lookup_failed",
                contractor_id=str(contractor_id),
                error_type=type(exc).__name__,
            )

    thresholds = await _get_escrow_thresholds()
    payment_type = determine_payment_type(
        offer,
        contractor_trust_score=contractor_trust,
        force_escrow=request.force_escrow,
        thresholds=thresholds,
    )

    # Check for existing unpaid invoice or create one
    existing_invoice = await db.get_invoice_for_offer(current_user.id, request.offer_id)
    if not existing_invoice:
        invoice_id = str(uuid4())
        amount = offer.get("base_price", offer.get("price_per_unit", 0))

        # Validate payment amount
        if amount < MIN_PAYMENT_AMOUNT:
            raise HTTPException(
                status_code=400,
                detail=f"Payment amount {amount} is below minimum ({MIN_PAYMENT_AMOUNT} ILS)",
            )

        subtotal = amount
        tax_amount = round(subtotal * VAT_RATE, 2)
        total = round(subtotal + tax_amount, 2)
        invoice_data = {
            "id": invoice_id,
            "offer_id": request.offer_id,
            "subtotal": subtotal,
            "tax_rate": VAT_RATE,
            "tax_amount": tax_amount,  # API response key
            "tax": tax_amount,  # DB column key (invoices.tax)
            "amount": total,
            "currency": "ILS",
            "status": "pending",
            "payment_type": payment_type,
            "issued_at": datetime.now(UTC).isoformat(),
            "items": [
                {
                    "description": offer.get("title", "Group offer"),
                    "quantity": 1,
                    "unit_price": subtotal,
                    "tax_amount": tax_amount,
                    "total": total,
                }
            ],
        }
        existing_invoice = invoice_data
    else:
        subtotal = existing_invoice.get("subtotal", existing_invoice.get("amount", 0))
        tax_amount = existing_invoice.get("tax_amount", round(subtotal * VAT_RATE, 2))
        total = existing_invoice.get("amount", round(subtotal + tax_amount, 2))
        amount = total
        payment_type = existing_invoice.get("payment_type", "escrow")

    # Create payment record — amount is the VAT-inclusive total
    payment_id = str(uuid4())
    charge_subtotal: float = existing_invoice.get("subtotal", amount)
    charge_tax: float = existing_invoice.get("tax_amount", round(charge_subtotal * VAT_RATE, 2))
    charge_total: float = existing_invoice.get("amount", round(charge_subtotal + charge_tax, 2))

    payment_data: dict[str, Any] = {
        "id": payment_id,
        "user_id": current_user.id,
        "offer_id": request.offer_id,
        "invoice_id": existing_invoice.get("id"),
        "subtotal": charge_subtotal,
        "tax_rate": VAT_RATE,
        "tax_amount": charge_tax,
        "amount": charge_total,
        "currency": "ILS",
        "status": "pending",
        "payment_method_id": request.payment_method_id,
        "idempotency_key": request.idempotency_key,
        "created_at": datetime.now(UTC).isoformat(),
    }

    # Write invoice + pending payment BEFORE calling the provider.
    # This ensures money is never charged without a corresponding DB record.
    async with db.transaction() as conn:
        if not await db.get_invoice_for_offer(current_user.id, request.offer_id):
            await db.create_invoice(existing_invoice, conn=conn)
            from src.messaging.outbox_helpers import try_enqueue_invoice_created_event

            await try_enqueue_invoice_created_event(
                db,
                invoice_id=str(existing_invoice["id"]),
                offer_id=request.offer_id,
                user_id=current_user.id,
                amount=float(existing_invoice.get("amount", charge_total)),
                currency=str(existing_invoice.get("currency", "ILS")),
                payment_type=str(existing_invoice.get("payment_type", payment_type)),
                conn=conn,
            )
        await db.create_payment(payment_data, conn=conn)

    # Call payment provider with the VAT-inclusive total
    try:
        charge_meta: dict[str, str] = {
            "offer_id": request.offer_id,
            "payment_id": payment_id,
            "user_email": current_user.email,
            "subtotal": str(charge_subtotal),
            "tax_amount": str(charge_tax),
            "tax_rate": str(VAT_RATE),
        }
        if request.idempotency_key:
            charge_meta["idempotency_key"] = request.idempotency_key
        charge_result = await provider.create_charge(
            amount=charge_total,
            currency="ILS",
            customer_id=current_user.id,
            metadata=charge_meta,
        )
        payment_data["transaction_id"] = charge_result.get("transaction_id")
        payment_data["status"] = charge_result.get("status", "processing")
        payment_data["client_secret"] = charge_result.get("client_secret")
        st_raw = str(payment_data.get("status") or "")
        if provider_key == "stripe" and st_raw.startswith("requires") and not payment_data.get("client_secret"):
            logger.error(
                "stripe_initiate_missing_client_secret",
                status=st_raw,
                payment_id=payment_id,
            )
            payment_data["status"] = "failed"
    except Exception as exc:
        logger.error(
            "payment_provider_charge_failed",
            payment_id=payment_id,
            error_type=type(exc).__name__,
            error=str(exc)[:500],
        )
        capture_exception_safe(exc, flow="payment_initiate", payment_id=payment_id)
        payment_data["status"] = "failed"

    # Update the pre-written payment record with the provider result
    await db.update_payment(
        payment_id,
        {"status": payment_data["status"], "transaction_id": payment_data.get("transaction_id")},
    )

    # For direct payments that succeeded, mark invoice as paid immediately.
    # For escrow: Stripe marks invoice paid via webhook. For mock (no webhook),
    # mark paid when all offer participants have a succeeded payment.
    if payment_data["status"] == "succeeded":
        if payment_type == "direct":
            await db.update_invoice(existing_invoice["id"], {"status": "paid"})
        elif provider_key == "mock" and existing_invoice.get("id"):
            participants = await db.get_offer_participants(request.offer_id)
            participant_count = len(participants)
            succeeded = await db.count_succeeded_payments_for_invoice(str(existing_invoice["id"]))
            if participant_count == 0 or succeeded >= participant_count:
                await db.update_invoice(existing_invoice["id"], {"status": "paid"})

    return PaymentResponse(
        id=payment_data["id"],
        user_id=payment_data["user_id"],
        offer_id=payment_data["offer_id"],
        subtotal=charge_subtotal,
        tax_rate=VAT_RATE,
        tax_amount=charge_tax,
        amount=charge_total,
        currency=payment_data["currency"],
        status=payment_data["status"],
        payment_type=payment_type,
        transaction_id=payment_data.get("transaction_id"),
        client_secret=payment_data.get("client_secret"),
        created_at=payment_data["created_at"],
        provider=provider_key,
    )


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request) -> dict:
    """Handle Stripe webhooks: resident payments (PaymentIntent) + contractor membership (subscriptions).

    Verified with ``STRIPE_WEBHOOK_SECRET``. Subscription checkout must send ``metadata.contractor_id``.
    Event ids are de-duplicated via ``stripe_webhook_events`` (migration 031).
    """
    raw_body = await request.body()
    stripe_sig = request.headers.get("stripe-signature", "")

    settings = get_settings()

    if settings.STRIPE_WEBHOOK_SECRET:
        try:
            import stripe  # noqa: PLC0415

            event = stripe.Webhook.construct_event(
                payload=raw_body,
                sig_header=stripe_sig,
                secret=settings.STRIPE_WEBHOOK_SECRET,
            )
        except Exception as exc:
            logger.warning(
                "stripe_webhook_signature_failed",
                error_type=type(exc).__name__,
                error=str(exc)[:500],
            )
            raise HTTPException(status_code=400, detail="Invalid Stripe signature") from exc
        try:
            event_id = event["id"]
            event_type = event["type"]
            event_data = event["data"]["object"]
        except (KeyError, TypeError):
            event_id = getattr(event, "id", None)
            event_type = getattr(event, "type", "") or ""
            _data = getattr(event, "data", None)
            event_data = getattr(_data, "object", {}) if _data is not None else {}
    elif settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=503, detail="Stripe webhook secret not configured")
    else:
        import json  # noqa: PLC0415

        body = json.loads(raw_body)
        event_id = body.get("id")
        event_type = body.get("type", "")
        event_data = body.get("data", {}).get("object", {})

    logger.info("stripe_webhook_received", event_type=event_type, event_id=str(event_id) if event_id else None)

    db = get_postgres_client()
    if event_id:
        claimed = await db.try_claim_stripe_webhook_event(str(event_id))
        if not claimed:
            logger.info("stripe_webhook_duplicate_skipped", event_id=str(event_id))
            return {"status": "duplicate", "event_id": event_id}

    membership_events = {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
    }
    if event_type in membership_events:
        from src.services.stripe_contractor_webhooks import handle_stripe_subscription_event

        result = await handle_stripe_subscription_event(db, event_type, event_data)
        return {"status": "processed", **result}

    status_map = {
        "payment_intent.succeeded": "succeeded",
        "payment_intent.payment_failed": "failed",
        "payment_intent.canceled": "failed",
        "payment_intent.processing": "processing",
        "charge.refunded": "refunded",
        "charge.dispute.created": "disputed",
    }
    new_status = status_map.get(event_type)
    if not new_status:
        return {"status": "ignored", "event_type": event_type}

    transaction_id = event_data.get("id")
    if not transaction_id:
        return {"status": "ignored", "reason": "no_transaction_id"}

    payment = await db.get_payment_by_transaction(transaction_id)
    if not payment:
        logger.warning(
            "stripe_webhook_unknown_transaction",
            transaction_id=str(transaction_id),
            event_type=event_type,
        )
        return {"status": "ignored", "reason": "unknown_transaction"}

    invoice_id = payment.get("invoice_id")
    invoice_status: str | None = None
    if invoice_id:
        if new_status == "succeeded":
            invoice_status = "paid"
        elif new_status == "refunded":
            invoice_status = "refunded"
    old_payment_status = payment.get("status", "unknown")
    await db.update_payment_and_invoice_for_webhook(
        payment["id"],
        invoice_id if invoice_status else None,
        new_status,
        invoice_status,
    )

    # Audit log — payment rules mandate all status transitions are recorded.
    try:
        await db.create_audit_log(
            {
                "user_id": payment.get("user_id"),
                "action": "payment_status_transition",
                "resource_type": "payment",
                "resource_id": payment["id"],
                "details": {
                    "old_status": old_payment_status,
                    "new_status": new_status,
                    "trigger": "stripe_webhook",
                    "stripe_event_type": event_type,
                    "offer_id": payment.get("offer_id"),
                },
            }
        )
    except Exception:
        logger.exception("Failed to write payment audit log (non-fatal)")

    try:
        from src.messaging.envelope import EventEnvelope
        from src.messaging.outbox_helpers import try_enqueue_payment_event
        from src.messaging.topics import (
            RK_PAYMENTS_FAILED,
            RK_PAYMENTS_REFUND_PROCESSED,
            RK_PAYMENTS_SUCCEEDED,
        )

        sid = str(event_id) if event_id else ""
        base_payload = {
            "payment_id": payment["id"],
            "offer_id": payment.get("offer_id"),
            "user_id": payment.get("user_id"),
            "amount": payment.get("amount"),
            "stripe_event_id": sid,
        }
        if new_status == "succeeded":
            env = EventEnvelope(
                event_name="payments.succeeded",
                entity_type="payment",
                entity_id=payment["id"],
                idempotency_key=f"stripe:{sid}:succeeded" if sid else f"payment:{payment['id']}:succeeded",
                payload={**base_payload, "status": new_status},
            )
            await try_enqueue_payment_event(
                db,
                RK_PAYMENTS_SUCCEEDED,
                env.event_name,
                env.to_json_dict(),
                idempotency_key=env.idempotency_key,
            )
        elif new_status == "refunded":
            env = EventEnvelope(
                event_name="payments.refund_processed",
                entity_type="payment",
                entity_id=payment["id"],
                idempotency_key=f"stripe:{sid}:refund" if sid else f"payment:{payment['id']}:refund",
                payload={**base_payload, "status": new_status},
            )
            await try_enqueue_payment_event(
                db,
                RK_PAYMENTS_REFUND_PROCESSED,
                env.event_name,
                env.to_json_dict(),
                idempotency_key=env.idempotency_key,
            )
        elif new_status == "failed":
            env = EventEnvelope(
                event_name="payments.failed",
                entity_type="payment",
                entity_id=payment["id"],
                idempotency_key=f"stripe:{sid}:failed" if sid else f"payment:{payment['id']}:failed",
                payload={**base_payload, "status": new_status},
            )
            await try_enqueue_payment_event(
                db,
                RK_PAYMENTS_FAILED,
                env.event_name,
                env.to_json_dict(),
                idempotency_key=env.idempotency_key,
            )
    except Exception:
        logger.exception("Payment outbox enqueue failed after Stripe webhook (non-fatal)")

    return {"status": "processed", "payment_id": payment["id"], "new_status": new_status}


@router.post("/{payment_id}/approve-work")
async def resident_approve_work(
    payment_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Resident confirms work completion for their payment (audited; ties into escrow ops separately)."""
    db = get_postgres_client()
    payment = await db.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to approve for this payment")
    await db.update_payment(payment_id, {"status": "work_approved"})
    await db.create_audit_log(
        {
            "user_id": current_user.id,
            "action": "work_approved",
            "resource_type": "payment",
            "resource_id": payment_id,
            "details": {"offer_id": payment.get("offer_id")},
        }
    )
    logger.info(
        "resident_approve_work payment_id=%s user_id=%s offer_id=%s",
        payment_id,
        current_user.id,
        payment.get("offer_id"),
    )
    return {"status": "recorded", "payment_id": payment_id}


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> PaymentResponse:
    """Get a specific payment by ID. Only the owning user can access it."""
    db = get_postgres_client()
    payment = await db.get_payment(payment_id)

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this payment")

    raw_amount = payment.get("amount", 0)
    pay_subtotal = payment.get("subtotal", round(raw_amount / (1 + VAT_RATE), 2))
    pay_tax_amount = payment.get("tax_amount", round(pay_subtotal * VAT_RATE, 2))
    return PaymentResponse(
        id=payment["id"],
        user_id=payment["user_id"],
        offer_id=payment.get("offer_id", ""),
        subtotal=pay_subtotal,
        tax_rate=payment.get("tax_rate", VAT_RATE),
        tax_amount=pay_tax_amount,
        amount=raw_amount,
        currency=payment.get("currency", "ILS"),
        status=payment.get("status", "unknown"),
        transaction_id=payment.get("transaction_id"),
        created_at=payment.get("created_at", ""),
        provider=payment.get("provider_name"),
    )


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    x_payment_signature: str | None = Header(None, alias="X-Payment-Signature"),
) -> dict:
    """Handle payment provider webhook callbacks.

    Authenticates the request by verifying the HMAC-SHA256 signature
    supplied in the ``X-Payment-Signature`` header against
    ``PAYMENT_WEBHOOK_SECRET``.  Requests without a valid signature are
    rejected with HTTP 403 to block fraudulent webhook forgery.
    """
    raw_body = await request.body()

    settings = get_settings()
    webhook_secret = settings.PAYMENT_WEBHOOK_SECRET

    if webhook_secret:
        # Compute expected HMAC-SHA256 signature
        expected_sig = (
            "sha256="
            + hmac.new(
                webhook_secret.encode("utf-8"),
                raw_body,
                hashlib.sha256,
            ).hexdigest()
        )
        incoming_sig = x_payment_signature or ""
        if not hmac.compare_digest(expected_sig, incoming_sig):
            logger.warning(
                "payment_webhook_signature_mismatch",
                expected_prefix=expected_sig[:24],
                got_prefix=incoming_sig[:24],
            )
            raise HTTPException(status_code=403, detail="Invalid webhook signature")
    elif settings.ENVIRONMENT != "development":
        # In non-dev environments, refuse to process unsigned webhooks
        logger.error(
            "payment_webhook_secret_missing",
            environment=settings.ENVIRONMENT,
        )
        raise HTTPException(
            status_code=503,
            detail="Webhook signature verification not configured",
        )
    else:
        logger.warning("payment_webhook_unsigned_dev_mode")

    import json

    body = json.loads(raw_body)
    logger.info(
        "payment_webhook_received",
        event_type=body.get("event_type", "unknown"),
    )

    transaction_id = body.get("transaction_id")
    event_type = body.get("event_type")
    status = body.get("status")

    if not transaction_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing required webhook fields")

    db = get_postgres_client()

    # Look up the payment by transaction_id
    payment = await db.get_payment_by_transaction(transaction_id)
    if not payment:
        logger.warning(
            "payment_webhook_unknown_transaction",
            transaction_id=str(transaction_id),
            event_type=str(event_type),
        )
        # Return 200 to avoid provider retries for unknown transactions
        return {"status": "ignored", "reason": "unknown_transaction"}

    # Map provider status to our internal status
    status_mapping = {
        # Generic events
        "payment.succeeded": "succeeded",
        "payment.failed": "failed",
        "payment.refunded": "refunded",
        "payment.pending": "processing",
        "charge.succeeded": "succeeded",
        "charge.failed": "failed",
        "refund.created": "refunded",
        # Stripe-specific event types
        "payment_intent.succeeded": "succeeded",
        "payment_intent.payment_failed": "failed",
        "payment_intent.canceled": "failed",
        "payment_intent.processing": "processing",
        "charge.refunded": "refunded",
        "charge.dispute.created": "disputed",
    }
    resolved_status = status_mapping.get(event_type, status or payment.get("status"))
    new_status: str = str(resolved_status) if resolved_status is not None else "pending"

    invoice_id = payment.get("invoice_id")
    invoice_status: str | None = None
    if invoice_id:
        if new_status == "succeeded":
            invoice_status = "paid"
        elif new_status == "refunded":
            invoice_status = "refunded"
    await db.update_payment_and_invoice_for_webhook(
        payment["id"],
        invoice_id if invoice_status else None,
        new_status,
        invoice_status,
    )

    return {"status": "processed", "payment_id": payment["id"], "new_status": new_status}


class RefundRequest(BaseModel):
    """Request body for initiating a refund."""

    reason: str = ""
    amount: float | None = None  # None means full refund


@router.post("/{payment_id}/refund")
async def request_refund(
    payment_id: str,
    body: RefundRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, Any]:
    """Initiate a refund for a specific payment.

    Residents can request a refund for their own payments. The refund is processed
    immediately via the payment provider for succeeded payments, or cancelled for
    pending/processing payments.
    """
    db = get_postgres_client()
    payment = await db.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not your payment")

    current_status = payment.get("status", "")
    if current_status in ("refunded", "failed"):
        raise HTTPException(status_code=409, detail=f"Cannot refund payment with status: {current_status}")

    payment_amount = float(payment.get("amount") or 0)
    if body.amount is not None:
        refund_amount = float(body.amount)
        if refund_amount <= 0:
            raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")
        if refund_amount > payment_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Refund amount ({refund_amount}) cannot exceed payment amount ({payment_amount})",
            )
    else:
        refund_amount = payment_amount

    provider = get_payment_provider()
    transaction_id = str(payment.get("transaction_id") or payment.get("id") or "")

    try:
        if current_status == "succeeded":
            result = await provider.refund(
                transaction_id=transaction_id,
                amount=refund_amount,
            )
            new_status = result.get("status", "refunded")
            refund_id = result.get("refund_id", "")
        else:
            # Payment not yet captured — mark as cancelled
            new_status = "cancelled"
            refund_id = f"cancel_{uuid4().hex[:8]}"
    except Exception as exc:
        logger.error(
            "payment_refund_failed",
            payment_id=payment_id,
            error_type=type(exc).__name__,
            error=str(exc)[:500],
        )
        capture_exception_safe(exc, flow="payment_refund", payment_id=payment_id)
        raise HTTPException(status_code=502, detail=f"Refund failed: {exc}") from exc

    invoice_id = payment.get("invoice_id")
    await db.update_payment_and_invoice_for_webhook(
        payment_id,
        invoice_id,
        new_status,
        "refunded" if invoice_id else None,
    )

    logger.info(
        "Refund processed: payment=%s refund_id=%s amount=%s status=%s user=%s reason=%s",
        payment_id,
        refund_id,
        refund_amount,
        new_status,
        current_user.id,
        body.reason,
    )
    return {
        "payment_id": payment_id,
        "refund_id": refund_id,
        "status": new_status,
        "amount": refund_amount,
        "reason": body.reason,
    }


@router.get("/invoices/my", response_model=list[InvoiceResponse])
async def get_my_invoices(
    current_user: UserInDB = Depends(get_current_user),
) -> list[InvoiceResponse]:
    """List all invoices for the current user (via payment_splits)."""
    db = get_postgres_client()
    invoices = await db.list_invoices_for_user(current_user.id)
    result = []
    for inv in invoices:
        subtotal = inv.get("subtotal", 0) or 0
        tax_amount = inv.get("tax_amount", inv.get("tax", round(subtotal * VAT_RATE, 2))) or 0
        result.append(
            InvoiceResponse(
                id=inv.get("id", ""),
                offer_id=inv.get("offer_id", ""),
                subtotal=float(subtotal),
                tax_rate=float(inv.get("tax_rate", VAT_RATE) or VAT_RATE),
                tax_amount=float(tax_amount),
                amount=float(inv.get("total", inv.get("amount", subtotal + tax_amount)) or 0),
                currency=inv.get("currency", "ILS"),
                status=inv.get("status", "pending"),
                payment_type=inv.get("payment_type", "direct"),
                issued_at=_iso_utc(inv.get("created_at")) or "",
                due_date=_iso_utc(inv.get("due_date")),
                items=inv.get("items") or [],
            )
        )
    return result


@router.get("/methods")
async def get_payment_methods(
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Return available payment methods for the current environment.

    Only includes a method when the required credentials are configured,
    so the checkout UI never shows an option that would fail at runtime.
    """
    settings = get_settings()
    provider = settings.PAYMENT_PROVIDER.lower()
    methods = []

    if provider == "mock":
        methods.append({"type": "card", "provider": "mock", "currencies": ["ILS"]})
    elif provider == "stripe" and settings.STRIPE_SECRET_KEY and settings.STRIPE_SECRET_KEY.strip():
        methods.append({"type": "card", "provider": "stripe", "currencies": ["ILS"]})
    elif provider == "bit" and settings.BIT_API_KEY and settings.BIT_API_KEY.strip():
        methods.append({"type": "bit", "provider": "bit", "currencies": ["ILS"]})
    elif provider == "paybox" and settings.PAYBOX_TERMINAL and settings.PAYBOX_API_KEY:
        methods.append({"type": "paybox", "provider": "paybox", "currencies": ["ILS"]})

    return {"methods": methods, "default": methods[0]["type"] if methods else None}


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> InvoiceResponse:
    """Get invoice details by ID.

    Access control: user must have a payment linked to this invoice,
    since invoices are per-offer (not per-user).
    """
    db = get_postgres_client()
    invoice = await db.get_invoice(invoice_id)

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Invoices don't have user_id; verify access via payment_splits or payments
    user_payments = await db.list_payments_for_user(current_user.id)
    has_access = any(p.get("invoice_id") == invoice_id for p in user_payments)
    if not has_access:
        raise HTTPException(status_code=403, detail="Not authorized to view this invoice")

    raw_total = invoice.get("total", invoice.get("amount", 0))
    inv_subtotal = invoice.get("subtotal", round(raw_total / (1 + VAT_RATE), 2))
    inv_tax_amount = invoice.get("tax_amount", round(inv_subtotal * VAT_RATE, 2))
    return InvoiceResponse(
        id=invoice["id"],
        offer_id=invoice.get("offer_id", ""),
        subtotal=inv_subtotal,
        tax_rate=invoice.get("tax_rate", VAT_RATE),
        tax_amount=inv_tax_amount,
        amount=raw_total,
        currency=invoice.get("currency", "ILS"),
        status=invoice.get("status", "unknown"),
        payment_type=invoice.get("payment_type", "escrow"),
        issued_at=invoice.get("created_at", invoice.get("issued_at", "")),
        due_date=invoice.get("due_date"),
        items=invoice.get("items", []),
    )


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> Response:
    """Download invoice as a downloadable HTML document.

    Generates a formatted invoice document that can be printed to PDF
    from the browser. Uses HTML with print-friendly styles.
    """
    db = get_postgres_client()
    invoice = await db.get_invoice(invoice_id)

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Invoices don't have user_id; verify access via a targeted existence check
    rows = await db.execute_query(
        "SELECT 1 FROM payments WHERE invoice_id = $1 AND user_id = $2 LIMIT 1",
        invoice_id,
        current_user.id,
    )
    if not rows:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")

    # Build printable HTML invoice
    items = invoice.get("items", [])
    items_html = ""
    for item in items:
        desc = _html.escape(str(item.get("description", "Service")))
        qty = int(item.get("quantity", 1))
        unit_price = float(item.get("unit_price", item.get("amount", 0)))
        total = float(item.get("total", unit_price * qty))
        items_html += (
            f"<tr><td>{desc}</td><td style='text-align:center'>{qty}</td>"
            f"<td style='text-align:right'>{unit_price:,.2f} ILS</td>"
            f"<td style='text-align:right'>{total:,.2f} ILS</td></tr>"
        )

    if not items_html:
        amount = invoice.get("total", invoice.get("amount", 0))
        items_html = (
            f"<tr><td>Service payment</td><td style='text-align:center'>1</td>"
            f"<td style='text-align:right'>{amount:,.2f} ILS</td>"
            f"<td style='text-align:right'>{amount:,.2f} ILS</td></tr>"
        )

    total_amount = invoice.get("total", invoice.get("amount", 0))
    pdf_subtotal = invoice.get("subtotal", round(total_amount / (1 + VAT_RATE), 2))
    pdf_tax_rate = invoice.get("tax_rate", VAT_RATE)
    pdf_tax_amount = invoice.get("tax_amount", round(pdf_subtotal * pdf_tax_rate, 2))
    pdf_tax_pct = int(round(pdf_tax_rate * 100))
    currency = _html.escape(str(invoice.get("currency", "ILS")))
    issued_at = _html.escape(str(invoice.get("issued_at", invoice.get("created_at", ""))))
    offer_id = _html.escape(str(invoice.get("offer_id", "")))
    status = _html.escape(str(invoice.get("status", "")))
    invoice_number = _html.escape(str(invoice.get("invoice_number", invoice_id[:12])))
    is_paid = status in ("paid", "released")

    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<title>חשבונית {invoice_number}</title>
<style>
  body {{ font-family: Arial, 'Segoe UI', sans-serif; margin: 40px; color: #222; direction: rtl; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }}
  .logo {{ font-size: 28px; font-weight: bold; color: #1976D2; }}
  .logo span {{ font-size: 13px; font-weight: normal; color: #666; display: block; margin-top: 2px; }}
  .invoice-info {{ text-align: left; direction: ltr; }}
  .invoice-info h2 {{ margin: 0 0 8px; color: #1976D2; font-size: 20px; }}
  .invoice-info p {{ margin: 3px 0; color: #555; font-size: 13px; }}
  .divider {{ border: none; border-top: 2px solid #eee; margin: 0 0 24px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 0 0 8px; }}
  th {{ background: #f5f7fa; padding: 10px 12px; text-align: right;
    border-bottom: 2px solid #ddd; font-size: 13px; color: #555; }}
  td {{ padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }}
  .subtotal-section td {{ border-bottom: none; font-size: 13px; color: #555; padding: 6px 12px; }}
  .vat-row td {{ color: #555; font-size: 13px; padding: 6px 12px; border-bottom: none; }}
  .total-row td {{ font-weight: bold; font-size: 16px;
    border-top: 2px solid #222; padding: 12px; background: #f9fafb; }}
  .status {{ display: inline-block; padding: 3px 10px;
    border-radius: 10px; font-size: 12px; font-weight: bold; }}
  .status-paid {{ background: #e8f5e9; color: #2e7d32; }}
  .status-pending {{ background: #fff3e0; color: #e65100; }}
  .legal-note {{ margin-top: 32px; padding: 12px 16px; background: #f9fafb; border-radius: 8px;
    font-size: 11px; color: #888; line-height: 1.6; }}
  .footer {{ margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee;
    font-size: 11px; color: #aaa; text-align: center; }}
  @media print {{ body {{ margin: 20px; }} }}
</style>
</head>
<body>

<div class="header">
  <div class="logo">
    Groupio
    <span>פלטפורמת רכישה קבוצתית לבניינים</span>
  </div>
  <div class="invoice-info">
    <h2>חשבונית מס</h2>
    <p><strong>מספר חשבונית:</strong> {invoice_number}</p>
    <p><strong>תאריך:</strong> {issued_at[:10] if issued_at else "—"}</p>
    <p><strong>הצעה:</strong> {offer_id[:12] if offer_id else "—"}</p>
    <p><strong>סטטוס:</strong>
      <span class="status {"status-paid" if is_paid else "status-pending"}">
        {"שולם" if is_paid else "ממתין"}
      </span>
    </p>
  </div>
</div>
<hr class="divider">

<table>
  <thead>
    <tr>
      <th>תיאור</th>
      <th style="text-align:center">כמות</th>
      <th style="text-align:left">מחיר יחידה</th>
      <th style="text-align:left">סה"כ לפני מע"מ</th>
    </tr>
  </thead>
  <tbody>
    {items_html}
  </tbody>
</table>

<table>
  <tbody>
    <tr class="subtotal-section">
      <td colspan="3" style="text-align:right">סכום לפני מע"מ:</td>
      <td style="text-align:left">{pdf_subtotal:,.2f} {currency}</td>
    </tr>
    <tr class="vat-row">
      <td colspan="3" style="text-align:right">מע"מ {pdf_tax_pct}%:</td>
      <td style="text-align:left">{pdf_tax_amount:,.2f} {currency}</td>
    </tr>
    <tr class="total-row">
      <td colspan="3" style="text-align:right">סה"כ לתשלום (כולל מע"מ):</td>
      <td style="text-align:left">{total_amount:,.2f} {currency}</td>
    </tr>
  </tbody>
</table>

<div class="legal-note">
  עוסק מורשה מס׳: [מספר ע.מ של Groupio]<br>
  חשבונית זו הופקה אוטומטית ומהווה מסמך חוקי בהתאם לתקנות מס ערך מוסף, התשל"ו–1975.<br>
  שיעור מע"מ הנוכחי: {pdf_tax_pct}%.
</div>

<div class="footer">
  <p>Groupio Platform &bull; רכישה קבוצתית לדיירים</p>
  <p>מסמך זה הופק אוטומטית ותקף ללא חתימה.</p>
</div>
</body>
</html>"""

    return Response(
        content=html,
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="invoice-{invoice_id[:8]}.html"',
        },
    )


# ---------------------------------------------------------------------------
# Admin Escrow & Payout endpoints
# ---------------------------------------------------------------------------

admin_router = APIRouter(
    prefix="/admin/payments",
    tags=["Admin Payments"],
    # P0 SECURITY: admin payment endpoints are platform-admin only (admin, super_admin).
    # buildings_manager must NOT access payment summaries, escrow, or payout records.
    dependencies=[Depends(require_admin_only)],
)


class EscrowAccountResponse(BaseModel):
    offer_id: str
    offer_title: str | None = None
    contractor_id: str | None = None
    contractor_name: str | None = None
    total_collected: float
    total_expected: float
    platform_fee: float
    net_payout_amount: float
    currency: str = "ILS"
    escrow_status: str
    payment_type: str = "escrow"
    participants_paid: int
    participants_total: int
    created_at: str


class ContractorPayoutResponse(BaseModel):
    id: str
    contractor_id: str
    contractor_name: str
    offer_id: str
    offer_title: str | None = None
    gross_amount: float
    platform_fee: float
    net_amount: float
    currency: str = "ILS"
    status: str
    approved_by: str | None = None
    approved_at: str | None = None
    paid_at: str | None = None
    created_at: str


class PaymentSummaryResponse(BaseModel):
    total_collected: float
    total_in_escrow: float
    total_released_to_contractors: float
    total_platform_fees: float
    total_refunded: float
    pending_payouts: int
    currency: str = "ILS"


def _platform_fee_rate() -> float:
    # Terms of Service (section 6) states "up to 3%" — must stay in sync with ToS.
    return 0.03


async def _build_escrow_for_offer(db: Any, offer: dict) -> EscrowAccountResponse:
    """Build an escrow account view from an offer and its invoices/splits."""
    offer_id = offer["id"]
    invoice = await db.get_invoice_by_offer(offer_id)

    # Get participants
    participants = await db.get_offer_participants(offer_id)
    total_participants = len(participants) if participants else offer.get("participants", 0)

    # Calculate totals from invoice + splits
    total_expected = invoice["total"] if invoice else offer.get("base_price", 0) * total_participants
    splits = await db.list_payment_splits(invoice["id"]) if invoice else []
    paid_splits = [s for s in splits if s.get("status") == "paid"]
    total_collected = sum(s.get("amount", 0) for s in paid_splits)
    participants_paid = len(paid_splits)

    fee_rate = _platform_fee_rate()
    platform_fee = round(total_expected * fee_rate, 2)
    net_payout = round(total_expected - platform_fee, 2)

    # Determine escrow status
    if total_collected <= 0:
        escrow_status = "collecting"
    elif participants_paid < total_participants:
        escrow_status = "collecting"
    elif offer.get("status") == "completed":
        escrow_status = "released"
    else:
        escrow_status = "held"

    # Get contractor info
    contractor_id = offer.get("contractor_id")
    contractor_name = None
    if contractor_id:
        ctr = await db.get_contractor(contractor_id)
        if ctr:
            contractor_name = ctr.get("business_name", ctr.get("name"))

    # Determine payment type from invoice or offer
    payment_type = "escrow"
    if invoice:
        payment_type = invoice.get("payment_type", "escrow")

    return EscrowAccountResponse(
        offer_id=offer_id,
        offer_title=offer.get("title"),
        contractor_id=contractor_id,
        contractor_name=contractor_name,
        total_collected=total_collected,
        total_expected=total_expected,
        platform_fee=platform_fee,
        net_payout_amount=net_payout,
        escrow_status=escrow_status,
        payment_type=payment_type,
        participants_paid=participants_paid,
        participants_total=total_participants,
        created_at=offer.get("created_at", ""),
    )


@admin_router.get("/summary", response_model=PaymentSummaryResponse)
async def get_payment_summary(
    admin_user: UserInDB = Depends(require_admin_only),
) -> PaymentSummaryResponse:
    """Get a high-level summary of all payment activity for the platform."""
    db = get_postgres_client()

    # Aggregate payment totals at DB level to avoid loading all rows
    payment_agg = await db.execute_query("SELECT status, SUM(amount) as total FROM payments GROUP BY status") or []
    payment_by_status: dict[str, float] = {r["status"]: float(r["total"] or 0) for r in payment_agg}
    total_collected = sum(payment_by_status.get(s, 0) for s in ("succeeded", "completed"))
    total_refunded = payment_by_status.get("refunded", 0)

    # Aggregate invoice totals at DB level
    invoice_agg = (
        await db.execute_query("SELECT status, SUM(total) as total, COUNT(*) as cnt FROM invoices GROUP BY status")
        or []
    )
    invoice_by_status: dict[str, dict] = {r["status"]: r for r in invoice_agg}
    total_released = float((invoice_by_status.get("released") or {}).get("total") or 0)
    pending_payouts = int((invoice_by_status.get("paid") or {}).get("cnt") or 0)
    total_in_escrow = total_collected - total_released - total_refunded

    fee_rate = _platform_fee_rate()
    total_platform_fees = round(total_collected * fee_rate, 2)

    return PaymentSummaryResponse(
        total_collected=total_collected,
        total_in_escrow=max(total_in_escrow, 0),
        total_released_to_contractors=total_released,
        total_platform_fees=total_platform_fees,
        total_refunded=total_refunded,
        pending_payouts=pending_payouts,
    )


@admin_router.get("/escrow", response_model=list[EscrowAccountResponse])
async def get_escrow_accounts(
    admin_user: UserInDB = Depends(require_admin_only),
) -> list[EscrowAccountResponse]:
    """Get all active escrow accounts (one per offer with payments)."""
    db = get_postgres_client()

    # Get offers that have invoices
    offers_with_invoices = await db.execute_query(
        "SELECT DISTINCT o.* FROM offers o "
        "JOIN invoices i ON i.offer_id = o.id "
        "WHERE o.status NOT IN ('draft', 'cancelled') "
        "ORDER BY o.created_at DESC"
    )
    offers = offers_with_invoices if offers_with_invoices else []

    results: list[EscrowAccountResponse] = []
    for offer in offers:
        try:
            escrow = await _build_escrow_for_offer(db, offer)
            results.append(escrow)
        except Exception as exc:
            logger.warning("Failed to build escrow for offer %s: %s", offer.get("id"), exc)

    return results


@admin_router.get("/payouts", response_model=list[ContractorPayoutResponse])
async def get_contractor_payouts(
    admin_user: UserInDB = Depends(require_admin_only),
) -> list[ContractorPayoutResponse]:
    """Get all contractor payout records."""
    db = get_postgres_client()

    # Get invoices with paid status (these represent potential payouts)
    paid_invoices = await db.execute_query(
        "SELECT i.*, o.title as offer_title, o.contractor_id "
        "FROM invoices i JOIN offers o ON o.id = i.offer_id "
        "WHERE i.status IN ('paid', 'released') "
        "ORDER BY i.created_at DESC"
    )
    invoices = paid_invoices if paid_invoices else []

    # Batch-fetch all contractors in one query to avoid N+1
    contractor_ids = list({inv.get("contractor_id") for inv in invoices if inv.get("contractor_id")})
    contractor_names: dict[str, str] = {}
    if contractor_ids:
        rows = (
            await db.execute_query(
                "SELECT id, business_name, name FROM contractors WHERE id = ANY($1::uuid[])",
                contractor_ids,
            )
            or []
        )
        for row in rows:
            contractor_names[row["id"]] = row.get("business_name") or row.get("name") or "Unknown"

    results: list[ContractorPayoutResponse] = []
    for inv in invoices:
        contractor_id = inv.get("contractor_id", "")
        contractor_name = contractor_names.get(contractor_id, "Unknown")

        gross = inv.get("total", 0)
        fee_rate = _platform_fee_rate()
        fee = round(gross * fee_rate, 2)
        net = round(gross - fee, 2)

        status = "completed" if inv.get("status") == "released" else "pending"

        results.append(
            ContractorPayoutResponse(
                id=inv.get("id", ""),
                contractor_id=contractor_id,
                contractor_name=contractor_name,
                offer_id=inv.get("offer_id", ""),
                offer_title=inv.get("offer_title"),
                gross_amount=gross,
                platform_fee=fee,
                net_amount=net,
                status=status,
                paid_at=inv.get("paid_at"),
                created_at=inv.get("created_at", ""),
            )
        )

    return results


@admin_router.post("/payouts/{invoice_id}/approve")
async def approve_contractor_payout(
    invoice_id: str,
    admin_user: UserInDB = Depends(require_admin_only),
) -> dict:
    """Approve a contractor payout -- marks the invoice as approved for release."""
    db = get_postgres_client()

    invoice = await db.get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("status") != "paid":
        raise HTTPException(
            status_code=400,
            detail=f"Invoice status is '{invoice.get('status')}', must be 'paid' to approve payout",
        )

    offer_id = invoice.get("offer_id")
    if offer_id:
        offer = await db.get_offer(offer_id)
        if not offer or offer.get("status") != "completed":
            raise HTTPException(
                status_code=400,
                detail="Cannot approve payout: offer is not completed",
            )

    await db.update_invoice(invoice_id, {"status": "released"})

    logger.info(
        "Admin %s approved payout for invoice %s (offer %s)",
        admin_user.email,
        invoice_id,
        offer_id,
    )

    try:
        await db.create_audit_log(
            {
                "user_id": admin_user.id if hasattr(admin_user, "id") else None,
                "action": "payout_approved",
                "resource_type": "invoice",
                "resource_id": invoice_id,
                "details": {
                    "old_status": "paid",
                    "new_status": "released",
                    "offer_id": offer_id,
                    "amount": invoice.get("total", 0),
                    "approved_by": admin_user.email,
                },
            }
        )
    except Exception:
        logger.exception("Failed to write payout approval audit log (non-fatal)")

    return {
        "status": "approved",
        "invoice_id": invoice_id,
        "approved_by": admin_user.email,
    }


@admin_router.post("/escrow/{offer_id}/release")
async def release_escrow(
    offer_id: str,
    admin_user: UserInDB = Depends(require_admin_only),
) -> dict:
    """Release escrowed funds to the contractor for a given offer.

    This marks the invoice as 'released' and (in production) triggers
    the actual bank transfer to the contractor.
    """
    db = get_postgres_client()

    invoice = await db.get_invoice_by_offer(offer_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="No invoice found for this offer")

    current_status = invoice.get("status")
    # Escrow lifecycle: collecting → held (== "paid") → released.
    # Only allow release from "paid" (all participants have paid, funds are held).
    # "pending" means collection is still in progress — releasing from pending skips
    # the collection-verification step and violates the payment rules.
    if current_status != "paid":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot release escrow: invoice status is '{current_status}'. "
                "Escrow can only be released when status is 'paid' (all funds collected)."
            ),
        )

    # Verify offer is in a valid work-completion state before releasing funds.
    offer = await db.get_offer(offer_id)
    if not offer or offer.get("status") not in ("in_progress", "completed"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot release escrow: offer status is '{offer.get('status') if offer else 'not found'}'. "
                "Offer must be in_progress or completed before escrow can be released."
            ),
        )

    # Mark as released
    await db.update_invoice(
        invoice["id"],
        {
            "status": "released",
            "paid_at": datetime.now(UTC).isoformat(),
        },
    )

    # Update the offer status to completed
    await db.update_offer(offer_id, {"status": "completed"})

    logger.info(
        "Admin %s released escrow for offer %s (invoice %s, amount %s)",
        admin_user.email,
        offer_id,
        invoice["id"],
        invoice.get("total"),
    )

    # Audit log — escrow release is a payment lifecycle transition.
    try:
        await db.create_audit_log(
            {
                "user_id": admin_user.id if hasattr(admin_user, "id") else None,
                "action": "escrow_released",
                "resource_type": "invoice",
                "resource_id": invoice["id"],
                "details": {
                    "old_status": current_status,
                    "new_status": "released",
                    "offer_id": offer_id,
                    "amount": invoice.get("total", 0),
                    "released_by": admin_user.email,
                },
            }
        )
    except Exception:
        logger.exception("Failed to write escrow release audit log (non-fatal)")

    return {
        "status": "released",
        "offer_id": offer_id,
        "invoice_id": invoice["id"],
        "amount_released": invoice.get("total", 0),
        "platform_fee": round(invoice.get("total", 0) * _platform_fee_rate(), 2),
        "released_by": admin_user.email,
    }
