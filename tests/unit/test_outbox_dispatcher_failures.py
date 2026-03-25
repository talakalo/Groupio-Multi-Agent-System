"""Outbox dispatcher batch processing: publish failure → mark_failed (no HTTP transaction)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.workers.outbox_dispatcher import _process_outbox_rows


@pytest.mark.asyncio
async def test_process_rows_marks_failed_when_publish_returns_false() -> None:
    row = {
        "id": "ob-1",
        "routing_key": "notifications.send_requested",
        "event_name": "notifications.offer_joined_email",
        "payload": {"event_name": "notifications.offer_joined_email", "payload": {}},
    }
    db = AsyncMock()
    db.mark_outbox_event_published = AsyncMock()
    db.mark_outbox_event_failed = AsyncMock()

    with patch("src.workers.outbox_dispatcher.publish_json_raw", new_callable=AsyncMock, return_value=False):
        await _process_outbox_rows(db, [row])

    db.mark_outbox_event_failed.assert_awaited_once_with("ob-1", "publish_json_raw failed or broker unavailable")
    db.mark_outbox_event_published.assert_not_called()


@pytest.mark.asyncio
async def test_process_rows_marks_published_when_publish_succeeds() -> None:
    row = {
        "id": "ob-2",
        "routing_key": "crm.contractor.registered",
        "payload": {"event_name": "crm.contractor.registered", "payload": {"contractor_id": "c1"}},
    }
    db = AsyncMock()
    db.mark_outbox_event_published = AsyncMock()
    db.mark_outbox_event_failed = AsyncMock()

    with patch("src.workers.outbox_dispatcher.publish_json_raw", new_callable=AsyncMock, return_value=True):
        await _process_outbox_rows(db, [row])

    db.mark_outbox_event_published.assert_awaited_once_with("ob-2")
    db.mark_outbox_event_failed.assert_not_called()
