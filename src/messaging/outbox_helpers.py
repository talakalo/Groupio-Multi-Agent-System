"""Helpers for enqueueing outbox rows from API routes (feature-flag aware)."""

from __future__ import annotations

import logging
from typing import Any

from src.config.settings import get_settings
from src.databases.postgres import PostgresClient

logger = logging.getLogger(__name__)


async def try_enqueue_outbox(
    db: PostgresClient,
    routing_key: str,
    event_name: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None = None,
    conn: Any | None = None,
) -> str | None:
    """Insert outbox row when ``ENABLE_OUTBOX`` is true. Returns outbox id or None.

    On failure or disabled flag, returns None without raising (callers keep transactional success).
    Pass ``conn`` to join the same asyncpg transaction as other writes.
    """
    if not get_settings().ENABLE_OUTBOX:
        return None
    try:
        oid = await db.insert_outbox_event(
            routing_key,
            event_name,
            payload,
            idempotency_key=idempotency_key,
            conn=conn,
        )
        if oid:
            logger.debug("outbox enqueued id=%s event=%s", oid, event_name)
        return oid
    except Exception:
        logger.exception("try_enqueue_outbox failed event=%s", event_name)
        return None


async def try_enqueue_crm(
    db: PostgresClient,
    routing_key: str,
    event_name: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None = None,
) -> str | None:
    """Enqueue CRM projection event (requires outbox + CRM sync flags)."""
    s = get_settings()
    if not (s.ENABLE_OUTBOX and s.ENABLE_CRM_SYNC):
        return None
    return await try_enqueue_outbox(
        db,
        routing_key,
        event_name,
        payload,
        idempotency_key=idempotency_key,
    )


async def try_enqueue_payment_event(
    db: PostgresClient,
    routing_key: str,
    event_name: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None = None,
    conn: Any | None = None,
) -> str | None:
    """Enqueue payment-derived side-effect event."""
    s = get_settings()
    if not (s.ENABLE_OUTBOX and s.ENABLE_PAYMENT_EVENTS):
        return None
    return await try_enqueue_outbox(
        db,
        routing_key,
        event_name,
        payload,
        idempotency_key=idempotency_key,
        conn=conn,
    )


async def try_enqueue_invoice_created_event(
    db: PostgresClient,
    *,
    invoice_id: str,
    offer_id: str,
    user_id: str,
    amount: float,
    currency: str,
    payment_type: str,
    conn: Any | None = None,
) -> str | None:
    """Emit ``invoices.created`` after invoice row is persisted (idempotent per invoice id)."""
    from src.messaging.topics import RK_INVOICES_CREATED

    s = get_settings()
    if not (s.ENABLE_OUTBOX and s.ENABLE_PAYMENT_EVENTS):
        return None
    env_payload = {
        "invoice_id": invoice_id,
        "offer_id": offer_id,
        "user_id": user_id,
        "amount": amount,
        "currency": currency,
        "payment_type": payment_type,
    }
    try:
        from src.messaging.envelope import EventEnvelope

        env = EventEnvelope(
            event_name="invoices.created",
            entity_type="invoice",
            entity_id=invoice_id,
            idempotency_key=f"invoice:{invoice_id}:created",
            payload=env_payload,
        )
        return await try_enqueue_payment_event(
            db,
            RK_INVOICES_CREATED,
            env.event_name,
            env.to_json_dict(),
            idempotency_key=env.idempotency_key,
            conn=conn,
        )
    except Exception:
        logger.exception("try_enqueue_invoice_created_event failed invoice_id=%s", invoice_id)
        return None
