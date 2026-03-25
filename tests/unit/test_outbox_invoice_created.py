"""Invoice-created outbox enqueue (idempotency + flags)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.messaging.outbox_helpers import try_enqueue_invoice_created_event


@pytest.mark.asyncio
async def test_invoice_created_skipped_when_flags_off() -> None:
    db = AsyncMock()
    with patch("src.messaging.outbox_helpers.get_settings") as gs:
        m = MagicMock()
        m.ENABLE_OUTBOX = False
        m.ENABLE_PAYMENT_EVENTS = False
        gs.return_value = m
        oid = await try_enqueue_invoice_created_event(
            db,
            invoice_id="inv-1",
            offer_id="off-1",
            user_id="u1",
            amount=10.0,
            currency="ILS",
            payment_type="direct",
        )
    assert oid is None
    db.insert_outbox_event.assert_not_called()


@pytest.mark.asyncio
async def test_invoice_created_passes_conn_and_idempotency_key() -> None:
    db = AsyncMock()
    db.insert_outbox_event = AsyncMock(return_value="outbox-uuid")
    fake_conn = object()
    with patch("src.messaging.outbox_helpers.get_settings") as gs:
        m = MagicMock()
        m.ENABLE_OUTBOX = True
        m.ENABLE_PAYMENT_EVENTS = True
        gs.return_value = m
        oid = await try_enqueue_invoice_created_event(
            db,
            invoice_id="inv-1",
            offer_id="off-1",
            user_id="u1",
            amount=10.0,
            currency="ILS",
            payment_type="direct",
            conn=fake_conn,
        )
    assert oid == "outbox-uuid"
    db.insert_outbox_event.assert_awaited_once()
    args, call_kw = db.insert_outbox_event.await_args
    assert args[0] == "invoices.created"
    assert args[1] == "invoices.created"
    assert call_kw["conn"] is fake_conn
    assert call_kw["idempotency_key"] == "invoice:inv-1:created"
