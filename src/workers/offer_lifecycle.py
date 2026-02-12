"""Offer lifecycle automation - handles state transitions and notifications."""

import logging
from datetime import datetime, timezone
from typing import Any

from src.databases.postgres import get_postgres_client
from src.services.invoice import get_invoice_service

logger = logging.getLogger(__name__)


class OfferLifecycleManager:
    """Manages automated offer lifecycle transitions."""

    def __init__(self):
        self._db = get_postgres_client()

    async def on_participant_joined(self, offer_id: str, user_id: str) -> dict[str, Any]:
        """Called when a participant joins an offer. Checks if thresholds are met."""
        offer = await self._db.get_offer(offer_id)
        if not offer:
            return {"action": "none", "reason": "offer_not_found"}

        current = offer.get("current_participants", 0)
        min_required = offer.get("min_participants", 5)

        # Auto-publish if minimum reached and still in draft
        if offer.get("status") == "draft" and current >= min_required:
            await self._db.update_offer(offer_id, {"status": "pending"})
            logger.info("Offer %s auto-published (min participants reached)", offer_id)
            return {"action": "auto_published", "participants": current}

        # Auto-start matching if pending and min reached
        if offer.get("status") == "pending" and current >= min_required:
            await self._db.update_offer(offer_id, {"status": "matching"})
            logger.info("Offer %s moved to matching (threshold met)", offer_id)
            return {"action": "matching_started", "participants": current}

        return {"action": "none", "participants": current}

    async def on_contractor_matched(self, offer_id: str, contractor_id: str) -> dict[str, Any]:
        """Called when a contractor is matched to an offer. Generates invoice."""
        offer = await self._db.get_offer(offer_id)
        if not offer:
            return {"action": "none"}

        # Generate invoice
        try:
            invoice_svc = get_invoice_service()
            invoice = await invoice_svc.create_invoice(
                offer_id=offer_id,
                contractor_id=contractor_id,
                subtotal=offer.get("base_price", 0),
            )

            # Split payment among participants
            participants = await self._db.get_offer_participants(offer_id)
            if participants:
                per_person = invoice["total"] / len(participants)
                splits = [
                    {"user_id": p["user_id"], "amount": round(per_person, 2)}
                    for p in participants
                ]
                await invoice_svc.split_payment(invoice["id"], splits)

            logger.info("Invoice %s generated for offer %s", invoice["id"], offer_id)
            return {"action": "invoice_generated", "invoice_id": invoice["id"]}
        except Exception as exc:
            logger.error("Failed to generate invoice for offer %s: %s", offer_id, exc)
            return {"action": "invoice_failed", "error": str(exc)}

    async def on_offer_completed(self, offer_id: str) -> dict[str, Any]:
        """Called when an offer is marked as completed."""
        offer = await self._db.get_offer(offer_id)
        if not offer:
            return {"action": "none"}

        await self._db.update_offer(offer_id, {"status": "completed"})
        logger.info("Offer %s completed", offer_id)
        return {"action": "completed"}

    async def on_offer_cancelled(self, offer_id: str) -> dict[str, Any]:
        """Called when an offer is cancelled. Handles refunds if payments exist."""
        offer = await self._db.get_offer(offer_id)
        if not offer:
            return {"action": "none"}

        # Check for existing invoice/payments
        invoice_svc = get_invoice_service()
        invoice = await invoice_svc.get_offer_invoice(offer_id)

        if invoice and invoice.get("status") == "paid":
            logger.info("Offer %s cancelled with paid invoice - refund needed", offer_id)
            return {"action": "refund_needed", "invoice_id": invoice["id"]}

        await self._db.update_offer(offer_id, {"status": "cancelled"})
        logger.info("Offer %s cancelled", offer_id)
        return {"action": "cancelled"}


_lifecycle_manager: OfferLifecycleManager | None = None

def get_offer_lifecycle() -> OfferLifecycleManager:
    global _lifecycle_manager
    if _lifecycle_manager is None:
        _lifecycle_manager = OfferLifecycleManager()
    return _lifecycle_manager
