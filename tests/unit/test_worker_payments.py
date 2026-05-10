"""Unit tests for ``worker_payments._handle``.

The payments worker is observe-only — it tails payment events from RabbitMQ
for auditing and metrics rather than performing settlement (that lives in the
HTTP routes). Tests here lock in:

  * ``invoices.created`` vs. generic events follow different log branches
  * the Prometheus counter is incremented exactly once per message
  * a missing / malformed payload never raises (the consumer would requeue
    forever if it did)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.workers.worker_payments import _handle, run_consumer


@pytest.mark.asyncio
async def test_invoices_created_branch_logs_invoice_fields(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="src.workers.worker_payments")
    with patch("src.workers.worker_payments.messaging_consumer_messages_total") as metric:
        metric.labels = MagicMock(return_value=MagicMock(inc=MagicMock()))
        await _handle(
            {
                "event_name": "invoices.created",
                "payload": {
                    "invoice_id": "inv-1",
                    "offer_id": "off-1",
                    "user_id": "u-1",
                },
            }
        )

    metric.labels.assert_called_with(worker="payments", result="ok")
    # The log line includes invoice_id; the generic branch uses payment_id.
    assert any("invoice_id=inv-1" in rec.message for rec in caplog.records)


@pytest.mark.asyncio
async def test_generic_event_branch_logs_payment_fields(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="src.workers.worker_payments")
    with patch("src.workers.worker_payments.messaging_consumer_messages_total") as metric:
        metric.labels = MagicMock(return_value=MagicMock(inc=MagicMock()))
        await _handle(
            {
                "event_name": "payments.succeeded",
                "payload": {"payment_id": "pay-1", "offer_id": "off-1"},
            }
        )

    metric.labels.assert_called_with(worker="payments", result="ok")
    assert any("payment_id=pay-1" in rec.message for rec in caplog.records)


@pytest.mark.asyncio
async def test_handle_coerces_non_dict_payload_to_empty() -> None:
    with patch("src.workers.worker_payments.messaging_consumer_messages_total") as metric:
        metric.labels = MagicMock(return_value=MagicMock(inc=MagicMock()))
        # None, string, list are all invalid — the handler must keep going.
        await _handle({"event_name": "payments.succeeded", "payload": "nope"})
        await _handle({"event_name": "payments.succeeded", "payload": None})
        await _handle({"event_name": "payments.succeeded", "payload": [1, 2]})

    assert metric.labels.call_count == 3


@pytest.mark.asyncio
async def test_handle_accepts_missing_payload() -> None:
    with patch("src.workers.worker_payments.messaging_consumer_messages_total") as metric:
        metric.labels = MagicMock(return_value=MagicMock(inc=MagicMock()))
        await _handle({"event_name": "payments.failed"})

    metric.labels.assert_called_with(worker="payments", result="ok")


@pytest.mark.asyncio
async def test_handle_accepts_missing_event_name() -> None:
    # Empty event_name falls through to the generic branch — the worker is
    # lenient about shape, it just records the metric and moves on.
    with patch("src.workers.worker_payments.messaging_consumer_messages_total") as metric:
        metric.labels = MagicMock(return_value=MagicMock(inc=MagicMock()))
        await _handle({"payload": {}})

    metric.labels.assert_called_with(worker="payments", result="ok")


@pytest.mark.asyncio
async def test_run_consumer_exits_when_rabbitmq_disabled() -> None:
    fake_settings = MagicMock()
    fake_settings.ENABLE_RABBITMQ = False
    with patch("src.workers.worker_payments.get_settings", return_value=fake_settings):
        await run_consumer()


@pytest.mark.asyncio
async def test_run_consumer_exits_when_rabbitmq_url_empty() -> None:
    fake_settings = MagicMock()
    fake_settings.ENABLE_RABBITMQ = True
    fake_settings.RABBITMQ_URL = ""
    with patch("src.workers.worker_payments.get_settings", return_value=fake_settings):
        await run_consumer()


def test_main_runs_consumer() -> None:
    import src.workers.worker_payments as mod

    def _close_coro(coro: object) -> None:
        if hasattr(coro, "close"):
            coro.close()  # type: ignore[union-attr]

    with patch.object(mod, "asyncio") as mock_asyncio:
        mock_asyncio.run = MagicMock(side_effect=_close_coro)
        mod.main()

    mock_asyncio.run.assert_called_once()
