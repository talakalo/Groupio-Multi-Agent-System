"""Invoice service – creates invoices, splits payments among participants."""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from src.databases.postgres import get_postgres_client

logger = logging.getLogger(__name__)


class InvoiceService:
    """High-level service for invoice lifecycle management."""

    def __init__(self) -> None:
        self._db = get_postgres_client()

    # ------------------------------------------------------------------
    # Invoice CRUD
    # ------------------------------------------------------------------

    async def create_invoice(
        self,
        offer_id: str,
        contractor_id: str,
        subtotal: float,
        tax_rate: float = 0.17,
        platform_fee_rate: float = 0.05,
    ) -> dict[str, Any]:
        """Create an invoice record in the DB.

        Calculates tax, platform fee, and total automatically.
        """
        invoice_id = str(uuid4())
        invoice_number = await self.generate_invoice_number()
        tax = round(subtotal * tax_rate, 2)
        platform_fee = round(subtotal * platform_fee_rate, 2)
        total = round(subtotal + tax + platform_fee, 2)

        data: dict[str, Any] = {
            "id": invoice_id,
            "invoice_number": invoice_number,
            "offer_id": offer_id,
            "contractor_id": contractor_id,
            "subtotal": subtotal,
            "tax_rate": tax_rate,
            "tax": tax,
            "platform_fee_rate": platform_fee_rate,
            "platform_fee": platform_fee,
            "total": total,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        result = await self._db.create_invoice(data)
        logger.info(
            "Invoice created: id=%s number=%s offer=%s total=%.2f",
            invoice_id,
            invoice_number,
            offer_id,
            total,
        )
        return result

    async def generate_invoice_number(self) -> str:
        """Generate a sequential invoice number like ``INV-2026-00001``."""
        year = datetime.now(timezone.utc).year
        next_num = await self._db.get_next_invoice_number()
        return f"INV-{year}-{next_num}"

    # ------------------------------------------------------------------
    # Payment splitting
    # ------------------------------------------------------------------

    async def split_payment(
        self,
        invoice_id: str,
        participants: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Create payment_split records for each participant.

        Each entry in *participants* must contain at least ``user_id`` and
        ``amount``.  Optionally include ``unit_count``.
        """
        splits: list[dict[str, Any]] = []
        for p in participants:
            split_data: dict[str, Any] = {
                "id": str(uuid4()),
                "invoice_id": invoice_id,
                "user_id": p["user_id"],
                "amount": p["amount"],
                "unit_count": p.get("unit_count", 1),
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            result = await self._db.create_payment_split(split_data)
            splits.append(result)

        logger.info(
            "Payment split created: invoice=%s participants=%d",
            invoice_id,
            len(splits),
        )
        return splits

    # ------------------------------------------------------------------
    # Status management
    # ------------------------------------------------------------------

    async def mark_as_paid(
        self,
        invoice_id: str,
        payment_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Mark an invoice as paid and store the payment reference.

        *payment_data* should contain ``transaction_id`` and optionally
        ``payment_method``, ``paid_at``, etc.
        """
        update: dict[str, Any] = {
            "status": "paid",
            "paid_at": payment_data.get("paid_at", datetime.now(timezone.utc).isoformat()),
            "transaction_id": payment_data.get("transaction_id"),
            "payment_method": payment_data.get("payment_method"),
        }
        result = await self._db.update_invoice(invoice_id, update)
        logger.info(
            "Invoice marked as paid: id=%s txn=%s",
            invoice_id,
            payment_data.get("transaction_id"),
        )
        return result

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def get_user_invoices(self, user_id: str) -> list[dict[str, Any]]:
        """Return all invoices where the user is a participant."""
        return await self._db.list_invoices_for_user(user_id)

    async def get_offer_invoice(self, offer_id: str) -> dict[str, Any] | None:
        """Return the invoice associated with an offer, if any."""
        return await self._db.get_invoice_by_offer(offer_id)


# ------------------------------------------------------------------
# Singleton factory
# ------------------------------------------------------------------

_invoice_service: InvoiceService | None = None


def get_invoice_service() -> InvoiceService:
    """Get or create the singleton InvoiceService instance."""
    global _invoice_service
    if _invoice_service is None:
        _invoice_service = InvoiceService()
    return _invoice_service
