"""Consume CRM projection events and call EspoCRM."""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys
from typing import Any

from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.integrations.espocrm.service import EspoCRMService
from src.messaging import constants as c
from src.messaging.topology import declare_crm_topology
from src.utils.monitoring import messaging_consumer_messages_total

logger = logging.getLogger(__name__)


async def run_consumer() -> None:
    settings = get_settings()
    if not settings.ENABLE_RABBITMQ or not settings.ENABLE_CRM_SYNC:
        logger.info("worker_crm_sync exiting: broker or CRM sync disabled")
        return

    url = (settings.RABBITMQ_URL or "").strip()
    if not url:
        logger.error("RABBITMQ_URL empty")
        return

    import aio_pika

    db = get_postgres_client()
    connection = await aio_pika.connect_robust(url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=5)
    await declare_crm_topology(channel)

    queue = await channel.declare_queue(c.QUEUE_CRM_SYNC, durable=True, passive=True)

    running = True

    def _stop(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    logger.info("worker_crm_sync listening on %s", c.QUEUE_CRM_SYNC)
    svc = EspoCRMService(db)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            if not running:
                break
            async with message.process(requeue=False):
                try:
                    data = json.loads(message.body.decode("utf-8"))
                    await _process_envelope(svc, data)
                except Exception:
                    messaging_consumer_messages_total.labels(worker="crm_sync", result="error").inc()
                    logger.exception("CRM sync consumer failed — message dead-lettered")
                    raise

    await connection.close()
    try:
        await db.close()
    except Exception:
        pass
    logger.info("worker_crm_sync stopped")


async def _process_envelope(svc: EspoCRMService, data: dict[str, Any]) -> None:
    try:
        await svc.handle_envelope(data)
        messaging_consumer_messages_total.labels(worker="crm_sync", result="ok").inc()
    except Exception:
        logger.exception("CRM sync failed for event=%s", data.get("event_name"))
        raise


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_consumer())


if __name__ == "__main__":
    main()
    sys.exit(0)
