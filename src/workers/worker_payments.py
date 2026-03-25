"""Consume payment-derived events (side-effects only — no settlement logic)."""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys
from typing import Any

from src.config.settings import get_settings
from src.messaging import constants as c
from src.messaging.topology import declare_payments_topology
from src.utils.monitoring import messaging_consumer_messages_total

logger = logging.getLogger(__name__)


async def _handle(data: dict[str, Any]) -> None:
    event_name = data.get("event_name") or ""
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    if event_name == "invoices.created":
        logger.info(
            "payments worker: event=%s invoice_id=%s offer_id=%s user_id=%s",
            event_name,
            payload.get("invoice_id"),
            payload.get("offer_id"),
            payload.get("user_id"),
        )
    else:
        logger.info(
            "payments worker: event=%s payment_id=%s offer_id=%s",
            event_name,
            payload.get("payment_id"),
            payload.get("offer_id"),
        )
    messaging_consumer_messages_total.labels(worker="payments", result="ok").inc()


async def run_consumer() -> None:
    settings = get_settings()
    if not settings.ENABLE_RABBITMQ:
        logger.info("worker_payments exiting: ENABLE_RABBITMQ is False")
        return

    url = (settings.RABBITMQ_URL or "").strip()
    if not url:
        logger.error("RABBITMQ_URL empty")
        return

    import aio_pika

    connection = await aio_pika.connect_robust(url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)
    await declare_payments_topology(channel)

    queue = await channel.declare_queue(c.QUEUE_PAYMENTS_EVENTS, durable=True, passive=True)

    running = True

    def _stop(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    logger.info("worker_payments listening on %s", c.QUEUE_PAYMENTS_EVENTS)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            if not running:
                break
            async with message.process(requeue=False):
                try:
                    data = json.loads(message.body.decode("utf-8"))
                    await _handle(data)
                except Exception:
                    messaging_consumer_messages_total.labels(worker="payments", result="error").inc()
                    logger.exception(
                        "payments worker handler failed — message dead-lettered (requeue=False)"
                    )
                    raise

    await connection.close()
    logger.info("worker_payments stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_consumer())


if __name__ == "__main__":
    main()
    sys.exit(0)
