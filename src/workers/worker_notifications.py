"""Consume notification jobs from RabbitMQ (email / WhatsApp)."""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys
from typing import Any

from src.config.settings import get_settings
from src.messaging import constants as c
from src.messaging.topology import declare_core_topology
from src.utils.monitoring import messaging_consumer_messages_total

logger = logging.getLogger(__name__)


def _inc(result: str) -> None:
    messaging_consumer_messages_total.labels(worker="notifications", result=result).inc()


async def _dispatch_offer_joined_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_joined_email missing to_email")
        return False
    await email_svc.send_offer_joined(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        current_participants=int(payload.get("current_participants") or 0),
        min_participants=int(payload.get("min_participants") or 0),
        offer_id=payload.get("offer_id") or "",
    )
    return True


async def _dispatch_offer_left_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_left_email missing to_email")
        return False
    await email_svc.send_offer_left(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        offer_id=payload.get("offer_id") or "",
    )
    return True


async def _dispatch_offer_threshold_reached_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_threshold_reached_email missing to_email")
        return False
    await email_svc.send_offer_threshold_reached(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        participants=int(payload.get("participants") or 0),
        discount_percent=int(payload.get("discount_percent") or 0),
        offer_id=payload.get("offer_id") or "",
    )
    return True


async def _dispatch_offer_cancelled_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_cancelled_email missing to_email")
        return False
    await email_svc.send_offer_cancelled(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        reason=payload.get("reason"),
    )
    return True


async def _dispatch_offer_matched_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_matched_email missing to_email")
        return False
    await email_svc.send_offer_matched(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        contractor_name=payload.get("contractor_name") or "",
        offer_id=payload.get("offer_id") or "",
    )
    return True


async def _dispatch_offer_at_risk_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_at_risk_email missing to_email")
        return False
    await email_svc.send_offer_at_risk(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        offer_id=payload.get("offer_id") or "",
        current_count=int(payload.get("current_count") or 0),
        min_count=int(payload.get("min_count") or 0),
    )
    return True


async def _dispatch_offer_approved_email(email_svc: Any, payload: dict[str, Any]) -> bool:
    to_email = payload.get("to_email")
    if not to_email:
        logger.warning("offer_approved_email missing to_email")
        return False
    await email_svc.send_offer_approved(
        to_email=to_email,
        user_name=payload.get("user_name") or "דייר",
        offer_title=payload.get("offer_title") or "",
        offer_id=payload.get("offer_id") or "",
    )
    return True


_EMAIL_DISPATCHERS = {
    "notifications.offer_joined_email": _dispatch_offer_joined_email,
    "notifications.offer_left_email": _dispatch_offer_left_email,
    "notifications.offer_threshold_reached_email": _dispatch_offer_threshold_reached_email,
    "notifications.offer_cancelled_email": _dispatch_offer_cancelled_email,
    "notifications.offer_matched_email": _dispatch_offer_matched_email,
    "notifications.offer_at_risk_email": _dispatch_offer_at_risk_email,
    "notifications.offer_approved_email": _dispatch_offer_approved_email,
}


async def _handle_envelope(data: dict[str, Any]) -> None:
    event_name = data.get("event_name") or ""
    payload = data.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}

    dispatcher = _EMAIL_DISPATCHERS.get(event_name)
    if dispatcher is None:
        logger.warning("Unknown notification event_name=%s", event_name)
        _inc("ignored")
        return

    from src.services.email import get_email_service

    email_svc = get_email_service()
    delivered = await dispatcher(email_svc, payload)
    _inc("ok" if delivered else "ignored")


async def run_consumer() -> None:
    settings = get_settings()
    if not settings.ENABLE_RABBITMQ:
        logger.info("worker_notifications exiting: ENABLE_RABBITMQ is False")
        return

    url = (settings.RABBITMQ_URL or "").strip()
    if not url:
        logger.error("RABBITMQ_URL empty")
        return

    import aio_pika

    connection = await aio_pika.connect_robust(url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)
    await declare_core_topology(channel)

    queue = await channel.declare_queue(
        c.QUEUE_NOTIFICATIONS_DISPATCH,
        durable=True,
        passive=True,
    )

    running = True

    def _stop(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    logger.info("worker_notifications listening on %s", c.QUEUE_NOTIFICATIONS_DISPATCH)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            if not running:
                break
            async with message.process(requeue=False):
                try:
                    raw = message.body.decode("utf-8")
                    data = json.loads(raw)
                    await _handle_envelope(data)
                except Exception:
                    messaging_consumer_messages_total.labels(worker="notifications", result="error").inc()
                    logger.exception("notification handler failed — message to DLQ")
                    raise

    await connection.close()
    logger.info("worker_notifications stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_consumer())


if __name__ == "__main__":
    main()
    sys.exit(0)
