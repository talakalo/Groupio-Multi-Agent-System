"""Outbox dispatcher branch coverage.

Complements ``test_outbox_dispatcher_failures.py`` (which covers the happy and
unhappy `publish_json_raw` paths) by exercising the remaining branches of
``_process_outbox_rows`` and ``run_loop`` so the module can come off the
coverage omit-list.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.workers.outbox_dispatcher import _process_outbox_rows, run_loop


@pytest.mark.asyncio
async def test_process_rows_parses_string_payload_before_publishing() -> None:
    """Payloads stored as JSON strings (the DB driver sometimes returns them
    that way) must be decoded and published as dicts."""
    row = {
        "id": "ob-str",
        "routing_key": "notifications.send_requested",
        "payload": '{"event_name":"notifications.offer_joined_email","payload":{"to_email":"a@b"}}',
    }
    db = AsyncMock()

    with patch(
        "src.workers.outbox_dispatcher.publish_json_raw",
        new_callable=AsyncMock,
        return_value=True,
    ) as publish:
        await _process_outbox_rows(db, [row])

    publish.assert_awaited_once()
    args, _ = publish.call_args
    assert args[0] == "notifications.send_requested"
    assert isinstance(args[1], dict)
    assert args[1]["event_name"] == "notifications.offer_joined_email"
    db.mark_outbox_event_published.assert_awaited_once_with("ob-str")


@pytest.mark.asyncio
async def test_process_rows_marks_failed_on_invalid_payload_json() -> None:
    """A string payload that cannot be JSON-decoded must not be published —
    ``mark_outbox_event_failed`` records the reason so it is skipped on
    subsequent polls instead of crash-looping."""
    row = {"id": "ob-bad", "routing_key": "rk", "payload": "{not-json"}
    db = AsyncMock()

    with patch(
        "src.workers.outbox_dispatcher.publish_json_raw",
        new_callable=AsyncMock,
    ) as publish:
        await _process_outbox_rows(db, [row])

    publish.assert_not_called()
    db.mark_outbox_event_failed.assert_awaited_once_with("ob-bad", "invalid payload json")
    db.mark_outbox_event_published.assert_not_called()


@pytest.mark.asyncio
async def test_process_rows_publishes_empty_dict_when_payload_missing() -> None:
    """A row with a missing payload should still publish an empty body
    rather than crashing the whole batch."""
    row = {"id": "ob-empty", "routing_key": "rk"}
    db = AsyncMock()

    with patch(
        "src.workers.outbox_dispatcher.publish_json_raw",
        new_callable=AsyncMock,
        return_value=True,
    ) as publish:
        await _process_outbox_rows(db, [row])

    publish.assert_awaited_once_with("rk", {})
    db.mark_outbox_event_published.assert_awaited_once_with("ob-empty")


@pytest.mark.asyncio
async def test_process_rows_handles_non_dict_decoded_payload() -> None:
    """If a string payload JSON-decodes to a non-dict (e.g. a list), the
    publisher must receive an empty dict instead of the unexpected value."""
    row = {"id": "ob-list", "routing_key": "rk", "payload": '[1, 2, 3]'}
    db = AsyncMock()

    with patch(
        "src.workers.outbox_dispatcher.publish_json_raw",
        new_callable=AsyncMock,
        return_value=True,
    ) as publish:
        await _process_outbox_rows(db, [row])

    publish.assert_awaited_once_with("rk", {})
    db.mark_outbox_event_published.assert_awaited_once_with("ob-list")


@pytest.mark.asyncio
async def test_run_loop_exits_immediately_when_outbox_disabled() -> None:
    """`ENABLE_OUTBOX=False` is the safe default in dev; the worker must
    return right away without touching the DB or broker."""
    fake_settings = MagicMock()
    fake_settings.ENABLE_OUTBOX = False

    with patch("src.config.settings.get_settings", return_value=fake_settings), \
         patch("src.workers.outbox_dispatcher.get_postgres_client") as db_getter:
        await run_loop()

    db_getter.assert_not_called()
