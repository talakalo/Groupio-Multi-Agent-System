"""Payment API routes."""

import logging
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.api.middleware.auth import get_current_user
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
            created_at=p.get("created_at", datetime.now(UTC).isoformat()),
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
            "issued_at": datetime.now(UTC).isoformat(),
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
        "created_at": datetime.now(UTC).isoformat(),
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
