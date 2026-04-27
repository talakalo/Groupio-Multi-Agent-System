"""Unit tests for the `worker_notifications` RabbitMQ consumer dispatch table.

These tests exercise only the pure-Python `_handle_envelope` dispatch logic —
broker + Prometheus metrics are patched out. The goal is to catch the class of
regression that the Groupio release audit found: before the batch-2 fix, every
event type except ``notifications.offer_joined_email`` was silently dropped.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


def _payload() -> dict:
    return {
        "to_email": "r@example.com",
        "user_name": "Dana",
        "offer_title": "Gardening",
        "offer_id": "offer-1",
        "current_participants": 4,
        "min_participants": 6,
        "participants": 8,
        "discount_percent": 10,
        "reason": "not enough joined",
        "contractor_name": "BestGardens Ltd",
        "current_count": 3,
        "min_count": 6,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event_name, email_method",
    [
        ("notifications.offer_joined_email", "send_offer_joined"),
        ("notifications.offer_left_email", "send_offer_left"),
        ("notifications.offer_threshold_reached_email", "send_offer_threshold_reached"),
        ("notifications.offer_cancelled_email", "send_offer_cancelled"),
        ("notifications.offer_matched_email", "send_offer_matched"),
        ("notifications.offer_at_risk_email", "send_offer_at_risk"),
        ("notifications.offer_approved_email", "send_offer_approved"),
    ],
)
async def test_dispatches_each_event_to_matching_email_method(event_name, email_method):
    from src.workers import worker_notifications

    fake_email = AsyncMock()
    fake_email.send_offer_joined = AsyncMock(return_value=True)
    fake_email.send_offer_left = AsyncMock(return_value=True)
    fake_email.send_offer_threshold_reached = AsyncMock(return_value=True)
    fake_email.send_offer_cancelled = AsyncMock(return_value=True)
    fake_email.send_offer_matched = AsyncMock(return_value=True)
    fake_email.send_offer_at_risk = AsyncMock(return_value=True)
    fake_email.send_offer_approved = AsyncMock(return_value=True)

    with patch("src.services.email.get_email_service", return_value=fake_email), \
         patch.object(worker_notifications, "_inc") as mock_inc:
        await worker_notifications._handle_envelope(
            {"event_name": event_name, "payload": _payload()}
        )

    method = getattr(fake_email, email_method)
    assert method.await_count == 1, f"{event_name} did not call {email_method}"
    mock_inc.assert_called_once_with("ok")


@pytest.mark.asyncio
async def test_unknown_event_is_counted_as_ignored_not_dropped_silently():
    from src.workers import worker_notifications

    with patch("src.services.email.get_email_service") as get_svc, \
         patch.object(worker_notifications, "_inc") as mock_inc:
        await worker_notifications._handle_envelope(
            {"event_name": "notifications.something_new", "payload": {}}
        )

    # No email service should be touched when the event is unknown.
    get_svc.assert_not_called()
    mock_inc.assert_called_once_with("ignored")


@pytest.mark.asyncio
async def test_missing_to_email_does_not_raise_and_is_counted_as_ignored():
    from src.workers import worker_notifications

    fake_email = AsyncMock()
    fake_email.send_offer_joined = AsyncMock(return_value=True)

    with patch("src.services.email.get_email_service", return_value=fake_email), \
         patch.object(worker_notifications, "_inc") as mock_inc:
        await worker_notifications._handle_envelope(
            {"event_name": "notifications.offer_joined_email", "payload": {}}
        )

    fake_email.send_offer_joined.assert_not_called()
    mock_inc.assert_called_once_with("ignored")


@pytest.mark.asyncio
async def test_non_dict_payload_is_coerced_to_empty_dict():
    from src.workers import worker_notifications

    with patch("src.services.email.get_email_service") as get_svc, \
         patch.object(worker_notifications, "_inc") as mock_inc:
        # A malformed envelope must never crash the consumer — that would
        # requeue the message into an infinite loop.
        await worker_notifications._handle_envelope(
            {"event_name": "notifications.offer_joined_email", "payload": "not a dict"}
        )

    get_svc.assert_called_once()
    mock_inc.assert_called_once_with("ignored")
