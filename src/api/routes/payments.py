"""Payment API routes – resident payments + admin escrow/payout management."""

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.api.middleware.auth import get_admin_user, get_current_user
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB
from src.services.payment import get_payment_provider

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Payments"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class PaymentInitiateRequest(BaseModel):
    """Request body for initiating a payment."""

    offer_id: str
    payment_method_id: str | None = None


class PaymentResponse(BaseModel):
    """Standard payment response."""

    id: str
    user_id: str
    offer_id: str
    amount: float
    currency: str
    status: str
    transaction_id: str | None = None
    created_at: str


class InvoiceResponse(BaseModel):
    """Standard invoice response."""

    id: str
    user_id: str
    offer_id: str
    amount: float
    currency: str
    status: str
    issued_at: str
    due_date: str | None = None
    items: list[dict] = []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/my", response_model=list[PaymentResponse])
async def get_my_payments(
    current_user: UserInDB = Depends(get_current_user),
) -> list[PaymentResponse]:
    """Get the current user's payment history."""
    db = get_postgres_client()
    payments = await db.list_payments_for_user(current_user.id)
    return [
        PaymentResponse(
            id=p.get("id", ""),
            user_id=p.get("user_id", current_user.id),
            offer_id=p.get("offer_id", ""),
            amount=p.get("amount", 0),
            currency=p.get("currency", "ILS"),
            status=p.get("status", "unknown"),
            transaction_id=p.get("transaction_id"),
            created_at=p.get("created_at", datetime.now(timezone.utc).isoformat()),
        )
        for p in payments
    ]


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
    provider = get_payment_provider()

    # Verify the offer exists and the user is associated with it
    offer = await db.get_offer(request.offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    # Check if the user is a participant of this offer's building
    building_id = offer.get("building_id")
    if building_id:
        is_resident = await db.is_user_in_building(current_user.id, building_id)
        if not is_resident:
            raise HTTPException(
                status_code=403,
                detail="You are not a participant of this offer's building",
            )

    # Check for existing unpaid invoice or create one
    existing_invoice = await db.get_invoice_for_offer(current_user.id, request.offer_id)
    if not existing_invoice:
        invoice_id = str(uuid4())
        amount = offer.get("price_per_unit", 0)
        invoice_data = {
            "id": invoice_id,
            "user_id": current_user.id,
            "offer_id": request.offer_id,
            "amount": amount,
            "currency": "ILS",
            "status": "pending",
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "items": [
                {
                    "description": offer.get("title", "Group offer"),
                    "quantity": 1,
                    "unit_price": amount,
                }
            ],
        }
        await db.create_invoice(invoice_data)
        existing_invoice = invoice_data
    else:
        amount = existing_invoice.get("amount", 0)

    # Create payment record
    payment_id = str(uuid4())
    payment_data = {
        "id": payment_id,
        "user_id": current_user.id,
        "offer_id": request.offer_id,
        "invoice_id": existing_invoice.get("id"),
        "amount": amount,
        "currency": "ILS",
        "status": "processing",
        "payment_method_id": request.payment_method_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Call payment provider
    try:
        charge_result = await provider.create_charge(
            amount=amount,
            currency="ILS",
            customer_id=current_user.id,
            metadata={
                "offer_id": request.offer_id,
                "payment_id": payment_id,
                "user_email": current_user.email,
            },
        )
        payment_data["transaction_id"] = charge_result.get("transaction_id")
        payment_data["status"] = charge_result.get("status", "processing")
    except Exception as exc:
        logger.error("Payment provider error for payment %s: %s", payment_id, exc)
        payment_data["status"] = "failed"

    await db.create_payment(payment_data)

    # Update invoice status if payment succeeded
    if payment_data["status"] == "succeeded":
        await db.update_invoice(existing_invoice["id"], {"status": "paid"})

    return PaymentResponse(
        id=payment_data["id"],
        user_id=payment_data["user_id"],
        offer_id=payment_data["offer_id"],
        amount=payment_data["amount"],
        currency=payment_data["currency"],
        status=payment_data["status"],
        transaction_id=payment_data.get("transaction_id"),
        created_at=payment_data["created_at"],
    )


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

    return PaymentResponse(
        id=payment["id"],
        user_id=payment["user_id"],
        offer_id=payment.get("offer_id", ""),
        amount=payment.get("amount", 0),
        currency=payment.get("currency", "ILS"),
        status=payment.get("status", "unknown"),
        transaction_id=payment.get("transaction_id"),
        created_at=payment.get("created_at", ""),
    )


@router.post("/webhook")
async def payment_webhook(request: Request) -> dict:
    """Handle payment provider webhook callbacks.

    No authentication required — the provider authenticates via
    signature headers which should be verified in production.
    """
    body = await request.json()
    logger.info("Payment webhook received: %s", body.get("event_type", "unknown"))

    transaction_id = body.get("transaction_id")
    event_type = body.get("event_type")
    status = body.get("status")

    if not transaction_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing required webhook fields")

    db = get_postgres_client()

    # Look up the payment by transaction_id
    payment = await db.get_payment_by_transaction(transaction_id)
    if not payment:
        logger.warning("Webhook for unknown transaction: %s", transaction_id)
        # Return 200 to avoid provider retries for unknown transactions
        return {"status": "ignored", "reason": "unknown_transaction"}

    # Map provider status to our internal status
    status_mapping = {
        "payment.succeeded": "succeeded",
        "payment.failed": "failed",
        "payment.refunded": "refunded",
        "payment.pending": "processing",
        "charge.succeeded": "succeeded",
        "charge.failed": "failed",
        "refund.created": "refunded",
    }
    new_status = status_mapping.get(event_type, status or payment.get("status"))

    await db.update_payment(payment["id"], {"status": new_status})

    # Update the related invoice if payment succeeded or was refunded
    invoice_id = payment.get("invoice_id")
    if invoice_id:
        if new_status == "succeeded":
            await db.update_invoice(invoice_id, {"status": "paid"})
        elif new_status == "refunded":
            await db.update_invoice(invoice_id, {"status": "refunded"})

    return {"status": "processed", "payment_id": payment["id"], "new_status": new_status}


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> InvoiceResponse:
    """Get invoice details by ID."""
    db = get_postgres_client()
    invoice = await db.get_invoice(invoice_id)

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this invoice")

    return InvoiceResponse(
        id=invoice["id"],
        user_id=invoice["user_id"],
        offer_id=invoice.get("offer_id", ""),
        amount=invoice.get("amount", 0),
        currency=invoice.get("currency", "ILS"),
        status=invoice.get("status", "unknown"),
        issued_at=invoice.get("issued_at", ""),
        due_date=invoice.get("due_date"),
        items=invoice.get("items", []),
    )


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Download invoice as PDF.

    Currently returns a JSON placeholder. In production this will
    generate and return a PDF binary using a template engine.
    """
    db = get_postgres_client()
    invoice = await db.get_invoice(invoice_id)

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")

    # Placeholder: return invoice data as JSON until PDF generation is implemented
    return {
        "message": "PDF generation not yet implemented",
        "invoice_id": invoice_id,
        "invoice_data": {
            "id": invoice["id"],
            "user_id": invoice["user_id"],
            "offer_id": invoice.get("offer_id"),
            "amount": invoice.get("amount"),
            "currency": invoice.get("currency", "ILS"),
            "status": invoice.get("status"),
            "issued_at": invoice.get("issued_at"),
            "items": invoice.get("items", []),
        },
    }


# ---------------------------------------------------------------------------
# Admin Escrow & Payout endpoints
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/admin/payments", tags=["Admin Payments"])


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
    return 0.05


async def _build_escrow_for_offer(db: Any, offer: dict) -> EscrowAccountResponse:
    """Build an escrow account view from an offer and its invoices/splits."""
    offer_id = offer["id"]
    invoice = await db.get_invoice_by_offer(offer_id)

    # Get participants
    participants = await db.get_offer_participants(offer_id) if hasattr(db, "get_offer_participants") else []
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
    if contractor_id and hasattr(db, "get_contractor"):
        ctr = await db.get_contractor(contractor_id)
        if ctr:
            contractor_name = ctr.get("business_name", ctr.get("name"))

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
        participants_paid=participants_paid,
        participants_total=total_participants,
        created_at=offer.get("created_at", ""),
    )


@admin_router.get("/summary", response_model=PaymentSummaryResponse)
async def get_payment_summary(
    admin_user: UserInDB = Depends(get_admin_user),
) -> PaymentSummaryResponse:
    """Get a high-level summary of all payment activity for the platform."""
    db = get_postgres_client()

    # Get all invoices to compute totals
    all_payments_query = await db.execute_query(
        "SELECT status, amount FROM payments"
    )
    payments = all_payments_query if all_payments_query else []

    total_collected = sum(
        p.get("amount", 0)
        for p in payments
        if p.get("status") in ("succeeded", "completed")
    )
    total_refunded = sum(
        p.get("amount", 0) for p in payments if p.get("status") == "refunded"
    )

    # Estimate escrow: payments succeeded on non-completed offers
    all_invoices_query = await db.execute_query(
        "SELECT id, total, status, offer_id FROM invoices"
    )
    invoices = all_invoices_query if all_invoices_query else []
    paid_invoices = [i for i in invoices if i.get("status") == "paid"]
    total_released = sum(
        i.get("total", 0) for i in invoices if i.get("status") == "released"
    )
    total_in_escrow = total_collected - total_released - total_refunded

    fee_rate = _platform_fee_rate()
    total_platform_fees = round(total_collected * fee_rate, 2)

    # Pending payouts: invoices that are paid but not released
    pending_payouts = len(paid_invoices)

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
    admin_user: UserInDB = Depends(get_admin_user),
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
    admin_user: UserInDB = Depends(get_admin_user),
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

    results: list[ContractorPayoutResponse] = []
    for inv in invoices:
        contractor_id = inv.get("contractor_id", "")
        contractor_name = "Unknown"
        if contractor_id and hasattr(db, "get_contractor"):
            ctr = await db.get_contractor(contractor_id)
            if ctr:
                contractor_name = ctr.get("business_name", ctr.get("name", "Unknown"))

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
    admin_user: UserInDB = Depends(get_admin_user),
) -> dict:
    """Approve a contractor payout – marks the invoice as approved for release."""
    db = get_postgres_client()

    invoice = await db.get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("status") != "paid":
        raise HTTPException(
            status_code=400,
            detail=f"Invoice status is '{invoice.get('status')}', must be 'paid' to approve payout",
        )

    await db.update_invoice(invoice_id, {"status": "released"})

    logger.info(
        "Admin %s approved payout for invoice %s (offer %s)",
        admin_user.email,
        invoice_id,
        invoice.get("offer_id"),
    )

    return {
        "status": "approved",
        "invoice_id": invoice_id,
        "approved_by": admin_user.email,
    }


@admin_router.post("/escrow/{offer_id}/release")
async def release_escrow(
    offer_id: str,
    admin_user: UserInDB = Depends(get_admin_user),
) -> dict:
    """Release escrowed funds to the contractor for a given offer.

    This marks the invoice as 'released' and (in production) triggers
    the actual bank transfer to the contractor.
    """
    db = get_postgres_client()

    invoice = await db.get_invoice_by_offer(offer_id)
    if not invoice:
        raise HTTPException(
            status_code=404, detail="No invoice found for this offer"
        )

    current_status = invoice.get("status")
    if current_status not in ("paid", "pending"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot release escrow: invoice status is '{current_status}'",
        )

    # Mark as released
    await db.update_invoice(invoice["id"], {
        "status": "released",
        "paid_at": datetime.now(timezone.utc).isoformat(),
    })

    # Update the offer status to completed
    await db.update_offer(offer_id, {"status": "completed"})

    logger.info(
        "Admin %s released escrow for offer %s (invoice %s, amount %s)",
        admin_user.email,
        offer_id,
        invoice["id"],
        invoice.get("total"),
    )

    return {
        "status": "released",
        "offer_id": offer_id,
        "invoice_id": invoice["id"],
        "amount_released": invoice.get("total", 0),
        "platform_fee": round(invoice.get("total", 0) * _platform_fee_rate(), 2),
        "released_by": admin_user.email,
    }
